// Render das árvores: espécies, agrupamento (groves) e LOD.
//
// Estratégia: varre a grade inteira em ordem de tile (determinístico e
// independente da câmera), agrupa blocos e desenha somente o que cai no
// viewport. Sombras vão num único path (1 fill) por baixo de tudo.
import { TILE_W, TILE_H, ORIGIN_X, COLORS, SPECIES, RENDER } from '../config.js';
import { groveSizeAt } from '../grove.js';
import { hash2 } from '../rng.js';
import { getSprite, SPRITE_ZOOM } from './sprites.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const TAU = Math.PI * 2;

const stamp = { buf: new Uint8Array(0), id: 0 };
const items = []; // pool de desenho, reaproveitado a cada frame
let itemCount = 0;

function ensureStamp(n) {
  if (stamp.buf.length !== n) stamp.buf = new Uint8Array(n);
}

function nextItem() {
  let it = items[itemCount];
  if (!it) {
    it = { x: 0, y: 0, size: 1, sp: 0, bx: 0, by: 0, jit: 1 };
    items[itemCount] = it;
  }
  itemCount++;
  return it;
}

function baseScreenX(cam, x, y) {
  return ((x - y) * HW + ORIGIN_X - cam.x) * cam.zoom;
}

function baseScreenY(cam, x, y) {
  return ((x + y) * HH + HH - cam.y) * cam.zoom;
}

/** Desenha as árvores visíveis. Retorna a contagem de itens desenhados. */
export function drawTrees(ctx, grid, cam) {
  if (cam.zoom < RENDER.lodZoom) return drawTreesLod(ctx, grid, cam);

  ensureStamp(grid.w * grid.h);
  const id = ++stamp.id;
  itemCount = 0;

  const z = cam.zoom;
  const vw = cam.viewW;
  const vh = cam.viewH;
  const padX = 90;
  const padTop = 190;
  const padBottom = 40;
  const maxSize = RENDER.groveMax;

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      if (grid.tree[i] !== 1) continue;
      if (stamp.buf[i] === id) continue; // já coberto por um grove

      const size = groveSizeAt(grid, x, y, maxSize);
      const fx = size > 1 ? x + size - 1 : x;
      const fy = size > 1 ? y + size - 1 : y;
      const bx = baseScreenX(cam, fx, fy);
      const by = baseScreenY(cam, fx, fy);
      const sp = SPECIES[grid.species[i]];
      const treeH = (sp.h * TILE_H + (size - 1) * TILE_H * 1.4) * z;
      const treeW = (sp.w * TILE_W + (size - 1) * TILE_W * 0.55) * z;

      if (
        bx + treeW < -padX - treeW ||
        bx - treeW > vw + padX ||
        by - treeH > vh + padTop ||
        by < -padBottom
      ) {
        continue;
      }

      const it = nextItem();
      it.x = x;
      it.y = y;
      it.size = size;
      it.sp = grid.species[i];
      it.bx = bx;
      it.by = by;
      it.jit = size === 1 ? 0.88 + hash2(x, y, 7) * 0.24 : 1;

      if (size > 1) {
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) stamp.buf[(y + dy) * grid.w + (x + dx)] = id;
        }
      }
    }
  }

  // A sombra já vem embutida no sprite (ver sprites.js).

  for (let k = 0; k < itemCount; k++) {
    const it = items[k];
    const spr = getSprite(it.sp, it.size);
    // jitter só em árvore solta: 1 drawImage por árvore
    const k2 = (z / SPRITE_ZOOM) * (it.size === 1 ? it.jit : 1);
    ctx.drawImage(
      spr.canvas,
      it.bx - spr.anchorX * k2,
      it.by - spr.baseY * k2,
      spr.w * k2,
      spr.h * k2,
    );
  }

  return itemCount;
}

/**
 * LOD: com o mundo muito afastado, cada árvore vira uma mancha na mesma
 * transformação iso do terreno — um `rect` por árvore (1 chamada nativa),
 * acumulado em um path por espécie (4 fills no total).
 */
function drawTreesLod(ctx, grid, cam) {
  const z = cam.zoom;
  const vw = cam.viewW;
  const vh = cam.viewH;
  const hwz = HW * z;
  const hhz = HH * z;
  const tx = (ORIGIN_X - cam.x) * z;
  const ty = -cam.y * z;
  const paths = SPECIES.map(() => new Path2D());
  let count = 0;

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (grid.tree[y * grid.w + x] !== 1) continue;
      const sx = (x - y) * hwz + tx;
      const sy = (x + y) * hhz + ty;
      if (sx + hwz < 0 || sx - hwz > vw || sy + TILE_H * z < 0 || sy > vh) continue;
      paths[grid.species[y * grid.w + x]].rect(x, y - 0.55, 1, 1, undefined);
      count++;
    }
  }

  ctx.save();
  ctx.transform(hwz, hhz, -hwz, hhz, tx, ty);
  for (let s = 0; s < paths.length; s++) {
    ctx.fillStyle = SPECIES[s].canopy;
    ctx.fill(paths[s]);
  }
  ctx.restore();
  return count;
}
