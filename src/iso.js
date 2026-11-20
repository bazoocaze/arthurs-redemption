// Matemática isométrica. Único lugar que conhece a conversão tile <-> mundo.
import { TILE_W, TILE_H, ORIGIN_X } from './config.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Canto superior (vértice de cima) do losango do tile, em coordenadas de mundo. */
export function tileWorldX(tx, ty) {
  return (tx - ty) * HW + ORIGIN_X;
}

export function tileWorldY(tx, ty) {
  return (tx + ty) * HH;
}

/** Centro do losango, em coordenadas de mundo. */
export function tileCenterX(tx, ty) {
  return tileWorldX(tx, ty);
}

export function tileCenterY(tx, ty) {
  return tileWorldY(tx, ty) + HH;
}

/**
 * Converte coordenada de mundo para tile.
 * Derivação: o ponto dentro do tile (tx,ty) é
 *   topo + a*(HW,HH) + b*(-HW,HH), com a,b em [0,1]
 * o que dá tx = floor((A+B)/2), ty = floor((B-A)/2),
 * com A = (wx-ORIGIN_X)/HW e B = wy/HH.
 */
export function worldToTile(wx, wy) {
  const a = (wx - ORIGIN_X) / HW;
  const b = wy / HH;
  return {
    x: Math.floor((a + b) / 2),
    y: Math.floor((b - a) / 2),
  };
}
