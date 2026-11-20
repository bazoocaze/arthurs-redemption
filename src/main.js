// Bootstrap e loop principal. Aqui vive a ordem de update/render: simulação não
// conhece pixels, render não conhece regras.
import { COLORS, TIME } from './config.js';
import { generateWorld } from './generator.js';
import { Camera } from './camera.js';
import { attachInput } from './input.js';
import { drawTerrain } from './render/terrain.js';
import { drawTileHighlight } from './render/overlay.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const SEED = params.get('seed') ? Number(params.get('seed')) | 0 : (Math.random() * 0xffffffff) | 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const { grid } = generateWorld(SEED);
const camera = new Camera();
const state = { grid, hover: null, tool: 'pan' };

let dirty = true;
let time = 0;
let lastSig = '';
let lastHoverKey = '';
let lastShimmer = -1;
let fitted = false;

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
attachInput(canvas, camera, state);

// --- overlay de debug -----------------------------------------------------

const dbgEl = document.getElementById('debug');
const stats = { fps: 0, drawnTiles: 0, frames: 0, framesSkipped: 0 };
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
    `tiles ${stats.drawnTiles}`,
    `zoom ${camera.zoom.toFixed(3)}`,
    `cam ${camera.x.toFixed(0)},${camera.y.toFixed(0)}`,
    `view ${Math.round(camera.viewW)}x${Math.round(camera.viewH)}`,
    `tile ${h ? `${h.x},${h.y}` : '—'}`,
    `terra ${grid.initialLandTiles} · água ${grid.waterCount} (vol ${Math.round(grid.waterTotal)})`,
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
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, camera.viewW, camera.viewH);
  stats.drawnTiles = drawTerrain(ctx, grid, camera, time);
  if (state.hover) drawTileHighlight(ctx, camera, state.hover.x, state.hover.y);
}

let lastTs = 0;
function frame(ts) {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, TIME.maxDt) : 0;
  lastTs = ts;
  time += dt;

  updateDebug(dt);

  // Dirty de frame: nada mudou => não redesenha.
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
window.__game = { grid, camera, state, stats, seed: SEED };
