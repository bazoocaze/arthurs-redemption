// Bootstrap e loop principal. Aqui vive a ordem de update/render: simulação não
// conhece pixels, render não conhece regras.
import { COLORS, TIME, BRUSH } from './config.js';
import { generateWorld } from './generator.js';
import { Camera } from './camera.js';
import { createInput } from './input.js';
import { drawTerrain } from './render/terrain.js';
import { drawTrees } from './render/trees.js';
import { prebuildSprites } from './render/sprites.js';
import { drawBrush } from './render/overlay.js';
import { applyBrush, strokePath } from './sim/paint.js';
import { createUi } from './ui.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const SEED = params.get('seed') ? Number(params.get('seed')) | 0 : (Math.random() * 0xffffffff) | 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const { grid } = generateWorld(SEED);
const camera = new Camera();
const state = {
  grid,
  hover: null,
  tool: 'tree',
  brushRadius: BRUSH.defaultRadius,
  seed: SEED,
};

const stats = {
  fps: 0, renderMs: 0, terrainMs: 0, treesMs: 0, overlayMs: 0,
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
let fpsAccum = 0;
let fpsFrames = 0;
let dbgTimer = 0;

function updateDebug(dt) {
  fpsFrames++;
  fpsAccum += dt;
  dbgTimer += dt;
  if (fpsAccum >= 0.5) {
    stats.fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
  }
  if (!DEBUG || dbgTimer < 0.25) return;
  dbgTimer = 0;
  const h = state.hover;
  dbgEl.textContent = [
    `fps ${stats.fps}`,
    `tiles ${stats.drawnTiles} · árvores ${stats.drawnTrees} · ${stats.renderMs.toFixed(1)}ms`,
    `  terreno ${stats.terrainMs.toFixed(1)} · árvores ${stats.treesMs.toFixed(1)} · overlay ${stats.overlayMs.toFixed(1)}`,
    `zoom ${camera.zoom.toFixed(3)}`,
    `tool ${state.tool} r${state.brushRadius}`,
    `tile ${h ? `${h.x},${h.y}` : '—'}`,
    `árvores ${grid.treeCount}/${grid.landTotal} (${(grid.coverage() * 100).toFixed(1)}%)`,
    `água ${grid.waterCount} tiles · vol ${grid.waterTotal.toFixed(0)}`,
    `seed ${SEED}`,
  ].join('\n');
}

// --- loop -----------------------------------------------------------------

function needsFrame() {
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
  const shimmer = Math.floor(time * TIME.waterShimmerHz);
  if (shimmer !== lastShimmer) {
    lastShimmer = shimmer;
    return true;
  }
  return false;
}

function render() {
  const t0 = performance.now();
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, camera.viewW, camera.viewH);
  const t1 = performance.now();
  stats.drawnTiles = drawTerrain(ctx, grid, camera, time);
  const t2 = performance.now();
  stats.drawnTrees = drawTrees(ctx, grid, camera);
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
function frame(ts) {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, TIME.maxDt) : 0;
  lastTs = ts;
  time += dt;

  input.update(dt);
  updateDebug(dt);

  if (dirty || needsFrame()) {
    render();
    dirty = false;
    stats.frames++;
  } else {
    stats.framesSkipped++;
  }

  requestAnimationFrame(frame);
}

resize();
if (DEBUG) dbgEl.style.display = 'block';
requestAnimationFrame(frame);

// Hook de inspeção manual no console (usado pelos probes headless).
window.__game = { grid, camera, state, stats, hooks, seed: SEED };
