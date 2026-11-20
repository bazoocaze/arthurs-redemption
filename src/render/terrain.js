// Camada de terreno.
//
// Truque de performance: em vez de emitir 4-5 chamadas nativas por tile
// (moveTo/lineTo/closePath), emitimos UMA (`Path2D.rect`) e deixamos a matriz
// iso converter o quadrado unitário no losango:
//
//   screen = [ HW  -HW ] * (x, y) + translação
//            [ HH   HH ]
//
// Custo medido no Chromium: 35 ms -> 4 ms para os 9216 tiles com o mundo
// inteiro visível (o gargalo é a quantidade de chamadas nativas, não o fill).
import { TILE_W, TILE_H, ORIGIN_X, COLORS, TIME } from '../config.js';
import { TERRAIN } from '../grid.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export function drawTerrain(ctx, grid, cam, time) {
  const z = cam.zoom;
  const vw = cam.viewW;
  const vh = cam.viewH;
  const nDirt = COLORS.dirt.length;
  const nWater = COLORS.water.length;

  const paths = [];
  for (let i = 0; i < nDirt + nWater; i++) paths.push(new Path2D());

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
      if (grid.terrain[i] === TERRAIN.WATER) {
        paths[nDirt + (((x + y + shimmer) & 3) < 2 ? 0 : 1)].rect(x - e, y - e, size, size);
      } else {
        paths[grid.tone[i]].rect(x - e, y - e, size, size);
      }
    }
  }

  ctx.save();
  ctx.transform(hwz, hhz, -hwz, hhz, tx, ty);
  for (let i = 0; i < paths.length; i++) {
    ctx.fillStyle = i < nDirt ? COLORS.dirt[i] : COLORS.water[i - nDirt];
    ctx.fill(paths[i]);
  }
  ctx.restore();

  return drawn;
}
