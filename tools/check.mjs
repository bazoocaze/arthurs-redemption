#!/usr/bin/env node
// Testes de sanidade sem browser: matemática iso, gerador, modelo de dados.
// Uso: node tools/check.mjs
import { TILE_W, TILE_H, GRID_W, GRID_H, WORLD_W, WORLD_H, GEN } from '../src/config.js';
import { tileWorldX, tileWorldY, tileCenterY, worldToTile } from '../src/iso.js';
import { generateWorld } from '../src/generator.js';
import { Grid, TERRAIN, STATE } from '../src/grid.js';
import { mulberry32, hash2 } from '../src/rng.js';
import { plantTree, paintWaterTile, waterPaintCost, applyBrush, strokePath, canPlant } from '../src/sim/paint.js';
import { groveSizeAt, blockMatches } from '../src/grove.js';
import { WATER, FIRE, FIRE_CHANCE } from '../src/config.js';
import {
  ignite, igniteRadius, stepFire, soak, sprayTile, sprayBrush, extinguish, expectedR0,
} from '../src/sim/fire.js';
import {
  createBombs, updateBombs, launchEvent, pickTarget, pickRandom, pickForest, bombsForEvent, dropBomb,
} from '../src/sim/bombs.js';
import { encodeState, saveGame, readSave, clearSave, SAVE_KEY } from '../src/save.js';
import {
  PHASE, createGame, checkEnd, endGame, computeScore, gradeFor, updateRecords, loadRecords,
} from '../src/game.js';
import { BOMB } from '../src/config.js';

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const roundtrip = (tx, ty) => worldToTile(tileWorldX(tx, ty), tileCenterY(tx, ty));
const same = (a, b) => a.x === b.x && a.y === b.y;

console.log('iso');
check('roundtrip no centro de todos os tiles', () => {
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = roundtrip(x, y);
      assert(same(t, { x, y }), `tile ${x},${y} virou ${t.x},${t.y}`);
    }
  }
});
check('roundtrip em pontos próximos das bordas do losango', () => {
  const rng = mulberry32(99);
  for (let n = 0; n < 4000; n++) {
    const x = Math.floor(rng() * GRID_W);
    const y = Math.floor(rng() * GRID_H);
    const a = 0.02 + rng() * 0.96; // coordenadas baricêntricas dentro do losango
    const b = 0.02 + rng() * 0.96;
    const wx = tileWorldX(x, y) + a * (TILE_W / 2) - b * (TILE_W / 2);
    const wy = tileWorldY(x, y) + (a + b) * (TILE_H / 2);
    const t = worldToTile(wx, wy);
    assert(same(t, { x, y }), `ponto (${a.toFixed(2)},${b.toFixed(2)}) do tile ${x},${y} virou ${t.x},${t.y}`);
  }
});
check('mundo cabe na caixa envolvente', () => {
  assert(WORLD_W === ((GRID_W + GRID_H - 2) * TILE_W) / 2 + TILE_W, `WORLD_W=${WORLD_W}`);
  assert(WORLD_H === ((GRID_W + GRID_H - 2) * TILE_H) / 2 + TILE_H, `WORLD_H=${WORLD_H}`);
  assert(tileWorldX(0, GRID_H - 1) === 0, 'borda esquerda do mundo deveria ser 0');
});

console.log('gerador');
const a = generateWorld(1234);
const b = generateWorld(1234);
const c = generateWorld(4321);
check('determinístico por seed', () => {
  for (let i = 0; i < a.grid.terrain.length; i++) {
    assert(a.grid.terrain[i] === b.grid.terrain[i], `divergiu em ${i}`);
  }
  let diff = 0;
  for (let i = 0; i < a.grid.terrain.length; i++) if (a.grid.terrain[i] !== c.grid.terrain[i]) diff++;
  assert(diff > 100, 'seeds diferentes deveriam dar mapas diferentes');
});
check('conta tiles e volume de água', () => {
  const g = a.grid;
  assert(g.landTiles + g.waterCount === GRID_W * GRID_H, 'land+water != total');
  assert(g.waterCount > 0, 'nenhum rio gerado');
  assert(
    Math.abs(g.waterTotal - g.waterCount * GEN.waterVolumePerTile) < 1e-6,
    `volume ${g.waterTotal} != ${g.waterCount} * ${GEN.waterVolumePerTile}`,
  );
});
check('rios atravessam o mapa', () => {
  const g = a.grid;
  let minX = 1e9;
  let maxX = -1e9;
  let minY = 1e9;
  let maxY = -1e9;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.terrain[g.idx(x, y)] !== TERRAIN.WATER) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const spanX = (maxX - minX) / g.w;
  const spanY = (maxY - minY) / g.h;
  assert(Math.max(spanX, spanY) > 0.6, `rio curto: span ${spanX.toFixed(2)}x${spanY.toFixed(2)}`);
});
check('nenhum tile queimando/cinza no boot', () => {
  const g = a.grid;
  for (let i = 0; i < g.state.length; i++) assert(g.state[i] === STATE.IDLE, `estado ${g.state[i]} em ${i}`);
});

console.log('campo de água (BFS)');
check('distância 0 na água, 1 na terra encostada', () => {
  const g = a.grid;
  let riverTile = -1;
  for (let i = 0; i < g.terrain.length; i++) if (g.terrain[i] === TERRAIN.WATER) { riverTile = i; break; }
  assert(g.distToWater[riverTile] === 0, 'tile de rio deveria ter distância 0');
  assert(g.waterSource[riverTile] === riverTile, 'tile de rio deveria apontar para si mesmo');
  let adjacent = -1;
  for (let i = 0; i < g.terrain.length; i++) if (g.terrain[i] === TERRAIN.DIRT && g.distToWater[i] === 1) { adjacent = i; break; }
  assert(adjacent >= 0, 'nenhum tile de terra encostado em rio');
  const src = g.waterSource[adjacent];
  assert(g.terrain[src] === TERRAIN.WATER, 'waterSource deveria apontar para água');
  assert(waterPaintCost(g, adjacent % g.w, (adjacent / g.w) | 0) === WATER.paintBase, 'custo encostado no rio deveria ser paintBase');
});
check('custo cresce com a distância', () => {
  const g = a.grid;
  let d1 = -1;
  let d5 = -1;
  for (let i = 0; i < g.distToWater.length; i++) {
    if (g.terrain[i] !== TERRAIN.DIRT) continue;
    if (g.distToWater[i] === 1 && d1 < 0) d1 = i;
    if (g.distToWater[i] === 5 && d5 < 0) d5 = i;
  }
  assert(d1 >= 0 && d5 >= 0, 'faltou amostra de distância 1 ou 5');
  const c1 = waterPaintCost(g, d1 % g.w, (d1 / g.w) | 0);
  const c5 = waterPaintCost(g, d5 % g.w, (d5 / g.w) | 0);
  assert(c1 === WATER.paintBase, `custo dist 1 = ${c1}`);
  assert(c5 === WATER.paintBase * (1 + 4 * WATER.paintDistFactor), `custo dist 5 = ${c5}`);
});

console.log('pintura');
const w = generateWorld(777);
const g = w.grid;
const firstDirt = () => {
  for (let i = 0; i < g.terrain.length; i++) if (g.terrain[i] === TERRAIN.DIRT && g.distToWater[i] === 1) return i;
  return -1;
};
check('planta em terra e recusa água/repetido', () => {
  const i = firstDirt();
  const x = i % g.w;
  const y = (i / g.w) | 0;
  const before = g.treeCount;
  assert(plantTree(g, x, y, 1) === true, 'deveria plantar');
  assert(g.treeCount === before + 1, 'treeCount não incrementou');
  assert(plantTree(g, x, y, 1) === false, 'não deveria plantar sobre árvore');
  let waterTile = -1;
  for (let k = 0; k < g.terrain.length; k++) if (g.terrain[k] === TERRAIN.WATER) { waterTile = k; break; }
  assert(plantTree(g, waterTile % g.w, (waterTile / g.w) | 0, 1) === false, 'não deveria plantar na água');
  assert(canPlant(g, -1, -1) === false, 'fora do mapa deveria ser inválido');
});
check('denominador da cobertura fica congelado ao alagar', () => {
  const landTotal = g.landTotal;
  const landTiles = g.landTiles;
  const vol = g.waterTotal;
  const i = g.idx(3, 3);
  g.terrain[i] = TERRAIN.DIRT;
  g.tree[i] = 0;
  g.state[i] = STATE.IDLE;
  const cost = paintWaterTile(g, 3, 3);
  assert(cost > 0, 'deveria alagar');
  assert(g.landTotal === landTotal, `landTotal mudou: ${landTotal} -> ${g.landTotal}`);
  assert(g.landTiles === landTiles - 1, 'landTiles deveria cair 1');
  assert(Math.abs(g.waterTotal - (vol - cost + WATER.pondVolume)) < 1e-6, 'balanço de volume errado');
  assert(g.waterVol[i] === WATER.pondVolume, 'volume do lago errado');
});
check('não alaga sem água no reservatório', () => {
  const g2 = generateWorld(888).grid;
  for (let i = 0; i < g2.waterVol.length; i++) g2.waterVol[i] = 0;
  g2.waterTotal = 0;
  const before = g2.waterCount;
  const cost = paintWaterTile(g2, 3, 3);
  assert(cost === 0, 'não deveria conseguir alagar sem água');
  assert(g2.waterCount === before, 'waterCount não deveria mudar');
});
check('contadores incrementais batem com recount()', () => {
  const g3 = generateWorld(4242).grid;
  const rng = mulberry32(31);
  for (let n = 0; n < 400; n++) {
    const x = Math.floor(rng() * g3.w);
    const y = Math.floor(rng() * g3.h);
    applyBrush(g3, x, y, 2, rng() < 0.75 ? 'tree' : 'water', 5);
  }
  const inc = { tree: g3.treeCount, land: g3.landTiles, water: g3.waterCount, vol: g3.waterTotal };
  g3.recount();
  assert(g3.treeCount === inc.tree, `treeCount ${inc.tree} != ${g3.treeCount}`);
  assert(g3.landTiles === inc.land, `landTiles ${inc.land} != ${g3.landTiles}`);
  assert(g3.waterCount === inc.water, `waterCount ${inc.water} != ${g3.waterCount}`);
  assert(Math.abs(g3.waterTotal - inc.vol) < 1e-3, `waterTotal ${inc.vol} != ${g3.waterTotal}`);
});

console.log('groves');
check('3x3 da mesma espécie vira grove 3', () => {
  const g4 = generateWorld(55).grid;
  for (let y = 0; y < g4.h; y++) for (let x = 0; x < g4.w; x++) {
    const i = g4.idx(x, y);
    g4.terrain[i] = TERRAIN.DIRT;
    g4.tree[i] = 0;
    g4.state[i] = STATE.IDLE;
  }
  for (let y = 10; y < 13; y++) for (let x = 10; x < 13; x++) {
    const i = g4.idx(x, y);
    g4.tree[i] = 1;
    g4.species[i] = 1;
  }
  assert(groveSizeAt(g4, 10, 10, 3) === 3, `esperava 3, veio ${groveSizeAt(g4, 10, 10, 3)}`);
  // (11,11) ainda casa um bloco 2x2, mas o scan guloso já o consumiu no anchor (10,10).
  assert(groveSizeAt(g4, 11, 11, 3) === 2, 'canto interno deveria casar 2x2');
  assert(blockMatches(g4, 10, 10, 3, 1) === true, 'bloco deveria casar');
  g4.species[g4.idx(12, 12)] = 2;
  assert(groveSizeAt(g4, 10, 10, 3) === 2, 'espécie diferente deveria reduzir para 2');
  assert(groveSizeAt(g4, 50, 50, 3) === 0, 'tile vazio deveria ser 0');
});

console.log('traço');
check('strokePath cobre a linha sem repetir o início', () => {
  const path = strokePath({ x: 0, y: 0 }, { x: 4, y: 0 });
  assert(path.length === 4, `esperava 4 passos, veio ${path.length}`);
  assert(path[3].x === 4 && path[3].y === 0, 'não chegou no destino');
  const diag = strokePath({ x: 0, y: 0 }, { x: 3, y: 3 });
  assert(diag.length === 3 && diag[2].x === 3 && diag[2].y === 3, 'diagonal errada');
});


console.log('fogo — balanceamento');
check('R0 alvo fica abaixo de 1 na densidade de 90%', () => {
  const r0 = expectedR0(0.9);
  assert(r0 < 1, `R0 ${r0.toFixed(3)} deveria ser < 1`);
  assert(r0 > 0.5, `R0 ${r0.toFixed(3)} baixo demais: fogo nunca ameaça`);
});
check('R0 cresce com a densidade e continua < 1 em 100%', () => {
  const sparse = expectedR0(0.3);
  const dense = expectedR0(1);
  assert(dense > sparse, 'denso deveria ter R0 maior');
  assert(dense < 1.05, `R0 em densidade total ${dense.toFixed(3)} passou do limite`);
});
check('chance derivada bate com FIRE_CHANCE', () => {
  const esperado = FIRE.r0Target / (FIRE.neighborsAtDense * FIRE.burnTime);
  assert(Math.abs(FIRE_CHANCE - esperado) < 1e-12, 'FIRE_CHANCE fora da fórmula');
});

/** Grade pequena isolada: só serve para testar fogo, sem rios nem tons. */
function fireGrid(w = 24, h = 24) {
  const g = new Grid(w, h);
  g.terrain.fill(TERRAIN.DIRT);
  g.tone.fill(0);
  for (let i = 0; i < g.distToWater.length; i++) {
    g.distToWater[i] = 1;
    g.waterSource[i] = -1;
  }
  g.landTiles = w * h;
  g.landTotal = w * h;
  return g;
}

function fillTrees(g, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = g.idx(x, y);
      if (g.terrain[i] !== TERRAIN.DIRT) continue;
      g.tree[i] = 1;
      g.species[i] = (x + y) % 4;
      g.state[i] = STATE.IDLE;
      g.treeCount++;
    }
  }
}

check('ignite acende árvore sã e atualiza contadores', () => {
  const g = fireGrid();
  fillTrees(g, 5, 5, 15, 15);
  assert(ignite(g, 10, 10, 1) === true, 'deveria acender');
  assert(g.state[g.idx(10, 10)] === STATE.BURNING, 'estado não virou BURNING');
  assert(g.burningCount === 1, `burningCount ${g.burningCount}`);
  assert(g.burningTiles.length === 1, 'lista de focos desincronizada');
  assert(g.fireHp[g.idx(10, 10)] >= FIRE.hpMin, 'fireHp abaixo do mínimo');
});
check('ignite não pega terra vazia, água nem cinza', () => {
  const g = fireGrid();
  fillTrees(g, 5, 5, 8, 8);
  assert(ignite(g, 20, 20, 1) === false, 'terra vazia não deveria pegar');
  g.terrain[g.idx(6, 6)] = TERRAIN.WATER;
  g.tree[g.idx(6, 6)] = 0;
  assert(ignite(g, 6, 6, 1) === false, 'água não deveria pegar');
  g.state[g.idx(7, 7)] = STATE.ASH;
  g.tree[g.idx(7, 7)] = 0;
  assert(ignite(g, 7, 7, 1) === false, 'cinza não deveria pegar');
});

console.log('fogo — propagação');
check('fogo não atravessa tile de água', () => {
  const g = fireGrid();
  fillTrees(g, 5, 5, 25, 25);
  // muralha de água separando 10,10 de 12,10
  for (let y = 0; y < g.h; y++) {
    const i = g.idx(11, y);
    g.terrain[i] = TERRAIN.WATER;
    g.tree[i] = 0;
  }
  ignite(g, 10, 10, 7);
  for (let t = 0; t < 600; t++) stepFire(g, 1 / FIRE.tickRate, 7);
  assert(g.state[g.idx(10, 10)] === STATE.ASH, 'lado de cá deveria ter queimado');
  let queimouDoOutroLado = false;
  for (let y = 0; y < g.h; y++) if (g.state[g.idx(12, y)] !== STATE.IDLE) queimouDoOutroLado = true;
  assert(!queimouDoOutroLado, 'fogo atravessou a água');
});
check('incêndio grande termina em cinza sem sobrar foco', () => {
  const g = fireGrid(32, 32);
  fillTrees(g, 2, 2, 29, 29);
  igniteRadius(g, 16, 16, 2, 3);
  const inicial = g.burningCount;
  assert(inicial > 0, 'nenhum foco acendeu');
  for (let t = 0; t < 2000 && g.burningCount > 0; t++) stepFire(g, 1 / FIRE.tickRate, 3);
  assert(g.burningCount === 0, `sobraram ${g.burningCount} focos`);
  assert(g.ashCount > inicial, 'cinza deveria ter crescido');
  assert(g.treeCount + g.ashCount === 28 * 28, `soma quebrada: ${g.treeCount}+${g.ashCount}`);
});
check('R0 < 1 na prática: foco isolado não devasta a floresta', () => {
  const g = fireGrid(48, 48);
  fillTrees(g, 1, 1, 46, 46);
  const total = g.treeCount;
  ignite(g, 24, 24, 11);
  for (let t = 0; t < 4000 && g.burningCount > 0; t++) stepFire(g, 1 / FIRE.tickRate, 11);
  const queimado = total - g.treeCount;
  const frac = queimado / total;
  assert(frac < 0.5, `fogo consumiu ${(frac * 100).toFixed(0)}% da floresta com R0 < 1`);
  assert(queimado > 1, 'fogo não se espalhou nada (R0 baixo demais)');
});
check('umidade bloqueia a propagação (aceiro de spray)', () => {
  const g = fireGrid(24, 24);
  fillTrees(g, 4, 4, 20, 20);
  for (let y = 0; y < g.h; y++) soak(g, 12, y, 9999);
  ignite(g, 8, 12, 5);
  for (let t = 0; t < 1500; t++) stepFire(g, 1 / FIRE.tickRate, 5);
  for (let y = 0; y < g.h; y++) {
    const j = g.idx(13, y);
    if (g.terrain[j] !== TERRAIN.DIRT) continue;
    assert(g.state[j] === STATE.IDLE, `fogo passou pelo aceiro em 13,${y}`);
  }
});
check('mesma seed + mesmos ticks = mesmo incêndio', () => {
  const run = () => {
    const g = fireGrid(24, 24);
    fillTrees(g, 2, 2, 21, 21);
    igniteRadius(g, 12, 12, 2, 9);
    for (let t = 0; t < 400; t++) stepFire(g, 1 / FIRE.tickRate, 9);
    return Array.from(g.state).join('');
  };
  assert(run() === run(), 'simulação de fogo não é determinística');
});

console.log('fogo — água e cinzas');
check('spray reduz fireHp e apaga salvando a árvore', () => {
  const g = fireGrid();
  fillTrees(g, 5, 5, 15, 15);
  g.waterVol[g.idx(0, 0)] = 100;
  g.waterTotal = 100;
  g.waterTiles.push(g.idx(0, 0));
  g.simTick = 0;
  const i = g.idx(10, 10);
  ignite(g, 10, 10, 1);
  const hp = g.fireHp[i];
  for (let k = 0; k < hp; k++) assert(sprayTile(g, 10, 10, 1) > 0, 'spray deveria cobrar');
  assert(g.state[i] === STATE.IDLE, 'foco deveria estar apagado');
  assert(g.tree[i] === 1, 'árvore deveria ter sido salva');
  assert(g.burningCount === 0, `burningCount ${g.burningCount}`);
});
check('spray em foco com pouca água não faz efeito', () => {
  const g = fireGrid();
  fillTrees(g, 5, 5, 15, 15);
  g.waterTotal = 0;
  g.waterVol.fill(0);
  ignite(g, 10, 10, 1);
  assert(sprayTile(g, 10, 10, 1) === 0, 'não deveria cobrar sem água');
  assert(g.state[g.idx(10, 10)] === STATE.BURNING, 'não deveria apagar');
});
check('spray custa mais longe do rio', () => {
  const g = fireGrid();
  fillTrees(g, 2, 2, 21, 21);
  g.waterTotal = 1000;
  g.waterVol[g.idx(0, 0)] = 1000;
  g.waterTiles.push(g.idx(0, 0));
  g.distToWater[g.idx(3, 3)] = 1;
  g.distToWater[g.idx(20, 20)] = 18;
  const perto = sprayTile(g, 3, 3, 1);
  const longe = sprayTile(g, 20, 20, 1);
  assert(perto === WATER.sprayCost, `perto ${perto} != ${WATER.sprayCost}`);
  assert(longe > perto, `longe ${longe} deveria custar mais que perto ${perto}`);
  assert(longe <= WATER.sprayMaxCost, `longe ${longe} estourou o teto`);
});
check('spray não cobra duas vezes pelo mesmo aceiro', () => {
  const g = fireGrid();
  fillTrees(g, 5, 5, 15, 15);
  g.waterTotal = 100;
  g.waterVol[g.idx(0, 0)] = 100;
  g.waterTiles.push(g.idx(0, 0));
  const primeiro = sprayBrush(g, 10, 10, 1, 1);
  const segundo = sprayBrush(g, 10, 10, 1, 1);
  assert(primeiro > 0, 'primeiro spray deveria custar');
  assert(segundo === 0, `segundo spray cobrou ${segundo} de novo`);
});
check('cinza decai para terra replantável', () => {
  const g = fireGrid();
  fillTrees(g, 5, 5, 15, 15);
  const i = g.idx(10, 10);
  ignite(g, 10, 10, 1);
  for (let t = 0; t < FIRE.burnTime * FIRE.tickRate + 2; t++) stepFire(g, 1 / FIRE.tickRate, 1);
  assert(g.state[i] === STATE.ASH, 'deveria ser cinza após burnTime');
  assert(g.treeCount === 120, `treeCount ${g.treeCount}`);
  assert(canPlant(g, 10, 10) === false, 'cinza não deveria ser plantável ainda');
  const ticks = Math.ceil(FIRE.ashSeconds * FIRE.tickRate) + 2;
  for (let t = 0; t < ticks; t++) stepFire(g, 1 / FIRE.tickRate, 1);
  assert(g.state[i] === STATE.IDLE, 'cinza deveria ter decaído');
  assert(canPlant(g, 10, 10) === true, 'deveria ser replantável');
});
check('contadores incrementais batem com recount() após um incêndio', () => {
  const g = fireGrid(32, 32);
  fillTrees(g, 2, 2, 29, 29);
  igniteRadius(g, 16, 16, 2, 21);
  for (let t = 0; t < 900; t++) stepFire(g, 1 / FIRE.tickRate, 21);
  const antes = { tree: g.treeCount, burning: g.burningCount, ash: g.ashCount };
  g.recount();
  assert(g.treeCount === antes.tree, `treeCount ${antes.tree} -> ${g.treeCount}`);
  assert(g.burningCount === antes.burning, `burningCount ${antes.burning} -> ${g.burningCount}`);
  assert(g.ashCount === antes.ash, `ashCount ${antes.ash} -> ${g.ashCount}`);
  assert(g.burningTiles.length === g.burningCount, 'lista de focos fora de sincronia');
  assert(g.ashTiles.length === g.ashCount, 'lista de cinza fora de sincronia');
});
check('umidade seca depois de wetSeconds', () => {
  const g = fireGrid();
  fillTrees(g, 5, 5, 8, 8);
  soak(g, 6, 6, FIRE.wetSeconds);
  assert(g.wet[g.idx(6, 6)] > 0, 'deveria estar molhado');
  const ticks = Math.ceil(FIRE.wetSeconds * FIRE.tickRate) + 2;
  for (let t = 0; t < ticks; t++) stepFire(g, 1 / FIRE.tickRate, 1);
  assert(g.wet[g.idx(6, 6)] === 0, 'umidade deveria ter secado');
  assert(g.wetTiles.length === 0, 'lista de molhados deveria estar vazia');
});


console.log('bombardeio');
check('bombas por evento: 1 + 1 por minuto, com teto', () => {
  assert(bombsForEvent(0) === 1, `t=0 -> ${bombsForEvent(0)}`);
  assert(bombsForEvent(59) === 1, `t=59 -> ${bombsForEvent(59)}`);
  assert(bombsForEvent(60) === 2, `t=60 -> ${bombsForEvent(60)}`);
  assert(bombsForEvent(240) === 5, `t=240 -> ${bombsForEvent(240)}`);
  assert(bombsForEvent(9999) === BOMB.maxPerEvent, `teto ${bombsForEvent(9999)}`);
});
check('alvo nunca cai na água', () => {
  const g = fireGrid(32, 32);
  fillTrees(g, 2, 2, 29, 29);
  // rio vertical
  for (let y = 0; y < g.h; y++) {
    for (let x = 15; x < 18; x++) {
      const i = g.idx(x, y);
      g.terrain[i] = TERRAIN.WATER;
      g.tree[i] = 0;
    }
  }
  const b = createBombs(77);
  for (let k = 0; k < 40; k++) {
    const t = pickTarget(b, g);
    assert(t, 'deveria achar alvo em terra');
    assert(g.terrain[g.idx(t.x, t.y)] !== TERRAIN.WATER, `alvo na água em ${t.x},${t.y}`);
  }
});
check('alvo: metade aleatório, metade mira floresta', () => {
  const g = fireGrid(32, 32);
  fillTrees(g, 2, 2, 29, 29);
  // metade direita vazia
  for (let y = 0; y < g.h; y++) for (let x = 16; x < g.w; x++) g.tree[g.idx(x, y)] = 0;
  g.treeCount = 0;
  g.recount();

  const b = createBombs(123);
  const N = 400;
  let naFloresta = 0;
  for (let k = 0; k < N; k++) {
    const t = pickTarget(b, g);
    if (g.tree[g.idx(t.x, t.y)] === 1) naFloresta++;
  }
  const frac = naFloresta / N;
  // metade aleatória acerta ~50% (mapa meio a meio); metade mirando floresta ~85%.
  // Esperado ~0,67. Banda larga porque é estatística.
  assert(frac > 0.5 && frac < 0.85, `${(frac * 100).toFixed(0)}% dos alvos em floresta (esperado ~67%)`);
});
check('modo floresta acerta bem mais que o aleatório', () => {
  const g = fireGrid(32, 32);
  fillTrees(g, 2, 2, 29, 29);
  for (let y = 0; y < g.h; y++) for (let x = 16; x < g.w; x++) g.tree[g.idx(x, y)] = 0;
  g.treeCount = 0;
  g.recount();
  const b = createBombs(31);
  const N = 200;
  let f = 0;
  let r = 0;
  for (let k = 0; k < N; k++) {
    const a = pickForest(b, g);
    if (g.tree[g.idx(a.x, a.y)] === 1) f++;
    const c = pickRandom(b, g);
    if (g.tree[g.idx(c.x, c.y)] === 1) r++;
  }
  assert(f / N > 0.7, `modo floresta só ${(f / N * 100).toFixed(0)}%`);
  assert(r / N > 0.35 && r / N < 0.65, `modo aleatório ${(r / N * 100).toFixed(0)}% (esperado ~50%)`);
  assert(f > r + 40, `floresta ${f} não é bem melhor que aleatório ${r}`);
});
check('evento lança N bombas escalonadas e impacta acendendo fogo', () => {
  const g = fireGrid(32, 32);
  fillTrees(g, 2, 2, 29, 29);
  const b = createBombs(5);
  b.elapsed = 0;
  const launched = launchEvent(b, g);
  assert(launched.length === 1, `esperava 1 bomba, veio ${launched.length}`);
  assert(b.inFlight.length === 1, 'bomba não entrou em voo');
  // avança até o impacto
  let t = 0;
  while (b.inFlight.length > 0 && t < 20) {
    updateBombs(b, g, 0.1, 5);
    t += 0.1;
  }
  assert(b.impacts === 1, `esperava 1 impacto, veio ${b.impacts}`);
  assert(g.burningCount > 0, 'impacto não acendeu fogo');
  assert(g.events.some((e) => e.type === 'explosion'), 'sem evento de explosão');
});
check('agendador dispara sozinho depois do primeiro atraso', () => {
  const g = fireGrid(32, 32);
  fillTrees(g, 2, 2, 29, 29);
  const b = createBombs(31);
  const primeiro = b.nextEventAt;
  assert(primeiro >= BOMB.firstDelayMin && primeiro <= BOMB.firstDelayMax, `primeiro evento em ${primeiro}`);
  for (let t = 0; t < primeiro + 0.5; t += 0.25) updateBombs(b, g, 0.25, 31);
  assert(b.events === 1, `esperava 1 evento, veio ${b.events}`);
  assert(b.nextEventAt > b.elapsed, 'próximo evento deveria estar no futuro');
});
check('mesma seed => mesmos alvos (determinístico)', () => {
  const run = () => {
    const g = fireGrid(32, 32);
    fillTrees(g, 2, 2, 29, 29);
    const b = createBombs(9);
    b.elapsed = 120; // 3 bombas por evento
    const l = launchEvent(b, g);
    return l.map((x) => `${x.tx},${x.ty}`).join('|');
  };
  assert(run() === run(), 'alvos das bombas não são determinísticos');
});
check('dropBomb cai no tile pedido e ignita em raio', () => {
  const g = fireGrid(32, 32);
  fillTrees(g, 2, 2, 29, 29);
  const b = createBombs(3);
  dropBomb(b, g, 16, 16, 3);
  let t = 0;
  while (b.inFlight.length > 0 && t < 10) {
    updateBombs(b, g, 0.1, 3);
    t += 0.1;
  }
  assert(b.impacts === 1, 'não impactou');
  assert(g.state[g.idx(16, 16)] === STATE.BURNING, 'centro do impacto deveria queimar');
  let focos = 0;
  for (let y = 12; y <= 20; y++) for (let x = 12; x <= 20; x++) {
    if (g.state[g.idx(x, y)] !== STATE.IDLE) focos++;
  }
  assert(focos >= 20, `raio de ignição pequeno demais: ${focos} focos`);
});


console.log('save e retomada');
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}
function mundoSalvo() {
  const { grid } = generateWorld(1234);
  for (let y = 20; y < 50; y += 2) for (let x = 20; x < 50; x += 2) plantTree(grid, x, y, 1234);
  paintWaterTile(grid, 60, 24);
  igniteRadius(grid, 44, 36, 2, 1234);
  grid.recount();
  return grid;
}

check('save/restore preserva contadores e tiles', () => {
  const g1 = mundoSalvo();
  const store = fakeStorage();
  const bytes = saveGame({
    grid: g1, seed: 1234, elapsed: 42,
    bombs: { elapsed: 42, events: 2, nextEventAt: 60, lastTarget: { x: 10, y: 11 }, launched: 3, impacts: 2 },
    camera: { x: 1200, y: 900, zoom: 1.3 },
    state: { brushRadius: 3, tool: 'water' },
  }, store);
  assert(bytes > 0, 'nada foi salvo');

  const { grid: g2 } = generateWorld(1234);
  const saved = readSave(store);
  assert(saved && saved.seed === 1234, 'save não foi lido');
  const meta = saved.apply(g2);

  assert(g2.treeCount === g1.treeCount, `árvores ${g2.treeCount} != ${g1.treeCount}`);
  assert(g2.burningCount === g1.burningCount, `focos ${g2.burningCount} != ${g1.burningCount}`);
  assert(g2.waterTotal === g1.waterTotal, `água ${g2.waterTotal} != ${g1.waterTotal}`);
  assert(Math.abs(meta.elapsed - 42) < 0.01, `relógio ${meta.elapsed}`);
  assert(meta.camera.zoom === 1.3 || Math.abs(meta.camera.zoom - 1.3) < 0.001, 'zoom');
  assert(meta.ui.tool === 'water', 'ferramenta');
  assert(meta.ui.brushRadius === 3, 'pincel');
  assert(meta.bombs.lastTarget.x === 10 && meta.bombs.lastTarget.y === 11, 'último alvo');
});
check('restore reconstrói listas de trabalho do fogo', () => {
  const g1 = mundoSalvo();
  const store = fakeStorage();
  saveGame({ grid: g1, seed: 1234, elapsed: 1, bombs: null, camera: null, state: null }, store);
  const { grid: g2 } = generateWorld(1234);
  readSave(store).apply(g2);
  assert(g2.burningTiles.length === g2.burningCount, 'burningTiles inconsistente');
  assert(g2.waterTiles.length === g2.waterCount, 'waterTiles inconsistente');
  for (const i of g2.burningTiles) assert(g2.state[i] === STATE.BURNING, 'lista com tile não queimando');
});
check('denominador de cobertura continua congelado após restore', () => {
  const g1 = mundoSalvo();
  const store = fakeStorage();
  saveGame({ grid: g1, seed: 1234, elapsed: 1, bombs: null, camera: null, state: null }, store);
  const { grid: g2 } = generateWorld(1234);
  const antes = g2.landTotal;
  readSave(store).apply(g2);
  assert(g2.landTotal === antes, `landTotal mudou: ${g2.landTotal} != ${antes}`);
});
check('save corrompido ou de outra versão é descartado', () => {
  const store = fakeStorage();
  store.setItem(SAVE_KEY, 'lixo-que-nao-e-base64');
  assert(readSave(store) === null, 'lixo deveria ser descartado');
  const g1 = mundoSalvo();
  saveGame({ grid: g1, seed: 1234, elapsed: 1, bombs: null, camera: null, state: null }, store);
  // corrompe a versão
  const bom = store.getItem(SAVE_KEY);
  const bytes = Uint8Array.from(atob(bom), (c) => c.charCodeAt(0));
  bytes[2] = 99;
  store.setItem(SAVE_KEY, btoa(String.fromCharCode.apply(null, bytes)));
  assert(readSave(store) === null, 'versão errada deveria ser descartada');
  clearSave(store);
  assert(readSave(store) === null, 'clearSave não apagou');
});
check('save cabe folgado no localStorage (~5MB)', () => {
  const g1 = mundoSalvo();
  const buf = encodeState({ grid: g1, seed: 1234, elapsed: 0, bombs: null, camera: null, state: null });
  const kb = (buf.byteLength * 4) / 3 / 1024;
  assert(buf.byteLength < 200 * 1024, `buffer cru ${(buf.byteLength / 1024).toFixed(0)} KB`);
  assert(kb < 400, `base64 ${kb.toFixed(0)} KB`);
});


console.log('fim de jogo e pontuação');
check('faixas de nota', () => {
  assert(gradeFor(2000) === 'S', `2000 -> ${gradeFor(2000)}`);
  assert(gradeFor(1650) === 'S', `1650 -> ${gradeFor(1650)}`);
  assert(gradeFor(1649) === 'A', `1649 -> ${gradeFor(1649)}`);
  assert(gradeFor(1350) === 'A', `1350 -> ${gradeFor(1350)}`);
  assert(gradeFor(1050) === 'B', `1050 -> ${gradeFor(1050)}`);
  assert(gradeFor(750) === 'C', `750 -> ${gradeFor(750)}`);
  assert(gradeFor(749) === 'D', `749 -> ${gradeFor(749)}`);
  assert(gradeFor(2000, PHASE.DROUGHT) === 'F', 'derrota tem que ser F');
});
check('pontuação soma os três termos (máx 2000)', () => {
  const g = fireGrid(20, 20);
  fillTrees(g, 1, 1, 18, 18);
  g.waterTotal = 1000;
  const game = createGame(1000);
  const r = computeScore(game, g, 0);
  assert(r.score === r.parts.cobertura + r.parts.agua + r.parts.rapidez, 'soma dos termos');
  assert(r.score <= 2000, `score ${r.score} passou do teto`);
  // sem tempo decorrido e sem gastar água, a diferença é só a cobertura
  assert(r.parts.agua === 500, `água ${r.parts.agua}`);
  assert(r.parts.rapidez === 500, `rapidez ${r.parts.rapidez}`);
});
check('vitória dispara em 90% de cobertura', () => {
  const g = fireGrid(30, 30);
  const game = createGame(1000);
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) g.tree[g.idx(x, y)] = 1;
  g.treeCount = 0;
  g.recount(); // 100% de cobertura
  const r = checkEnd(game, g, 120);
  assert(r && r.phase === PHASE.VICTORY, 'não venceu com floresta cheia');
  assert(game.phase === PHASE.VICTORY, 'fase não mudou');
  assert(r.grade === 'S' || r.grade === 'A', `nota ${r.grade}`);
  // segunda chamada não deve reabrir a partida
  assert(checkEnd(game, g, 130) === null, 'fim rodou duas vezes');
});
check('não vence com 89% de cobertura', () => {
  const g = fireGrid(30, 30);
  const game = createGame(1000);
  fillTrees(g, 1, 1, 28, 28);
  // derruba árvores até ficar abaixo da meta
  let removidas = 0;
  while (g.coverage() >= 0.9) {
    const i = g.tree.findIndex((v) => v === 1);
    g.tree[i] = 0;
    g.treeCount--;
    removidas++;
    if (removidas > 500) break;
  }
  g.recount();
  assert(g.coverage() < 0.9, 'setup falhou');
  assert(checkEnd(game, g, 120) === null, 'venceu abaixo da meta');
});
check('seca só derrota com fogo ativo', () => {
  const g = fireGrid(24, 24);
  fillTrees(g, 1, 1, 22, 22);
  const game = createGame(1000);
  g.waterTotal = 0;
  assert(checkEnd(game, g, 10) === null, 'secou sem fogo e derrotou (não devia)');
  igniteRadius(g, 12, 12, 1, 7);
  const r = checkEnd(game, g, 10);
  assert(r && r.phase === PHASE.DROUGHT, 'devia derrotar com fogo e sem água');
  assert(r.grade === 'F', `nota ${r.grade}`);
});
check('endGame forçado (teclas de debug) funciona', () => {
  const g = fireGrid(20, 20);
  fillTrees(g, 1, 1, 18, 18);
  const game = createGame(500);
  const v = endGame(game, g, 30, PHASE.VICTORY);
  assert(v.phase === PHASE.VICTORY, 'debug win não venceu');
  const game2 = createGame(500);
  const d = endGame(game2, g, 30, PHASE.DROUGHT);
  assert(d.phase === PHASE.DROUGHT && d.grade === 'F', 'debug lose não derrotou');
});
check('recordes: vitória grava, derrota não', () => {
  const m = new Map();
  const store = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
  const g = fireGrid(20, 20);
  fillTrees(g, 1, 1, 18, 18);
  const game = createGame(500);
  const v = endGame(game, g, 100, PHASE.VICTORY);
  const r1 = updateRecords(v, store);
  assert(r1.novos.score && r1.novos.fastest, 'primeira vitória devia ser recorde');
  assert(r1.records.bestScore === v.score, 'score não gravado');

  const pior = { ...v, score: 10, phase: PHASE.VICTORY };
  const r2 = updateRecords(pior, store);
  assert(!r2.novos.score, 'score pior não devia virar recorde');
  assert(loadRecords(store).bestScore === v.score, 'recorde foi sobrescrito');

  const game2 = createGame(500);
  const d = endGame(game2, g, 5, PHASE.DROUGHT);
  const r3 = updateRecords(d, store);
  assert(!r3.novos.score && !r3.novos.fastest, 'derrota não pode gravar recorde');
});

console.log(failures ? `\n${failures} falha(s)` : '\ntudo ok');
process.exit(failures ? 1 : 0);
