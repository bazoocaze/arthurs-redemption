// Regras de pintura: plantar árvore e alagar terreno.
// Muta o grid e mantém os contadores incrementais em sincronia.
import { SPECIES, WATER } from '../config.js';
import { STATE, TERRAIN } from '../grid.js';
import { fbm2, hash2 } from '../rng.js';
import { sprayTile } from './fire.js';

/** Espécie determinística pela posição: manchas coerentes + jitter quebra a grade. */
export function speciesAt(x, y, seed) {
  // Freq maior + jitter forte: manchas menores, floresta parece mais mista.
  const n = fbm2(x * 0.115, y * 0.115, seed + 31);
  const jitter = (hash2(x, y, seed + 77) - 0.5) * 0.6;
  const idx = Math.floor((n * 0.92 + 0.04 + jitter) * SPECIES.length);
  return Math.min(SPECIES.length - 1, Math.max(0, idx));
}

export function canPlant(grid, x, y) {
  if (!grid.inBounds(x, y)) return false;
  const i = grid.idx(x, y);
  return grid.terrain[i] === TERRAIN.DIRT && grid.tree[i] === 0 && grid.state[i] === STATE.IDLE;
}

export function plantTree(grid, x, y, seed) {
  if (!canPlant(grid, x, y)) return false;
  const i = grid.idx(x, y);
  grid.tree[i] = 1;
  grid.species[i] = speciesAt(x, y, seed);
  grid.treeCount++;
  // evento para o áudio (o render ignora, o som usa). Custa 1 objeto por tile
  // plantado e é drenado no mesmo frame.
  if (grid.events.length < 256) grid.events.push({ type: 'plant', x, y });
  return true;
}

export function canPaintWater(grid, x, y) {
  if (!grid.inBounds(x, y)) return false;
  const i = grid.idx(x, y);
  return grid.terrain[i] === TERRAIN.DIRT && grid.tree[i] === 0 && grid.state[i] === STATE.IDLE;
}

/**
 * Custo para alagar um tile:
 *   encostado no rio (dist 1) => paintBase (2:1, o número combinado)
 *   longe do rio            => cresce linearmente, o que inviabiliza fossos
 * `distToWater` é congelado na geração, então pintar um lago não barateia o
 * próximo tile — é o que impede cercar a floresta de água.
 */
export function waterPaintCost(grid, x, y) {
  if (!grid.inBounds(x, y)) return Infinity;
  const raw = grid.distToWater[grid.idx(x, y)];
  const d = raw < 1 ? 1 : raw;
  return WATER.paintBase * (1 + (d - 1) * WATER.paintDistFactor);
}

/**
 * Debita `amount` do reservatório: primeiro do rio mais próximo do tile,
 * depois varrendo os tiles de água que ainda têm volume.
 * Atômico: verifica o total antes de debitar.
 */
function consumeWater(grid, tileIndex, amount) {
  if (amount <= 0) return true;
  if (grid.waterTotal < amount) return false;

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
  return need <= 0.0001;
}

/** Alaga um tile. Retorna o custo pago (0 = não deu). */
export function paintWaterTile(grid, x, y) {
  if (!canPaintWater(grid, x, y)) return 0;
  const i = grid.idx(x, y);
  const cost = waterPaintCost(grid, x, y);
  if (!consumeWater(grid, i, cost)) return 0;

  grid.terrain[i] = TERRAIN.WATER;
  grid.waterVol[i] = WATER.pondVolume;
  grid.waterTotal += WATER.pondVolume;
  grid.waterCount++;
  grid.landTiles--;
  grid.waterTiles.push(i);
  // distToWater/waterSource ficam congelados de propósito (anti-fosso).
  return cost;
}

/** Executa `fn` em todos os tiles do disco do brush (inclui o centro). */
export function brushTiles(grid, cx, cy, radius, fn) {
  const r2 = radius * radius;
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(grid.w - 1, cx + radius);
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(grid.h - 1, cy + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) fn(x, y);
    }
  }
}

/**
 * Ferramenta água, sensível ao contexto:
 *   - tile em chamas  -> spray (reduz fireHp; apaga de vez quando zera)
 *   - árvore sã       -> molha (aceiro)
 *   - terra vazia     -> cava lago (custo por distância do rio)
 *   - cinza/água      -> nada
 * O custo de transporte é o mesmo da pintura: longe do rio, apagar é caro.
 */
export function applyWater(grid, cx, cy, radius, seed) {
  let changed = 0;
  brushTiles(grid, cx, cy, radius, (x, y) => {
    const i = grid.idx(x, y);
    if (grid.terrain[i] === TERRAIN.WATER) return;
    const st = grid.state[i];
    const burning = st === STATE.BURNING;
    const tree = grid.tree[i] === 1;
    if (burning || tree) {
      if (sprayTile(grid, x, y, seed) > 0) changed++;
      return;
    }
    if (st === STATE.ASH) return;
    if (paintWaterTile(grid, x, y) > 0) changed++;
  });
  return changed;
}

/**
 * Aplica o brush em um tile. `tool` é 'tree' ou 'water'.
 * Retorna quantos tiles mudaram.
 */
export function applyBrush(grid, cx, cy, radius, tool, seed) {
  let changed = 0;
  if (tool === 'tree') {
    brushTiles(grid, cx, cy, radius, (x, y) => {
      if (plantTree(grid, x, y, seed)) changed++;
    });
  } else if (tool === 'water') {
    changed = applyWater(grid, cx, cy, radius, seed);
  }
  return changed;
}

/**
 * Tiles entre dois pontos (Bresenham), sem repetir o ponto inicial.
 * Evita "buracos" quando o dedo/mouse anda rápido.
 */
export function strokePath(from, to) {
  const out = [];
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  for (let guard = 0; guard < 512; guard++) {
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
    out.push({ x: x0, y: y0 });
  }
  return out;
}
