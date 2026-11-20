// Estado do mundo. Arrays paralelos (SoA) por tile — cache friendly e trivial
// de serializar. Índice i = y * w + x.
//
// Contadores: mantidos INCREMENTALMENTE pelas mutações (ver sim/paint.js e
// sim/fire.js). `recount()` existe para verificação em testes/debug.

export const TERRAIN = { DIRT: 0, WATER: 1 };
export const STATE = { IDLE: 0, BURNING: 1, ASH: 2 };

export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.terrain = new Uint8Array(n); // 0 terra, 1 água
    this.tree = new Uint8Array(n); // 0 vazio, 1 árvore
    this.species = new Uint8Array(n); // índice da espécie
    this.state = new Uint8Array(n); // 0 idle, 1 queimando, 2 cinza
    this.tone = new Uint8Array(n); // variação de tom da terra (render)
    this.fireHp = new Uint8Array(n); // aplicações de água restantes
    this.burnT = new Float32Array(n); // segundos queimando
    this.ashT = new Float32Array(n); // segundos como cinza
    this.wet = new Float32Array(n); // segundos restantes de umidade
    this.waterVol = new Float32Array(n); // volume de água no tile

    // Distância até a água NATURAL (rios gerados), por BFS. Fica congelada:
    // pintar lago não encurta o caminho — é o que impede o exploit do fosso.
    this.distToWater = new Int16Array(n).fill(-1);
    this.waterSource = new Int32Array(n).fill(-1); // tile de rio mais próximo

    this.waterTiles = []; // índices de tiles com água (para drenar)
    // Listas de trabalho do fogo: a simulação itera só o que está ativo, nunca
    // os 9216 tiles. Mantidas por sim/fire.js com swap-remove.
    this.burningTiles = [];
    this.ashTiles = [];
    this.wetTiles = [];
    this.simTick = 0; // contador de ticks (entra no hash => determinístico)
    // Eventos da simulação para a camada visual (vapor, respingo, explosão).
    // A sim não conhece canvas: ela empurra {type,x,y}, o main drena e o render
    // transforma em partícula. Teto evita crescimento se ninguém drenar.
    this.events = [];

    // Derivados.
    this.landTotal = 0; // denominador congelado da cobertura
    this.landTiles = 0; // terra atual
    this.treeCount = 0;
    this.burningCount = 0;
    this.ashCount = 0;
    this.waterCount = 0;
    this.waterTotal = 0;
  }

  idx(x, y) {
    return y * this.w + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Recalcula todos os contadores derivados (não toca em `landTotal`). */
  recount() {
    let land = 0;
    let trees = 0;
    let burning = 0;
    let ash = 0;
    let water = 0;
    let waterVol = 0;
    this.waterTiles.length = 0;
    this.burningTiles.length = 0;
    this.ashTiles.length = 0;
    this.wetTiles.length = 0;
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.terrain[i] === TERRAIN.WATER) {
        water++;
        waterVol += this.waterVol[i];
        this.waterTiles.push(i);
      } else {
        land++;
        if (this.tree[i]) trees++;
      }
      if (this.state[i] === STATE.BURNING) {
        burning++;
        this.burningTiles.push(i);
      } else if (this.state[i] === STATE.ASH) {
        ash++;
        this.ashTiles.push(i);
      }
      if (this.wet[i] > 0) this.wetTiles.push(i);
    }
    this.landTiles = land;
    this.treeCount = trees;
    this.burningCount = burning;
    this.ashCount = ash;
    this.waterCount = water;
    this.waterTotal = waterVol;
  }

  /** Congela o denominador da cobertura (chamar uma vez após a geração). */
  freezeLandTotal() {
    this.landTotal = this.landTiles;
  }

  /** Cobertura de árvores sobre a terra gerada. */
  coverage() {
    return this.landTotal > 0 ? this.treeCount / this.landTotal : 0;
  }
}
