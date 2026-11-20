// Gera os ícones PNG do PWA (192, 512 e 512 maskable).
//
// Sem dependência: desenha em buffer RGBA com 3× supersampling (para as bordas
// do diamante isométrico não ficarem serrilhadas) e escreve PNG na mão — é
// pequeno o bastante para não justificar uma lib de imagem.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [0x12, 0x10, 0x0d];
const TILE = [0x2f, 0x5d, 0x3a];
const TILE_HI = [0x3a, 0x6f, 0x45];
const TRUNK = [0x3a, 0x2a, 0x1a];
const PINE = [0x4c, 0x9a, 0x5a];
const PINE_HI = [0x66, 0xc2, 0x7a];

const SS = 3; // supersampling

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Um pixel do desenho, em coordenadas 0..1. Devolve [r,g,b,a] ou null. */
function sample(u, v) {
  const dx = u - 0.5;
  const dy = (v - 0.72) * 2.1; // diamante "achatado", apoiado embaixo

  // losango isométrico (|dx|/0.40 + |dy|/0.40 <= 1)
  const los = Math.abs(dx) / 0.40 + Math.abs(dy) / 0.40;
  if (los <= 1) {
    return [...mix(TILE_HI, TILE, los * 0.9), 255];
  }

  // tronco
  if (Math.abs(u - 0.5) < 0.028 && v > 0.66 && v < 0.86) return [...TRUNK, 255];

  // pinheiro: três triângulos empilhados (topo/base/meia-largura)
  const camadas = [
    [0.12, 0.34, 0.115],
    [0.22, 0.46, 0.155],
    [0.33, 0.60, 0.195],
  ];
  for (let k = 0; k < camadas.length; k++) {
    const [topo, base, meia] = camadas[k];
    if (v < topo || v > base) continue;
    const t = (v - topo) / (base - topo);
    if (Math.abs(u - 0.5) <= meia * Math.min(1, t * 1.15)) {
      // sombra do lado esquerdo, luz do direito
      return [...mix(PINE_HI, PINE, u < 0.5 ? 0.75 : 0.15), 255];
    }
  }
  return null;
}

/** Renderiza size×size com supersampling e devolve RGBA. */
function render(size, escala) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // escala < 1 encolhe o desenho para o ícone maskable (safe zone)
          const u = (x + (sx + 0.5) / SS) / size / escala;
          const v = (y + (sy + 0.5) / SS) / size / escala;
          const c = sample(u, v);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 1;
          }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (a === 0) {
        out[i] = BG[0];
        out[i + 1] = BG[1];
        out[i + 2] = BG[2];
        out[i + 3] = 255;
      } else {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

/** PNG mínimo: IHDR + IDAT (filtro 0 por linha) + IEND. */
function png(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4)
      .copy(raw, y * (size * 4 + 1) + 1);
  }

  const chunk = (tipo, dados) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo) >>> 0);
    return Buffer.concat([len, corpo, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TABELA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

for (const [nome, size, escala] of [
  ['icons/icon-192.png', 192, 1],
  ['icons/icon-512.png', 512, 1],
  ['icons/icon-512-maskable.png', 512, 0.72],
]) {
  const buf = png(render(size, escala), size);
  writeFileSync(new URL(`../${nome}`, import.meta.url), buf);
  console.log(`${nome}: ${size}×${size}, ${(buf.length / 1024).toFixed(1)} KB`);
}
