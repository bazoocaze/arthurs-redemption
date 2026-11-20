// Palheta, HUD e ligação com o DOM. Texto mínimo: números + ícones.
import { BRUSH } from './config.js';

export function createUi(state, hooks) {
  const buttons = [...document.querySelectorAll('#palette [data-tool]')];
  const barTrees = document.getElementById('bar-trees');
  const barWater = document.getElementById('bar-water');
  const valTrees = document.getElementById('val-trees');
  const valWater = document.getElementById('val-water');
  const brushVal = document.getElementById('brush-val');
  const brushBtn = document.getElementById('brush-btn');
  const muteBtn = document.getElementById('mute-btn');
  const hud = document.getElementById('hud');
  const firePill = document.getElementById('fire-pill');
  const fireCount = document.getElementById('fire-count');
  const hintEl = document.getElementById('hint');

  let waterInitial = Math.max(1, state.grid.waterTotal);

  for (const b of buttons) {
    b.addEventListener('click', () => hooks.setTool(b.dataset.tool));
  }
  muteBtn.addEventListener('click', () => {
    hooks.toggleMute();
  });

  brushBtn.addEventListener('click', () => {
    const next = state.brushRadius >= BRUSH.maxRadius ? BRUSH.minRadius : state.brushRadius + 1;
    hooks.setBrushRadius(next);
  });

  // A ferramenta água é sensível ao contexto (apaga fogo OU cava lago), então a
  // dica muda com ela — senão o jogador não descobre que dá para apagar fogo.
  const HINTS = {
    pan: 'arraste para mover · roda ou pinça para zoom',
    tree: 'arraste para plantar · dois dedos ou botão direito movem',
    water: '💧 apaga fogo e alaga terra · custa água do rio',
  };

  function refreshTool() {
    for (const b of buttons) b.classList.toggle('active', b.dataset.tool === state.tool);
    document.body.dataset.tool = state.tool;
    if (hintEl) hintEl.textContent = HINTS[state.tool] ?? HINTS.tree;
  }

  function updateHud() {
    const g = state.grid;
    const cov = g.coverage();
    barTrees.style.width = `${Math.min(100, cov * 100).toFixed(1)}%`;
    valTrees.textContent = `${Math.round(cov * 100)}%`;

    const w = Math.max(0, g.waterTotal / waterInitial);
    barWater.style.width = `${Math.min(100, w * 100).toFixed(1)}%`;
    valWater.textContent = `${Math.round(w * 100)}%`;
    barWater.classList.toggle('empty', g.waterTotal <= 0.001);

    const burning = g.burningCount;
    firePill.classList.toggle('on', burning > 0);
    if (burning > 0) fireCount.textContent = String(burning);

    brushVal.textContent = String(state.brushRadius);
    hud.title = `${g.treeCount} árvores de ${g.landTotal} tiles de terra`;
  }

  refreshTool();
  updateHud();

  return {
    refreshTool,
    updateHud,
    /** Reflete o estado do som no botão (🔊 / 🔇). */
    setMuted(mudo) {
      muteBtn.textContent = mudo ? '🔇' : '🔊';
      muteBtn.classList.toggle('off', !!mudo);
    },
    setWaterInitial(v) {
      waterInitial = Math.max(1, v);
      updateHud();
    },
  };
}
