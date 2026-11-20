// Camada de terreno. M1: redesenho direto com batching por cor.
// M2 troca o miolo por chunks assados em offscreen — a assinatura se mantém.
import { TILE_W, TILE_H, ORIGIN_X, COLORS, TIME } from '../config.js';
import { TERRAIN } from '../grid.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const SEAM = 0.6; // infla o losango para evitar costura de antialiasing

/**
 * Desenha todo o terreno visível.
 * Estratégia: acumula losangos em um Path2D por cor (poucos fills por frame,
 * em vez de um fill por tile) — necessário quando o zoom está aberto e há
 * ~9000 tiles visíveis.
 */
export function drawTerrain(ctx, grid, cam, time) {
  const z = cam.zoom;
  const vw = cam.viewW;
  const vh = cam.viewH;
  const nDirt = COLORS.dirt.length;
  const paths = [];
  for (let i = 0; i < nDirt + COLORS.water.length; i++) paths.push(new Path2D());

  const hw = HW * z + SEAM;
  const hh = HH * z + SEAM * 0.5;
  const th = TILE_H * z + SEAM;
  const shimmer = Math.floor(time * TIME.waterShimmerHz);
  let drawn = 0;

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const sx = ((x - y) * HW + ORIGIN_X - cam.x) * z;
      const sy = ((x + y) * HH - cam.y) * z;
      if (sx - hw > vw || sy - hh > vh || sx + hw < 0 || sy + th < 0) continue;

      drawn++;
      const i = y * grid.w + x;
      let p;
      if (grid.terrain[i] === TERRAIN.WATER) {
        p = paths[nDirt + (((x + y + shimmer) & 3) < 2 ? 0 : 1)];
      } else {
        p = paths[grid.tone[i]];
      }
      p.moveTo(sx, sy - SEAM * 0.5);
      p.lineTo(sx + hw, sy + hh);
      p.lineTo(sx, sy + th);
      p.lineTo(sx - hw, sy + hh);
      p.closePath();
    }
  }

  for (let i = 0; i < paths.length; i++) {
    ctx.fillStyle = i < nDirt ? COLORS.dirt[i] : COLORS.water[i - nDirt];
    ctx.fill(paths[i]);
  }
  return drawn;
}
