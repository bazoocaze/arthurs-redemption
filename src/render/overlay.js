// Overlays de interface desenhados no canvas (highlight de tile, borda do mundo).
import { TILE_W, TILE_H, ORIGIN_X, COLORS } from '../config.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Destaca o losango do tile sob o cursor (feedback de mira). */
export function drawTileHighlight(ctx, cam, tx, ty) {
  const z = cam.zoom;
  const sx = ((tx - ty) * HW + ORIGIN_X - cam.x) * z;
  const sy = ((tx + ty) * HH - cam.y) * z;
  const hw = HW * z;
  const hh = HH * z;
  const th = TILE_H * z;

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + hw, sy + hh);
  ctx.lineTo(sx, sy + th);
  ctx.lineTo(sx - hw, sy + hh);
  ctx.closePath();
  ctx.fillStyle = COLORS.highlightFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.highlightStroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
