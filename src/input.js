// Entrada unificada: mouse, toque, caneta. Só produz intents de câmera e
// aponta qual tile está sob o cursor.
// TODO(M3): botão esquerdo passa a pintar; pan fica com direito/meio/dois dedos.
import { CAM } from './config.js';
import { worldToTile } from './iso.js';

export function attachInput(canvas, camera, state) {
  /** @type {Map<number, {x:number, y:number, type:string}>} */
  const pointers = new Map();
  let lastPinch = null;

  const localPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, type: e.pointerType || 'mouse' };
  };

  const updateHover = (pos) => {
    if (!pos) {
      state.hover = null;
      return;
    }
    const w = camera.screenToWorld(pos.x, pos.y);
    const t = worldToTile(w.x, w.y);
    state.hover = t.x >= 0 && t.y >= 0 && t.x < state.grid.w && t.y < state.grid.h ? t : null;
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    const pos = localPos(e);
    pointers.set(e.pointerId, pos);
    if (pointers.size === 2) lastPinch = null;
    if (pos.type === 'mouse') updateHover(pos);
  });

  canvas.addEventListener('pointermove', (e) => {
    const pos = localPos(e);
    const prev = pointers.get(e.pointerId);

    if (!prev) {
      // Mouse pairando sem botão pressionado: só atualiza o alvo.
      if (pos.type === 'mouse') updateHover(pos);
      return;
    }

    if (pos.type === 'mouse') updateHover(pos);

    const dx = pos.x - prev.x;
    const dy = pos.y - prev.y;
    pointers.set(e.pointerId, pos);

    if (pointers.size === 1) {
      camera.panByScreen(dx, dy);
      return;
    }

    const [a, b] = [...pointers.values()];
    const cur = { a, b };
    if (lastPinch) {
      const m0x = (lastPinch.a.x + lastPinch.b.x) / 2;
      const m0y = (lastPinch.a.y + lastPinch.b.y) / 2;
      const m1x = (cur.a.x + cur.b.x) / 2;
      const m1y = (cur.a.y + cur.b.y) / 2;
      const d0 = Math.hypot(lastPinch.a.x - lastPinch.b.x, lastPinch.a.y - lastPinch.b.y);
      const d1 = Math.hypot(cur.a.x - cur.b.x, cur.a.y - cur.b.y);
      camera.panByScreen(m1x - m0x, m1y - m0y);
      if (d0 > 1 && d1 > 1) camera.zoomAt(m1x, m1y, d1 / d0);
    }
    lastPinch = cur;
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    canvas.releasePointerCapture?.(e.pointerId);
    if (pointers.size < 2) lastPinch = null;
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
      const factor = Math.exp(-e.deltaY * CAM.wheelStrength);
      camera.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    },
    { passive: false },
  );

  // Pinça de trackpad (gesto do SO) chega como ctrl+wheel.
  return { updateHover };
}
