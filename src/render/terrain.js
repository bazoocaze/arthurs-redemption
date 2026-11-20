// Camada de terreno.
//
// Truque de performance: em vez de emitir 4-5 chamadas nativas por tile
// (moveTo/lineTo/closePath), emitimos UMA (`Path2D.rect`) e deixamos a matriz
// iso converter o quadrado unitário no losango:
//
//   screen = [ HW  -HW ] * (x, y) + translação
//            [ HH   HH ]
//
// Custo medido (CODE-ATLAS §11): losango com 5 chamadas por tile custava 163 ms
// para o mundo inteiro; `rect` com matriz custa 3 ms. O gargalo era a
// COMPLEXIDADE do path (9216 contornos de 4 segmentos), não a contagem de
// chamadas.
import { TILE_W, TILE_H, ORIGIN_X, COLORS, TIME } from '../config.js';
import { TERRAIN, STATE } from '../grid.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export function drawTerrain(ctx, grid, cam, time) {
  const z = cam.zoom;
  const vw = cam.viewW;
  const vh = cam.viewH;
  const nDirt = COLORS.dirt.length;
  const nWater = COLORS.water.length;
  const nAsh = COLORS.ash.length;
  const nPaths = nDirt + nWater + nAsh;

  const paths = [];
  for (let i = 0; i < nPaths; i++) paths.push(new Path2D());
  let wetPath = null; // só criado se houver tile molhado visível

  const hwz = HW * z;
  const hhz = HH * z;
  const tx = (ORIGIN_X - cam.x) * z;
  const ty = -cam.y * z;

  // Folga em espaço de tile para não aparecer costura de antialiasing.
  const e = Math.min(0.5, 0.7 / Math.max(0.001, hwz));
  const size = 1 + e * 2;

  const shimmer = Math.floor(time * TIME.waterShimmerHz);
  let drawn = 0;

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const sx = (x - y) * hwz + tx;
      const sy = (x + y) * hhz + ty;
      // bbox do losango: [sx-hwz, sx+hwz] x [sy, sy + TILE_H*z]
      if (sx + hwz < 0 || sx - hwz > vw || sy + TILE_H * z < 0 || sy > vh) continue;

      drawn++;
      const i = y * grid.w + x;
      const st = grid.state[i];
      if (grid.terrain[i] === TERRAIN.WATER) {
        paths[nDirt + (((x + y + shimmer) & 3) < 2 ? 0 : 1)].rect(x - e, y - e, size, size);
      } else if (st === STATE.BURNING || st === STATE.ASH) {
        // terra queimada: tom de cinza (cinza e foco aceso compartilham o tom)
        paths[nDirt + nWater + (grid.tone[i] % nAsh)].rect(x - e, y - e, size, size);
      } else {
        paths[grid.tone[i]].rect(x - e, y - e, size, size);
        if (grid.wet[i] > 0) {
          if (!wetPath) wetPath = new Path2D();
          wetPath.rect(x - e, y - e, size, size);
        }
      }
    }
  }

  ctx.save();
  ctx.transform(hwz, hhz, -hwz, hhz, tx, ty);
  for (let i = 0; i < nPaths; i++) {
    if (i < nDirt) ctx.fillStyle = COLORS.dirt[i];
    else if (i < nDirt + nWater) ctx.fillStyle = COLORS.water[i - nDirt];
    else ctx.fillStyle = COLORS.ash[i - nDirt - nWater];
    ctx.fill(paths[i]);
  }
  if (wetPath) {
    ctx.fillStyle = COLORS.wetTint;
    ctx.fill(wetPath);
  }
  ctx.restore();

  return drawn;
}
