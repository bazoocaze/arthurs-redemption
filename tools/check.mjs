#!/usr/bin/env node
// Testes de sanidade sem browser: matemática iso, gerador, modelo de dados.
// Uso: node tools/check.mjs
import { TILE_W, TILE_H, GRID_W, GRID_H, WORLD_W, WORLD_H, GEN } from '../src/config.js';
import { tileWorldX, tileWorldY, tileCenterY, worldToTile } from '../src/iso.js';
import { generateWorld } from '../src/generator.js';
import { TERRAIN, STATE } from '../src/grid.js';
import { mulberry32 } from '../src/rng.js';

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
  assert(g.initialLandTiles + g.waterCount === GRID_W * GRID_H, 'land+water != total');
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

console.log(failures ? `\n${failures} falha(s)` : '\ntudo ok');
process.exit(failures ? 1 : 0);
