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
  const resetBtn = document.getElementById('reset-btn');
  const endEl = document.getElementById('end');
  const endGrade = document.getElementById('end-grade');
  const endTitle = document.getElementById('end-title');
  const endScore = document.getElementById('end-score');
  const endStats = document.getElementById('end-stats');
  const endMsg = document.getElementById('end-msg');
  const endRecords = document.getElementById('end-records');
  const endRestart = document.getElementById('end-restart');
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

  // Recomeçar: dois toques em até 3 s, sem modal. O primeiro arma o botão.
  let resetArmado = 0;
  let resetTimer = 0;
  const desarmar = () => {
    resetArmado = 0;
    resetBtn.classList.remove('armed');
    resetBtn.textContent = '↺';
  };
  resetBtn.addEventListener('click', () => {
    const agora = performance.now();
    if (resetArmado && agora - resetArmado < 3000) {
      desarmar();
      hooks.restart();
      return;
    }
    resetArmado = agora;
    resetBtn.classList.add('armed');
    resetBtn.textContent = '⚠️';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(desarmar, 3000);
  });

  endRestart.addEventListener('click', () => hooks.restart());

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
    /** Tela final: nota grande, stats por ícone, recordes que caíram. */
    showEnd(result, records, novos) {
      endGrade.textContent = result.grade;
      endGrade.className = `grade-${result.grade}`;
      endTitle.textContent = result.phase === 'victory' ? 'floresta salva' : 'secou';
      endScore.textContent = `${result.score} pontos`;

      const st = result.stats;
      const mm = Math.floor(st.elapsed / 60);
      const ss = Math.floor(st.elapsed % 60);
      const aguaPct = Math.round((st.waterLeft / st.waterInitial) * 100);
      const cob = Math.round((st.trees / st.landTotal) * 100);
      endStats.innerHTML = [
        `🌲 ${st.trees} (${cob}%)`,
        `💧 ${aguaPct}%`,
        `🔥 ${st.burned}`,
        `⏱ ${mm}:${String(ss).padStart(2, '0')}`,
      ].map((t) => `<span>${t}</span>`).join('');

      endMsg.textContent = result.message || '';

      const marcas = [];
      if (novos && novos.score) marcas.push('recorde de pontos');
      if (novos && novos.fastest) marcas.push('vitória mais rápida');
      if (novos && novos.coverage) marcas.push('maior cobertura');
      if (marcas.length) endRecords.textContent = `★ ${marcas.join(' · ')}`;
      else if (records && records.bestScore) endRecords.textContent = `melhor: ${records.bestScore}`;
      else endRecords.textContent = '';

      endEl.classList.remove('hidden');
      document.body.classList.add('ended');
    },
    hideEnd() {
      endEl.classList.add('hidden');
      document.body.classList.remove('ended');
    },
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
