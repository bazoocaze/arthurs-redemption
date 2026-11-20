// Estado do mundo. Arrays paralelos (SoA) por tile — cache friendly e trivial
// de serializar. Índice i = y * w + x.

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
    this.ashT = new Float32Array(n); // segundos como cinza
    this.wet = new Float32Array(n); // segundos restantes de umidade
    this.waterVol = new Float32Array(n); // volume de água no tile

    // Derivados (mantidos por quem muta o grid; ver recount()).
    this.initialLandTiles = n;
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

  /** Recalcula todos os contadores derivados. Barato (9216 tiles). */
  recount() {
    let land = 0;
    let trees = 0;
    let burning = 0;
    let ash = 0;
    let water = 0;
    let waterVol = 0;
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.terrain[i] === TERRAIN.WATER) {
        water++;
        waterVol += this.waterVol[i];
      } else {
        land++;
        if (this.tree[i]) trees++;
      }
      if (this.state[i] === STATE.BURNING) burning++;
      else if (this.state[i] === STATE.ASH) ash++;
    }
    this.initialLandTiles = land;
    this.treeCount = trees;
    this.burningCount = burning;
    this.ashCount = ash;
    this.waterCount = water;
    this.waterTotal = waterVol;
  }

  /** Cobertura de árvores sobre a terra gerada (denominador congelado). */
  coverage() {
    return this.initialLandTiles > 0 ? this.treeCount / this.initialLandTiles : 0;
  }
}
