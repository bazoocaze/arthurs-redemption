// Sprites de árvore pré-renderizados.
//
// Desenhar uma árvore "à mão" custa de 6 a 19 chamadas nativas (tronco +
// triângulos/elipses). O gargalo do Canvas2D é a quantidade de chamadas, não a
// área pintada (medido: 17 ms para ~1200 árvores). Pré-renderizando cada
// (espécie, tamanho de grove) uma vez, cada árvore vira 1 `drawImage`.
//
// SPRITE_ZOOM = 3 => o sprite tem 3x a resolução de mundo, então no zoom
// máximo (3x) o desenho é 1:1 e abaixo disso só há downscale (suave).
import { SPECIES, TILE_W, TILE_H, COLORS } from '../config.js';
import { hash2 } from '../rng.js';

export const SPRITE_ZOOM = 3;
const PAD = 8; // folga em px de mundo

const TAU = Math.PI * 2;

/** Tamanho do desenho em pixels de mundo (sem a folga). */
export function treeWorldSize(sp, size) {
  const w = sp.w * TILE_W * (0.78 + (size - 1) * 0.62);
  const h = sp.h * TILE_H + (size - 1) * TILE_H * 1.35;
  return { w, h };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function drawSingle(c, w, h, sp) {
  const trunkW = Math.max(1.6, w * 0.14);
  const trunkH = h * 0.4;
  c.fillStyle = sp.trunk;
  c.fillRect(-trunkW / 2, -trunkH, trunkW, trunkH);

  if (sp.shape === 'cone') {
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const cw = w * (1 - t * 0.48);
      const baseY = -trunkH * (0.35 + t * 0.85);
      const ch = h * 0.5;
      c.beginPath();
      c.moveTo(0, baseY - ch);
      c.lineTo(cw / 2, baseY);
      c.lineTo(-cw / 2, baseY);
      c.closePath();
      c.fillStyle = k === 1 ? sp.canopy2 : sp.canopy;
      c.fill();
    }
  } else {
    c.beginPath();
    c.ellipse(0, -trunkH - h * 0.2, w * 0.52, h * 0.3, 0, 0, TAU);
    c.fillStyle = sp.canopy;
    c.fill();
    c.beginPath();
    c.ellipse(-w * 0.18, -trunkH - h * 0.42, w * 0.34, h * 0.22, 0, 0, TAU);
    c.fillStyle = sp.canopy2;
    c.fill();
  }
}

function drawGrove(c, w, h, sp, seed) {
  const trunkW = Math.max(2, w * 0.075);
  c.fillStyle = sp.trunk;
  c.fillRect(-w * 0.3, -h * 0.3, trunkW, h * 0.3);
  c.fillRect(w * 0.16, -h * 0.24, trunkW, h * 0.24);

  for (let k = 0; k < 3; k++) {
    const h1 = hash2(seed + k, k * 7, 21);
    const h2 = hash2(seed * 5 + k, k, 23);
    const ox = (h1 - 0.5) * w * 0.55;
    const oy = (h2 - 0.5) * h * 0.2;
    const cw = w * (0.5 + h2 * 0.22);
    const ch = h * (0.42 + h1 * 0.16);
    const cy = -h * 0.32 + oy;

    if (sp.shape === 'cone') {
      c.beginPath();
      c.moveTo(ox, cy - ch);
      c.lineTo(ox + cw / 2, cy);
      c.lineTo(ox - cw / 2, cy);
      c.closePath();
    } else {
      c.beginPath();
      c.ellipse(ox, cy - ch * 0.45, cw / 2, ch * 0.55, 0, 0, TAU);
    }
    c.fillStyle = k === 1 ? sp.canopy2 : sp.canopy;
    c.fill();
  }
}

function buildSprite(sp, size) {
  const { w, h } = treeWorldSize(sp, size);
  const cw = (w + PAD * 2) * SPRITE_ZOOM;
  const ch = (h + PAD) * SPRITE_ZOOM;
  const canvas = makeCanvas(cw, ch);
  const c = canvas.getContext('2d');
  c.scale(SPRITE_ZOOM, SPRITE_ZOOM);
  // base da árvore no centro-baixo (com a folga embaixo)
  c.translate(cw / (2 * SPRITE_ZOOM), ch / SPRITE_ZOOM - PAD);

  // Sombra embutida: economiza um path por frame (1 chamada por árvore).
  const rx = (sp.w * TILE_W * 0.4 + (size - 1) * TILE_W * 0.32) * 0.95;
  c.beginPath();
  c.ellipse(0, 0, rx, rx * 0.34, 0, 0, TAU);
  c.fillStyle = COLORS.shadow;
  c.fill();

  if (size === 1) drawSingle(c, w, h, sp);
  else drawGrove(c, w, h, sp, size * 31 + sp.h * 10);

  return {
    canvas,
    w: canvas.width,
    h: canvas.height,
    anchorX: canvas.width / 2,
    baseY: canvas.height,
    worldW: w,
    worldH: h,
  };
}

/** [espécie][tamanho] -> sprite (construído sob demanda). */
const cache = [];

export function getSprite(speciesIndex, size) {
  const s = Math.max(1, Math.min(size, 3));
  let row = cache[speciesIndex];
  if (!row) row = cache[speciesIndex] = [];
  if (!row[s]) row[s] = buildSprite(SPECIES[speciesIndex], s);
  return row[s];
}

/** Pré-aquece todos os sprites (evita jank no primeiro desenho). */
export function prebuildSprites() {
  for (let s = 0; s < SPECIES.length; s++) {
    for (let size = 1; size <= 3; size++) getSprite(s, size);
  }
}
