// Overlays de interface desenhados no canvas: highlight e preview do brush.
import { TILE_W, TILE_H, ORIGIN_X, COLORS } from '../config.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

function diamond(ctx, cam, tx, ty) {
  const z = cam.zoom;
  const sx = ((tx - ty) * HW + ORIGIN_X - cam.x) * z;
  const sy = ((tx + ty) * HH - cam.y) * z;
  const hw = HW * z;
  const th = TILE_H * z;
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + hw, sy + th / 2);
  ctx.lineTo(sx, sy + th);
  ctx.lineTo(sx - hw, sy + th / 2);
  ctx.closePath();
}

/** Destaca um único tile (usado quando não há brush). */
export function drawTileHighlight(ctx, cam, tx, ty) {
  ctx.beginPath();
  diamond(ctx, cam, tx, ty);
  ctx.fillStyle = COLORS.highlightFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.highlightStroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Preview do brush: todos os tiles que a pintada vai atingir. */
export function drawBrush(ctx, grid, cam, cx, cy, radius) {
  const r2 = radius * radius;
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(grid.w - 1, cx + radius);
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(grid.h - 1, cy + radius);

  ctx.beginPath();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) diamond(ctx, cam, x, y);
    }
  }
  ctx.fillStyle = COLORS.highlightFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.highlightStroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}
