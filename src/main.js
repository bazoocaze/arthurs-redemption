// Bootstrap e loop principal. Aqui vive a ordem de update/render: simulação não
// conhece pixels, render não conhece regras.
import { COLORS, TIME, BRUSH, FIRE } from './config.js';
import { generateWorld } from './generator.js';
import { Camera } from './camera.js';
import { createInput } from './input.js';
import { drawTerrain } from './render/terrain.js';
import { drawTrees } from './render/trees.js';
import { prebuildSprites } from './render/sprites.js';
import { drawBrush } from './render/overlay.js';
import { createFx, updateFx, drawFx } from './render/fire.js';
import { applyBrush, strokePath } from './sim/paint.js';
import { stepFire, igniteRadius } from './sim/fire.js';
import { createUi } from './ui.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
// 0 = escondido, 1 = chip de fps/redraw, 2 = painel completo (?debug=1)
let dbgMode = DEBUG ? 2 : 1;
const SEED = params.get('seed') ? Number(params.get('seed')) | 0 : (Math.random() * 0xffffffff) | 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const { grid } = generateWorld(SEED);
const fx = createFx();
const camera = new Camera();
const state = {
  grid,
  hover: null,
  tool: 'tree',
  brushRadius: BRUSH.defaultRadius,
  seed: SEED,
};

// `frames` conta frames desenhados e `framesSkipped` os pulados pelo dirty flag.
// O par (fps, redrawPct) é o que mostra se o jogo está sendo redesenhado demais
// (câmera/pintura ativas) ou de menos (parado, gastando 0 ms).
const stats = {
  fps: 0, redrawPct: 0, redrawHz: 0,
  renderMs: 0, terrainMs: 0, treesMs: 0, overlayMs: 0,
  drawnTiles: 0, drawnTrees: 0, frames: 0, framesSkipped: 0,
};

let dirty = true;
let time = 0;
let lastSig = '';
let lastHoverKey = '';
let lastShimmer = -1;
let lastPaintTile = null;
let fitted = false;

// --- pintura --------------------------------------------------------------

function paintPath(path) {
  let changed = 0;
  for (const t of path) changed += applyBrush(grid, t.x, t.y, state.brushRadius, state.tool, SEED);
  if (changed) {
    dirty = true;
    ui.updateHud();
  }
  return changed;
}

const hooks = {
  beginStroke(tile) {
    lastPaintTile = tile;
    paintPath([tile]);
  },
  moveStroke(tile) {
    if (!lastPaintTile) {
      hooks.beginStroke(tile);
      return;
    }
    const path = strokePath(lastPaintTile, tile);
    lastPaintTile = tile;
    if (path.length) paintPath(path);
  },
  endStroke() {
    lastPaintTile = null;
  },
  setTool(tool) {
    state.tool = tool;
    ui.refreshTool();
    dirty = true;
  },
  /** Debug/teste: acende fogo em disco. Em M5 quem chama é a bomba. */
  ignite(x, y, radius = 4) {
    const lit = igniteRadius(grid, x, y, radius, SEED);
    if (lit) {
      dirty = true;
      ui.updateHud();
    }
    return lit;
  },
  setBrushRadius(r) {
    state.brushRadius = r;
    ui.updateHud();
    dirty = true;
  },
};

prebuildSprites();

const ui = createUi(state, hooks);
ui.setWaterInitial(grid.waterTotal);

// --- viewport -------------------------------------------------------------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.setViewport(w, h);
  if (!fitted) {
    camera.fitWorld();
    fitted = true;
  }
  dirty = true;
}

window.addEventListener('resize', resize);
const input = createInput(canvas, camera, state, hooks);

// --- overlay de debug -----------------------------------------------------

const dbgEl = document.getElementById('debug');
const perfEl = document.getElementById('perf');
// Janela deslizante de 0,5 s: fps, frames redesenhados/s e o percentual deles.
const win = { t: 0, total: 0, redrawn: 0 };
let dbgTimer = 0;

function sampleFrame(dt, redrawn) {
  win.t += dt;
  win.total++;
  if (redrawn) win.redrawn++;
  if (win.t >= 0.5) {
    stats.fps = Math.round(win.total / win.t);
    stats.redrawHz = +(win.redrawn / win.t).toFixed(1);
    stats.redrawPct = Math.round((win.redrawn / win.total) * 100);
    win.t = 0;
    win.total = 0;
    win.redrawn = 0;
  }
}

function updateDebug(dt) {
  dbgTimer += dt;
  if (dbgMode === 0 || dbgTimer < 0.25) return;
  dbgTimer = 0;

  const totalFrames = stats.frames + stats.framesSkipped;
  const allPct = totalFrames ? Math.round((stats.frames / totalFrames) * 100) : 0;

  if (dbgMode === 1) {
    perfEl.innerHTML = `<b>${stats.fps}</b> fps · <b>${stats.redrawPct}%</b> redraw`;
    return;
  }

  const h = state.hover;
  dbgEl.textContent = [
    `fps ${stats.fps} · redraw ${stats.redrawPct}% (${stats.redrawHz}/s)`,
    `tiles ${stats.drawnTiles} · árvores ${stats.drawnTrees} · ${stats.renderMs.toFixed(1)}ms`,
    `  terreno ${stats.terrainMs.toFixed(1)} · árvores ${stats.treesMs.toFixed(1)} · overlay ${stats.overlayMs.toFixed(1)}`,
    `zoom ${camera.zoom.toFixed(3)}`,
    `tool ${state.tool} r${state.brushRadius}`,
    `tile ${h ? `${h.x},${h.y}` : '—'}`,
    `árvores ${grid.treeCount}/${grid.landTotal} (${(grid.coverage() * 100).toFixed(1)}%)`,
    `água ${grid.waterCount} tiles · vol ${grid.waterTotal.toFixed(0)}`,
    `fogo ${grid.burningCount} focos · cinza ${grid.ashCount} · fumaça ${fx.smoke.length}`,
    `seed ${SEED}`,
    `frames ${stats.frames} · pulados ${stats.framesSkipped} (redraw ${allPct}% no total)`,
  ].join('\n');
}

// --- loop -----------------------------------------------------------------

// Motivo de frame que depende de ENTRADA: tem prioridade absoluta, sem throttle.
function inputFrame() {
  const sig = camera.signature();
  if (sig !== lastSig) {
    lastSig = sig;
    return true;
  }
  const hk = state.hover ? `${state.hover.x},${state.hover.y}` : '';
  if (hk !== lastHoverKey) {
    lastHoverKey = hk;
    return true;
  }
  return false;
}

// Motivo de frame só visual (fogo, fumaça, umidade, shimmer da água).
function animFrame() {
  if (grid.burningCount > 0 || fx.smoke.length > 0 || grid.wetTiles.length > 0) return true;
  const shimmer = Math.floor(time * TIME.waterShimmerHz);
  if (shimmer !== lastShimmer) {
    lastShimmer = shimmer;
    return true;
  }
  return false;
}

// --- fogo: passo fixo -------------------------------------------------------
// Tick fixo (não dt variável) para o incêndio ser determinístico: mesma seed +
// mesma sequência de acertos => mesmo resultado, o que torna o fogo testável
// sem browser. O guard limita o trabalho depois de uma aba em background.
const FIRE_DT = 1 / FIRE.tickRate;
let fireAcc = 0;

function updateFire(dt) {
  fireAcc += dt;
  let guard = 0;
  while (fireAcc >= FIRE_DT && guard++ < 8) {
    fireAcc -= FIRE_DT;
    stepFire(grid, FIRE_DT, SEED);
  }
  if (fireAcc > FIRE_DT * 8) fireAcc = 0;
  updateFx(fx, grid, dt);
  // NÃO marcar `dirty` aqui: o fogo é animação, não entrada. Quem pede o frame é
  // `animFrame()`, que obedece ao teto de `TIME.animHz`.
}

function render() {
  const t0 = performance.now();
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, camera.viewW, camera.viewH);
  const t1 = performance.now();
  stats.drawnTiles = drawTerrain(ctx, grid, camera, time);
  const t2 = performance.now();
  stats.drawnTrees = drawTrees(ctx, grid, camera);
  drawFx(ctx, grid, camera, time, fx);
  const t3 = performance.now();
  if (state.hover && state.tool !== 'pan') {
    drawBrush(ctx, grid, camera, state.hover.x, state.hover.y, state.brushRadius);
  }
  const t4 = performance.now();
  stats.terrainMs = t2 - t1;
  stats.treesMs = t3 - t2;
  stats.overlayMs = t4 - t3;
  stats.renderMs = t4 - t0;
}

let lastTs = 0;
let lastRenderTs = -1e9;
function frame(ts) {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, TIME.maxDt) : 0;
  lastTs = ts;
  time += dt;

  input.update(dt);
  updateFire(dt);

  // Ordem: entrada renderiza na hora; animação obedece ao teto de `TIME.animHz`.
  let redrawn = dirty || inputFrame();
  if (!redrawn && animFrame()) {
    const gap = 1000 / TIME.animHz;
    if (ts - lastRenderTs >= gap - 2) redrawn = true; // -2 ms absorve jitter do RAF
  }

  if (redrawn) {
    render();
    lastRenderTs = ts;
    dirty = false;
    stats.frames++;
  } else {
    stats.framesSkipped++;
  }

  sampleFrame(dt, redrawn);
  updateDebug(dt);

  requestAnimationFrame(frame);
}

resize();

function applyDbgMode() {
  perfEl.style.display = dbgMode === 1 ? 'block' : 'none';
  dbgEl.style.display = dbgMode === 2 ? 'block' : 'none';
}

// ` cicla escondido -> chip de fps -> painel completo. Não usamos F3: no
// Chrome/Firefox F3 é "localizar próxima".
window.addEventListener('keydown', (e) => {
  // I acende fogo no tile sob o cursor (só com debug aberto; M5 traz as bombas)
  if ((e.key === 'i' || e.key === 'I') && dbgMode === 2 && state.hover) {
    hooks.ignite(state.hover.x, state.hover.y, 4);
    return;
  }
  if (e.key !== '`' || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  dbgMode = (dbgMode + 1) % 3;
  if (dbgMode !== 2) dbgEl.textContent = '';
  applyDbgMode();
});

applyDbgMode();
requestAnimationFrame(frame);

// Hook de inspeção manual no console (usado pelos probes headless).
window.__game = { grid, camera, state, stats, hooks, fx, seed: SEED };
