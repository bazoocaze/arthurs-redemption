#!/usr/bin/env node
// Testes de sanidade sem browser: matemática iso, gerador, modelo de dados.
// Uso: node tools/check.mjs
import { TILE_W, TILE_H, GRID_W, GRID_H, WORLD_W, WORLD_H, GEN } from '../src/config.js';
import { tileWorldX, tileWorldY, tileCenterY, worldToTile } from '../src/iso.js';
import { generateWorld } from '../src/generator.js';
import { TERRAIN, STATE } from '../src/grid.js';
import { mulberry32, hash2 } from '../src/rng.js';
import { plantTree, paintWaterTile, waterPaintCost, applyBrush, strokePath, canPlant } from '../src/sim/paint.js';
import { groveSizeAt, blockMatches } from '../src/grove.js';
import { WATER } from '../src/config.js';

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

console.log(failures ? `\n${failures} falha(s)` : '\ntudo ok');
process.exit(failures ? 1 : 0);
