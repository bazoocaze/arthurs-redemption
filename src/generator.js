// Geração do mundo inicial: terra com variação de tom + rios serpenteando.
import { GRID_W, GRID_H, GEN } from './config.js';
import { Grid, TERRAIN } from './grid.js';
import { mulberry32, fbm2, noise2, randInt, hash2 } from './rng.js';

/** Marca todos os tiles cujo centro cai dentro do raio (disco em coords de tile). */
function carveDisc(grid, cx, cy, radius) {
  const r = Math.ceil(radius) + 1;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(grid.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(grid.h - 1, Math.ceil(cy + r));
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) grid.terrain[grid.idx(x, y)] = TERRAIN.WATER;
    }
  }
}

/**
 * Rio: curva suave garantidamente de borda a borda (não é passeio aleatório).
 * O desvio lateral é ruído fractal ao longo do percurso, então o rio serpenteia
 * sem nunca "morrer" no meio do mapa.
 */
function carveRiver(grid, rng) {
  const vertical = rng() < 0.5;
  const width = GEN.riverWidthMin + rng() * (GEN.riverWidthMax - GEN.riverWidthMin);
  const span = vertical ? GRID_H : GRID_W;
  const cross = vertical ? GRID_W : GRID_H;
  const base = cross * (0.2 + rng() * 0.6);
  const amp = 5 + rng() * Math.min(11, cross * 0.16);
  const freq = 1.1 + rng() * 1.7;
  const noiseSeed = (rng() * 1e6) | 0;
  const bleed = 4; // começa e termina fora do mapa
  const steps = (span + bleed * 2) * 2;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const along = -bleed + t * (span + bleed * 2);
    const wobble = (fbm2(t * freq * 4, 0.31, noiseSeed) - 0.5) * 2 * amp;
    const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, (along + bleed) / (span + bleed * 2))));
    const w = width + (noise2(t * 26, 7.3, noiseSeed) - 0.5) * 1.1;
    const radius = Math.max(0.75, w / 2 + 0.5) * (0.45 + 0.55 * taper);

    if (vertical) carveDisc(grid, base + wobble, along, radius);
    else carveDisc(grid, along, base + wobble, radius);
  }
}

/**
 * BFS multi-fonte a partir de TODA a água natural.
 * Produz `distToWater` (0 no rio, 1 na terra encostada) e `waterSource`
 * (qual tile de rio é o mais próximo — é dele que a água é debitada).
 */
function computeWaterField(grid) {
  const queue = new Int32Array(grid.w * grid.h);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < grid.terrain.length; i++) {
    if (grid.terrain[i] !== TERRAIN.WATER) continue;
    grid.distToWater[i] = 0;
    grid.waterSource[i] = i;
    queue[tail++] = i;
  }

  const w = grid.w;
  while (head < tail) {
    const i = queue[head++];
    const d = grid.distToWater[i];
    const src = grid.waterSource[i];
    const x = i % w;
    const y = (i / w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      const j = ny * w + nx;
      if (grid.distToWater[j] !== -1) continue;
      grid.distToWater[j] = d + 1;
      grid.waterSource[j] = src;
      queue[tail++] = j;
    }
  }
}

/** Gera o mundo. Mesma seed => mesmo terreno, mesmos rios. */
export function generateWorld(seed) {
  const grid = new Grid(GRID_W, GRID_H);
  const rng = mulberry32(seed);

  // Tons de terra: manchas grandes (freq baixa) + dither para não dar banding.
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const n = fbm2(x * 0.045, y * 0.045, seed);
      const dither = (hash2(x, y, seed + 5) - 0.5) * 0.18;
      grid.tone[grid.idx(x, y)] = Math.min(3, Math.max(0, Math.floor(n * 3.4 + dither)));
    }
  }

  const riverCount = randInt(rng, GEN.riverCountMin, GEN.riverCountMax);
  for (let i = 0; i < riverCount; i++) carveRiver(grid, rng);

  // Volume de água dos rios.
  for (let i = 0; i < grid.terrain.length; i++) {
    if (grid.terrain[i] === TERRAIN.WATER) grid.waterVol[i] = GEN.waterVolumePerTile;
  }

  grid.recount();
  grid.freezeLandTotal();
  computeWaterField(grid);

  return { grid, seed, riverCount };
}
