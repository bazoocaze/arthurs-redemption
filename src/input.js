// Entrada unificada: mouse, toque, caneta e teclado.
// Regra mental:
//   - um dedo / botão esquerdo obedece a palheta (pinta, ou arrasta se 🖐️)
//   - botão direito/meio, dois dedos e espaço SEMPRE navegam
import { BRUSH } from './config.js';
import { worldToTile } from './iso.js';

const KEY_PAN = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
};
const PAN_SPEED = 900; // px de tela por segundo

export function createInput(canvas, camera, state, hooks) {
  /** @type {Map<number, {x:number, y:number, type:string}>} */
  const pointers = new Map();
  const keys = new Set();
  let mode = null; // 'paint' | 'pan' | 'pinch'
  let lastPinch = null;

  // Alguns browsers lançam se o ponteiro não estiver ativo (ex.: evento sintético).
  const capture = (id) => {
    try {
      canvas.setPointerCapture?.(id);
    } catch {}
  };
  const uncapture = (id) => {
    try {
      canvas.releasePointerCapture?.(id);
    } catch {}
  };

  const localPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, type: e.pointerType || 'mouse' };
  };

  const tileAt = (pos) => {
    const w = camera.screenToWorld(pos.x, pos.y);
    const t = worldToTile(w.x, w.y);
    return t.x >= 0 && t.y >= 0 && t.x < state.grid.w && t.y < state.grid.h ? t : null;
  };

  const updateHover = (pos) => {
    state.hover = pos ? tileAt(pos) : null;
  };

  const startStroke = (pos) => {
    const t = tileAt(pos);
    if (t) hooks.beginStroke(t);
  };

  const wantsPan = (e) =>
    state.tool === 'pan' || e.button === 1 || e.button === 2 || e.shiftKey || keys.has('Space');

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    capture(e.pointerId);
    const pos = localPos(e);
    pointers.set(e.pointerId, pos);

    if (pointers.size === 1) {
      updateHover(pos);
      if (wantsPan(e)) {
        mode = 'pan';
      } else {
        mode = 'paint';
        startStroke(pos);
      }
    } else {
      // Segundo dedo: cancela o traço e vira pinch.
      if (mode === 'paint') hooks.endStroke();
      mode = 'pinch';
      lastPinch = null;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const pos = localPos(e);
    const prev = pointers.get(e.pointerId);

    if (!prev) {
      if (pos.type === 'mouse') updateHover(pos);
      return;
    }

    if (pos.type === 'mouse') updateHover(pos);
    const dx = pos.x - prev.x;
    const dy = pos.y - prev.y;
    pointers.set(e.pointerId, pos);

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      if (lastPinch) {
        const m0x = (lastPinch.a.x + lastPinch.b.x) / 2;
        const m0y = (lastPinch.a.y + lastPinch.b.y) / 2;
        const m1x = (a.x + b.x) / 2;
        const m1y = (a.y + b.y) / 2;
        const d0 = Math.hypot(lastPinch.a.x - lastPinch.b.x, lastPinch.a.y - lastPinch.b.y);
        const d1 = Math.hypot(a.x - b.x, a.y - b.y);
        camera.panByScreen(m1x - m0x, m1y - m0y);
        if (d0 > 1 && d1 > 1) camera.zoomAt(m1x, m1y, d1 / d0);
      }
      lastPinch = { a, b };
      return;
    }

    if (mode === 'pan') {
      camera.panByScreen(dx, dy);
    } else if (mode === 'paint') {
      const t = tileAt(pos);
      if (t) hooks.moveStroke(t);
    }
  });

  const release = (e) => {
    if (mode === 'paint' && pointers.size === 1) hooks.endStroke();
    pointers.delete(e.pointerId);
    uncapture(e.pointerId);
    if (pointers.size < 2) lastPinch = null;
    if (pointers.size === 0) mode = null;
    if (e.pointerType !== 'mouse') state.hover = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && pointers.size === 0) state.hover = null;
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      // ctrlKey vem do "pinch" de trackpad; plain wheel é zoom de mouse.
      const strength = e.ctrlKey ? 0.01 : 0.0016;
      const factor = Math.exp(-e.deltaY * strength);
      camera.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    },
    { passive: false },
  );

  // --- teclado -------------------------------------------------------------

  const TOOL_KEYS = { Digit1: 'tree', Digit2: 'water', Digit3: 'pan' };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) {
      if (KEY_PAN[e.code]) keys.add(e.code);
      return;
    }
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();

    if (TOOL_KEYS[e.code]) hooks.setTool(TOOL_KEYS[e.code]);
    else if (e.code === 'BracketLeft') hooks.setBrushRadius(Math.max(BRUSH.minRadius, state.brushRadius - 1));
    else if (e.code === 'BracketRight') hooks.setBrushRadius(Math.min(BRUSH.maxRadius, state.brushRadius + 1));
    else if (e.code === 'KeyF') camera.fitWorld();
  });

  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  /** Pan por teclado, integrado no loop (dt em segundos). */
  function update(dt) {
    let dx = 0;
    let dy = 0;
    for (const code of keys) {
      const v = KEY_PAN[code];
      if (v) {
        dx += v[0];
        dy += v[1];
      }
    }
    if (dx || dy) camera.panByScreen(dx * PAN_SPEED * dt, dy * PAN_SPEED * dt);
  }

  return { update };
}
