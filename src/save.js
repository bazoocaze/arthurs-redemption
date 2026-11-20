// Persistência: salva o estado vivo do mundo em localStorage.
//
// Três decisões:
//
// 1. **O terreno NÃO é salvo** — ele é determinístico a partir da seed, então
//    `generateWorld(seed)` reconstrói terreno, tons, rios, `distToWater` e
//    `landTotal` idênticos. Salvar só o que muda evita o risco de um save antigo
//    divergir do gerador e deixa o arquivo 3× menor.
// 2. **Arrays em vez de JSON.** 9216 tiles em objeto JS viram ~2 MB de texto.
//    Um ArrayBuffer com os arrays tipados crus fica em ~80 KB (base64 ~110 KB).
//    Float32 vira Uint8/Uint16 com escala: `burnT` em segundos inteiros, `wet`
//    em décimos, `waterVol` em décimos.
// 3. **Versão no header.** Save de versão diferente é descartado em vez de
//    carregar lixo num layout novo.
//
// Formato (little-endian):
//   magic "AR" | version u8 | w u16 | h u16 | seed u32 | elapsed f32
//   terrain/tree/species/state/fireHp/ashT u8[n] | burnT u8[n] | wet u8[n]
//   waterVol u16[n]
//   bombs: elapsed f32, events u16, nextEventAt f32, lastX i16, lastY i16,
//          launched u16, impacts u16
//   camera: x f32, y f32, zoom f32
//   ui: brushRadius u8, tool u8
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'ar.save';
const MAGIC = 0x4152; // "AR"
const HEADER = 15; // magic 2 + version 1 + w 2 + h 2 + seed 4 + elapsed 4
const TILE_BYTES = 10; // 8 arrays u8 + waterVol u16
const TAIL = 32; // bombas 18 + câmera 12 + ui 2

/** localStorage, ou null em modo privado / ambiente sem DOM. */
export function defaultStorage() {
  try {
    const probe = '__ar_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

function b64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function unb64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Monta o buffer de save a partir do estado vivo. */
export function encodeState({ grid, seed, elapsed, bombs, camera, state, muted }) {
  const n = grid.w * grid.h;
  const bytes = HEADER + n * TILE_BYTES + TAIL;
  const buf = new ArrayBuffer(bytes);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let o = 0;

  dv.setUint16(o, MAGIC, true); o += 2;
  dv.setUint8(o, SAVE_VERSION); o += 1;
  dv.setUint16(o, grid.w, true); o += 2;
  dv.setUint16(o, grid.h, true); o += 2;
  dv.setUint32(o, seed >>> 0, true); o += 4;
  dv.setFloat32(o, elapsed, true); o += 4;

  // Arrays por tile: copia direta, com clamp onde a escala muda.
  u8.set(grid.terrain, o); o += n;
  u8.set(grid.tree, o); o += n;
  u8.set(grid.species, o); o += n;
  u8.set(grid.state, o); o += n;
  u8.set(grid.fireHp, o); o += n;
  for (let i = 0; i < n; i++) u8[o + i] = Math.min(255, Math.round(grid.ashT[i]));
  o += n;
  for (let i = 0; i < n; i++) u8[o + i] = Math.min(255, Math.round(grid.burnT[i]));
  o += n;
  for (let i = 0; i < n; i++) u8[o + i] = Math.min(255, Math.round(grid.wet[i] * 10));
  o += n;
  for (let i = 0; i < n; i++) dv.setUint16(o + i * 2, Math.min(65535, Math.round(grid.waterVol[i] * 10)), true);
  o += n * 2;

  dv.setFloat32(o, bombs ? bombs.elapsed : 0, true); o += 4;
  dv.setUint16(o, bombs ? Math.min(65535, bombs.events) : 0, true); o += 2;
  dv.setFloat32(o, bombs ? bombs.nextEventAt : 0, true); o += 4;
  dv.setInt16(o, bombs && bombs.lastTarget ? bombs.lastTarget.x : -1, true); o += 2;
  dv.setInt16(o, bombs && bombs.lastTarget ? bombs.lastTarget.y : -1, true); o += 2;
  dv.setUint16(o, bombs ? Math.min(65535, bombs.launched) : 0, true); o += 2;
  dv.setUint16(o, bombs ? Math.min(65535, bombs.impacts) : 0, true); o += 2;

  dv.setFloat32(o, camera ? camera.x : 0, true); o += 4;
  dv.setFloat32(o, camera ? camera.y : 0, true); o += 4;
  dv.setFloat32(o, camera ? camera.zoom : 1, true); o += 4;

  dv.setUint8(o, state ? state.brushRadius : 2); o += 1;
  dv.setUint8(o, state && state.tool === 'water' ? 1 : state && state.tool === 'pan' ? 2 : 0); o += 1;

  return buf;
}

/** Grava. Retorna os bytes escritos (0 = falhou). */
export function saveGame(payload, storage = defaultStorage()) {
  if (!storage) return 0;
  try {
    const buf = encodeState(payload);
    const texto = b64(new Uint8Array(buf));
    storage.setItem(SAVE_KEY, texto);
    return texto.length;
  } catch {
    return 0; // quota cheia / modo privado: jogar sem save é melhor que quebrar
  }
}

/**
 * Lê e valida o header. Devolve `null` se não houver save ou se ele for de
 * outra versão/dimensão. O `apply(grid)` só pode ser chamado num grid gerado
 * com a mesma seed e dimensões.
 */
export function readSave(storage = defaultStorage()) {
  if (!storage) return null;
  let texto = null;
  try {
    texto = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!texto) return null;

  let bytes;
  try {
    bytes = unb64(texto);
  } catch {
    return null;
  }
  if (bytes.length < 12) return null;

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint16(0, true) !== MAGIC) return null;
  if (dv.getUint8(2) !== SAVE_VERSION) return null;
  const w = dv.getUint16(3, true);
  const h = dv.getUint16(5, true);
  if (w <= 0 || h <= 0) return null;
  // Tamanho exato: se não bater, o save está truncado ou é de outro layout.
  if (bytes.length !== HEADER + w * h * TILE_BYTES + TAIL) return null;
  const seed = dv.getUint32(7, true);

  return {
    w,
    h,
    seed,
    bytes,
    apply(grid) {
      if (grid.w !== w || grid.h !== h) return null;
      return applyBytes(grid, bytes);
    },
  };
}

function applyBytes(grid, bytes) {
  const n = grid.w * grid.h;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = HEADER;

  grid.terrain.set(bytes.subarray(o, o + n)); o += n;
  grid.tree.set(bytes.subarray(o, o + n)); o += n;
  grid.species.set(bytes.subarray(o, o + n)); o += n;
  grid.state.set(bytes.subarray(o, o + n)); o += n;
  grid.fireHp.set(bytes.subarray(o, o + n)); o += n;
  for (let i = 0; i < n; i++) grid.ashT[i] = bytes[o + i];
  o += n;
  for (let i = 0; i < n; i++) grid.burnT[i] = bytes[o + i];
  o += n;
  for (let i = 0; i < n; i++) grid.wet[i] = bytes[o + i] / 10;
  o += n;
  for (let i = 0; i < n; i++) grid.waterVol[i] = dv.getUint16(o + i * 2, true) / 10;
  o += n * 2;

  // Água pintada depois da geração não tem distToWater recalculado, igual ao
  // jogo ao vivo: `distToWater` do gerador é congelado de propósito.
  const meta = {
    seed: dv.getUint32(7, true),
    elapsed: dv.getFloat32(11, true),
    bombs: {
      elapsed: dv.getFloat32(o, true),
      events: dv.getUint16(o + 4, true),
      nextEventAt: dv.getFloat32(o + 6, true),
      lastTarget: (() => {
        const x = dv.getInt16(o + 10, true);
        if (x < 0) return null;
        return { x, y: dv.getInt16(o + 12, true) };
      })(),
      launched: dv.getUint16(o + 14, true),
      impacts: dv.getUint16(o + 16, true),
    },
    camera: {
      x: dv.getFloat32(o + 18, true),
      y: dv.getFloat32(o + 22, true),
      zoom: dv.getFloat32(o + 26, true),
    },
    ui: {
      brushRadius: dv.getUint8(o + 30),
      tool: ['tree', 'water', 'pan'][dv.getUint8(o + 31)] || 'tree',
    },
  };

  // recount() reconstrói contadores, waterTiles e as três listas de trabalho
  // do fogo (burning/ash/wet). `landTotal` fica intacto: ele vem congelado da
  // geração, que depende só da seed.
  grid.recount();
  return meta;
}

export function clearSave(storage = defaultStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* ignora */
  }
}
