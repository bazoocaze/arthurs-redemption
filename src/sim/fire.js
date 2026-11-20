// Fogo: ignição, propagação, e o caminho de cada tile até virar cinza.
//
// Duas decisões que sustentam o jogo:
//
// 1. **A chance de propagação vem do R0**, não o contrário. R0 é o número de
//    árvores que um foco consegue acender antes de morrer. Se R0 >= 1 o fogo
//    cresce sozinho e o objetivo de 90% de cobertura fica impossível, porque a
//    floresta que o jogador precisa construir é o combustível. Ver
//    `FIRE_CHANCE` em config.js.
//
// 2. **Determinismo por tick.** Sorteios usam `hash2(tile, tick, seed)`, então
//    a mesma seed + mesma sequência de ticks produz exatamente o mesmo incêndio.
//    Isso torna o fogo testável sem browser (tools/check.mjs).
//
// A simulação nunca varre os 9216 tiles: itera `grid.burningTiles`/`ashTiles`.
import { FIRE, FIRE_CHANCE, WATER } from '../config.js';
import { STATE, TERRAIN } from '../grid.js';
import { hash2 } from '../rng.js';

// 8 vizinhos (inclui diagonais): o fogo "seca" na diagonal e o aceiro de 1 tile
// não é suficiente — é isso que faz o jogador alargar o rio em vez de fazer um
// risco fino.
const NX = [-1, 0, 1, -1, 1, -1, 0, 1];
const NY = [-1, -1, -1, 0, 0, 1, 1, 1];

/** R0 esperado para uma densidade (fração de vizinhos ocupados). */
export function expectedR0(density = 0.9) {
  const occupied = Math.min(FIRE.neighborsAtDense, 8 * density);
  return occupied * FIRE_CHANCE * FIRE.burnTime;
}

/** Remover de uma lista de trabalho trocando pelo último (O(1)). */
function removeAt(list, k) {
  const last = list.length - 1;
  list[k] = list[last];
  list.pop();
}

function isLivingTree(grid, i) {
  return grid.tree[i] === 1 && grid.state[i] === STATE.IDLE;
}

/**
 * Coloca fogo em um tile. Retorna false se não houver o que queimar.
 * A umidade protege: molhado demais não pega (é o aceiro do spray).
 */
export function ignite(grid, x, y, seed = 0) {
  if (!grid.inBounds(x, y)) return false;
  const i = grid.idx(x, y);
  if (!isLivingTree(grid, i)) return false;
  if (grid.terrain[i] === TERRAIN.WATER) return false;
  if (grid.wet[i] > 0.6) return false;

  const hp = FIRE.hpMin + Math.floor(hash2(x, y, seed + 991) * (FIRE.hpMax - FIRE.hpMin + 1));
  grid.state[i] = STATE.BURNING;
  grid.burnT[i] = 0;
  grid.fireHp[i] = hp;
  grid.burningTiles.push(i);
  grid.burningCount++;
  pushEvent(grid, 'ignite', x, y);
  return true;
}

function pushEvent(grid, type, x, y, extra) {
  if (grid.events.length >= 256) return;
  grid.events.push(extra ? { type, x, y, ...extra } : { type, x, y });
}

/** Ignição em disco (usado pelo impacto da bomba em M5 e pelo debug). */
export function igniteRadius(grid, cx, cy, radius, seed = 0) {
  const r2 = radius * radius;
  let lit = 0;
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(grid.w - 1, cx + radius);
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(grid.h - 1, cy + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      if (ignite(grid, x, y, seed)) lit++;
    }
  }
  return lit;
}

/** Molha um tile por `seconds` (proteção contra propagação). */
export function soak(grid, x, y, seconds = FIRE.wetSeconds) {
  if (!grid.inBounds(x, y)) return false;
  const i = grid.idx(x, y);
  if (grid.terrain[i] === TERRAIN.WATER) return false;
  if (grid.wet[i] <= 0) grid.wetTiles.push(i);
  grid.wet[i] = Math.max(grid.wet[i], seconds);
  return true;
}

/**
 * Um tick de simulação de fogo. `dt` é fixo (1/FIRE.tickRate) para manter o
 * resultado determinístico e independente do framerate.
 */
export function stepFire(grid, dt, seed = 0) {
  grid.simTick++;
  const tick = grid.simTick;
  const burning = grid.burningTiles;

  // Fase 1: propagação a partir dos focos que já existiam no início do tick.
  // Coletar antes de acender evita que o fogo "corra" vários tiles no mesmo tick
  // (BFS instantânea) — ele se espalha no máximo 1 vizinho por tick.
  const pending = [];
  const count = burning.length;
  for (let k = 0; k < count; k++) {
    const i = burning[k];
    const x = i % grid.w;
    const y = (i - x) / grid.w;
    for (let n = 0; n < 8; n++) {
      const nx = x + NX[n];
      const ny = y + NY[n];
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.idx(nx, ny);
      if (!isLivingTree(grid, j)) continue;
      // R0 sai direto daqui: sem fator extra, senão a conta documentada mente.
      let p = FIRE_CHANCE * dt;
      if (grid.wet[j] > 0) p *= FIRE.wetSpreadMul;
      if (hash2(j, tick * 8 + n, seed + 5171) < p) pending.push([nx, ny]);
    }
  }

  // Fase 2: envelhecer os focos; quem completou o tempo vira cinza.
  for (let k = 0; k < burning.length; ) {
    const i = burning[k];
    grid.burnT[i] += dt;
    if (grid.burnT[i] >= FIRE.burnTime) {
      toAsh(grid, i);
      removeAt(burning, k);
      continue; // sem k++: o último elemento tomou o lugar
    }
    k++;
  }

  // Fase 3: acender o que a fase 1 aprovou. `ignite` pode falhar (o tile já
  // queimou neste tick por outro foco) — sem problema.
  for (let k = 0; k < pending.length; k++) {
    ignite(grid, pending[k][0], pending[k][1], seed);
  }

  // Fase 4: cinza decai -> terra replantável.
  const ash = grid.ashTiles;
  for (let k = 0; k < ash.length; ) {
    const i = ash[k];
    grid.ashT[i] += dt;
    if (grid.ashT[i] >= FIRE.ashSeconds) {
      grid.state[i] = STATE.IDLE;
      grid.ashT[i] = 0;
      grid.ashCount--;
      removeAt(ash, k);
      continue;
    }
    k++;
  }

  // Fase 5: umidade seca (lista de trabalho: só tiles molhados).
  const wetList = grid.wetTiles;
  for (let k = 0; k < wetList.length; ) {
    const i = wetList[k];
    grid.wet[i] -= dt;
    if (grid.wet[i] <= 0) {
      grid.wet[i] = 0;
      removeAt(wetList, k);
      continue;
    }
    k++;
  }

  return burning.length;
}

/** Árvore consumida -> cinza. */
function toAsh(grid, i) {
  grid.state[i] = STATE.ASH;
  grid.ashT[i] = 0;
  grid.fireHp[i] = 0;
  grid.burnT[i] = 0;
  if (grid.tree[i] === 1) {
    grid.tree[i] = 0;
    grid.treeCount--;
  }
  grid.burningCount--;
  grid.ashCount++;
  grid.ashTiles.push(i);
  const ax = i % grid.w;
  pushEvent(grid, 'ash', ax, (i - ax) / grid.w);
}

/**
 * Aplica spray em um tile. Retorna o custo em volume (0 = sem efeito).
 * Regras:
 *   - foco aceso: reduz fireHp; ao chegar a 0 a árvore é SALVA (não vira cinza)
 *   - árvore sã/terra: só molha (aceiro)
 *   - água/cinza: nada
 * Custo cresce com a distância do rio (transporte), igual pintar água.
 */
export function sprayTile(grid, x, y, seed = 0) {
  if (!grid.inBounds(x, y)) return 0;
  const i = grid.idx(x, y);
  if (grid.terrain[i] === TERRAIN.WATER) return 0;

  const burning = grid.state[i] === STATE.BURNING;
  const alreadyWet = grid.wet[i] > FIRE.wetSeconds * 0.5;
  if (!burning && alreadyWet) return 0; // não cobra duas vezes pelo mesmo aceiro
  if (!burning && grid.state[i] === STATE.ASH) return 0;

  const cost = sprayCost(grid, i);
  if (grid.waterTotal < cost) return 0;

  // Debita do rio mais próximo (mesma política da pintura).
  debit(grid, i, cost);

  soak(grid, x, y);
  pushEvent(grid, 'spray', x, y);
  if (burning) {
    grid.fireHp[i] = grid.fireHp[i] > 1 ? grid.fireHp[i] - 1 : 0;
    if (grid.fireHp[i] === 0) extinguish(grid, i);
  }
  return cost;
}

function sprayCost(grid, i) {
  const raw = grid.distToWater[i];
  const d = raw < 1 ? 1 : raw;
  return Math.min(WATER.sprayMaxCost, WATER.sprayCost * (1 + (d - 1) * WATER.sprayDistFactor));
}

function debit(grid, tileIndex, amount) {
  let need = amount;
  const src = grid.waterSource[tileIndex];
  if (src >= 0 && grid.waterVol[src] > 0) {
    const take = Math.min(need, grid.waterVol[src]);
    grid.waterVol[src] -= take;
    grid.waterTotal -= take;
    need -= take;
  }
  for (let k = 0; k < grid.waterTiles.length && need > 0; k++) {
    const j = grid.waterTiles[k];
    const v = grid.waterVol[j];
    if (v <= 0.0001) continue;
    const take = Math.min(need, v);
    grid.waterVol[j] -= take;
    grid.waterTotal -= take;
    need -= take;
  }
}

/** Debelado: a árvore sobrevive. */
export function extinguish(grid, i) {
  if (grid.state[i] !== STATE.BURNING) return false;
  grid.state[i] = STATE.IDLE;
  grid.burnT[i] = 0;
  grid.fireHp[i] = 0;
  grid.burningCount--;
  const k = grid.burningTiles.indexOf(i);
  if (k >= 0) removeAt(grid.burningTiles, k);
  const x = i % grid.w;
  pushEvent(grid, 'extinguish', x, (i - x) / grid.w);
  return true;
}

/** Spray em disco (uma estampada do pincel). Retorna volume gasto. */
export function sprayBrush(grid, cx, cy, radius, seed = 0) {
  const r2 = radius * radius;
  let spent = 0;
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(grid.w - 1, cx + radius);
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(grid.h - 1, cy + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      spent += sprayTile(grid, x, y, seed);
    }
  }
  return spent;
}
