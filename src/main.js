// Bootstrap e loop principal. Aqui vive a ordem de update/render: simulação não
// conhece pixels, render não conhece regras.
import { COLORS, TIME, BRUSH, FIRE, BOMB, TILE_W, ORIGIN_X, CAM, WORLD_W, WORLD_H } from './config.js';
import { generateWorld } from './generator.js';
import { Camera } from './camera.js';
import { createInput } from './input.js';
import { drawTerrain } from './render/terrain.js';
import { drawTrees } from './render/trees.js';
import { prebuildSprites } from './render/sprites.js';
import { drawBrush } from './render/overlay.js';
import { createFx, updateFx, drawFx, spawnSteam } from './render/fire.js';
import { applyBrush, strokePath } from './sim/paint.js';
import { stepFire, igniteRadius } from './sim/fire.js';
import { createBombs, updateBombs, dropBomb, bombsForEvent, pickTarget } from './sim/bombs.js';
import {
  createBombFx, spawnBlast, updateBombFx, drawBombs, drawBombFx, bombFxActive,
} from './render/bombs.js';
import { createUi } from './ui.js';
import { createAudio } from './audio.js';
import { readSave, saveGame, clearSave } from './save.js';
import {
  PHASE, createGame, checkEnd, endGame, computeScore, updateRecords, loadRecords, endMessage,
} from './game.js';
import { hash2 } from './rng.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
// 0 = escondido, 1 = chip de fps/redraw, 2 = painel completo (?debug=1)
let dbgMode = DEBUG ? 2 : 1;
// `?fresh=1` ignora (e apaga) o save: útil para testar o começo do jogo.
const FRESH = params.get('fresh') === '1';
if (FRESH) clearSave();
const SAVED = FRESH ? null : readSave();
// Sem seed na URL, retomar o save manda: o mundo é regenerado com a MESMA seed,
// então terreno, rios e denominador de cobertura saem idênticos.
const SEED = params.get('seed')
  ? Number(params.get('seed')) | 0
  : SAVED
    ? SAVED.seed
    : (Math.random() * 0xffffffff) | 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const { grid } = generateWorld(SEED);
const fx = createFx();
const audio = createAudio();
const bombs = createBombs(SEED);
const game = createGame(grid.waterTotal);
const bombFx = createBombFx();
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
// Câmera do save esperando o viewport existir (ver `resize`).
let savedView = null;

// --- pintura --------------------------------------------------------------

// A sim empurra eventos (spray, ignição, extinção) e o render os traduz em
// partículas. Mantém sim/paint e sim/fire sem nenhuma dependência de canvas.
/** Posição do tile no eixo horizontal da tela, normalizada em -1..1 (pan do som). */
function panFor(x, y) {
  const sx = ((x - y) * (TILE_W / 2) + ORIGIN_X - camera.x) * camera.zoom;
  return Math.max(-1, Math.min(1, ((sx / camera.viewW) * 2 - 1) * 0.8));
}

function drainEvents() {
  const ev = grid.events;
  for (let k = 0; k < ev.length; k++) {
    const e = ev[k];
    audio.play(e.type, panFor(e.x, e.y));
    if (e.type === 'ash') game.burned++; // cada cinza é uma árvore perdida
    if (e.type === 'spray') spawnSteam(fx, e.x, e.y, 1);
    else if (e.type === 'extinguish') spawnSteam(fx, e.x, e.y, 5);
    else if (e.type === 'explosion') {
      spawnBlast(bombFx, e.x, e.y);
      shake.t = BOMB.shakeSeconds;
      shake.x = (hash2(e.x, e.y, 5) - 0.5) * 2 * BOMB.shakeMag;
      shake.y = (hash2(e.y, e.x, 9) - 0.5) * 2 * BOMB.shakeMag;
      ui.updateHud();
    }
  }
  ev.length = 0;
}

/** Fecha a partida: mostra a tela final, grava recordes e não salva mais. */
function finish(result) {
  game.result = result;
  const { records, novos } = updateRecords(result);
  result.message = endMessage(result);
  ui.showEnd(result, records, novos);
  saveDescartado = true; // a partida acabou: recarregar começa outra
  clearSave();
  dirty = true;
  return result;
}

function paintPath(path) {
  if (game.phase !== PHASE.PLAYING) return 0;
  let changed = 0;
  for (const t of path) changed += applyBrush(grid, t.x, t.y, state.brushRadius, state.tool, SEED);
  drainEvents();
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
  /** Debug/teste: solta uma bomba no tile exato (tecla B). */
  bomb(x, y) {
    dropBomb(bombs, grid, x, y, SEED);
    dirty = true;
    return bombs.inFlight.length;
  },
  /**
   * Debug/teste: solta uma bomba como o JOGO sorteia (tecla N) — 50% aleatorio,
   * 50% mirando floresta, e sempre evitando o ultimo impacto. Serve para
   * validar a distribuicao; a tecla B pinta o alvo do cursor, entao repetir B
   * com o mouse parado cai sempre no mesmo tile (por design).
   */
  naturalBomb() {
    const t = pickTarget(bombs, grid);
    if (!t) return null;
    dropBomb(bombs, grid, t.x, t.y, SEED);
    dirty = true;
    return t;
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
  toggleMute() {
    audio.unlock();
    const mudo = audio.toggleMute();
    ui.setMuted(mudo);
    return mudo;
  },
  /** Debug: força vitória (tecla V com ?debug=1). */
  win() {
    const r = endGame(game, grid, bombs.elapsed, PHASE.VICTORY);
    return r && game.result === r ? finish(r) : game.result;
  },
  /** Debug: força derrota por seca (tecla L com ?debug=1). */
  lose() {
    const r = endGame(game, grid, bombs.elapsed, PHASE.DROUGHT);
    return r && game.result === r ? finish(r) : game.result;
  },
  /** Estado da partida (usado pelos probes). */
  gameInfo() {
    const score = computeScore(game, grid, bombs.elapsed);
    return {
      phase: game.phase, score: score.score, grade: score.grade, parts: score.parts,
      coverage: +grid.coverage().toFixed(4), water: Math.round(grid.waterTotal),
      waterInitial: Math.round(game.waterInitial), burned: game.burned,
      elapsed: +bombs.elapsed.toFixed(1),
    };
  },
  /** Recomeçar do zero: apaga o save e recarrega (confirmação em ui.js). */
  restart() {
    saveDescartado = true;
    clearSave();
    location.reload();
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
ui.setMuted(audio.muted); // estado do mudo é persistido em localStorage

// --- retomada -------------------------------------------------------------
// A ordem importa: `waterInitial` é o reservatório do mundo recém-gerado (para a
// barra de água mostrar o que já foi gasto), e só depois o save sobrescreve o
// estado. A câmera também é restaurada antes de `resize()` para o `fitWorld`
// não sobrescrever a posição salva.
let retomado = false;
if (SAVED) {
  const meta = SAVED.apply(grid);
  if (meta) {
    retomado = true;
    bombs.elapsed = meta.bombs.elapsed;
    bombs.events = meta.bombs.events;
    bombs.launched = meta.bombs.launched;
    bombs.impacts = meta.bombs.impacts;
    bombs.lastTarget = meta.bombs.lastTarget;
    // Um save podia trazer `nextEventAt` no passado (game salvo no instante do
    // evento); dar 8 s de respiro evita tomar bomba no primeiro frame.
    bombs.nextEventAt = Math.max(meta.bombs.nextEventAt, bombs.elapsed + 8);
    if (meta.camera.zoom > 0) {
      // O save devolve o LUGAR onde a partida parou, não o zoom: o zoom de
      // abertura é sempre CAM.initialZoom. Guardar em vez de aplicar agora
      // porque o centro só pode ser calculado depois de `setViewport`.
      savedView = meta.camera;
      fitted = true;
    }
    state.brushRadius = meta.ui.brushRadius || state.brushRadius;
    state.tool = meta.ui.tool || state.tool;
    ui.refreshTool();
    ui.updateHud();
  }
}

// --- viewport -------------------------------------------------------------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.setViewport(w, h);
  if (savedView) {
    // Retomada: continua na mesma região, trocando para o zoom de abertura.
    const cx = savedView.x + w / (2 * savedView.zoom);
    const cy = savedView.y + h / (2 * savedView.zoom);
    camera.zoom = CAM.initialZoom;
    camera.centerOn(cx, cy);
    savedView = null;
    fitted = true;
  } else if (!fitted) {
    // Abre em zoom 1 (detalhe), centrado no mapa. `F` reenquadra o mundo.
    camera.zoom = CAM.initialZoom;
    camera.centerOn(WORLD_W / 2, WORLD_H / 2);
    fitted = true;
  }
  dirty = true;
}

window.addEventListener('resize', resize);
const input = createInput(canvas, camera, state, hooks);

// --- instalar como app ----------------------------------------------------
// Android/Chrome: `beforeinstallprompt` dá o diálogo nativo, e o botão da
// paleta só aparece quando ele existe. iOS não tem evento nenhum — o caminho é
// Compartilhar → Adicionar à Tela de Início, então ali a única coisa útil é
// dizer isso, uma vez, em vez de deixar a opção invisível.
const installBtn = document.getElementById('install-btn');
let installPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (installBtn) installBtn.hidden = false;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  if (installBtn) installBtn.hidden = true;
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const escolha = await installPrompt.userChoice.catch(() => null);
    if (escolha && escolha.outcome === 'accepted') installBtn.hidden = true;
    installPrompt = null;
  });
}

const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const ehWebView = /FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent);
const jaInstalado =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  navigator.standalone === true;

if (ehIOS && !jaInstalado && !ehWebView) {
  setTimeout(() => ui.hint('para instalar: compartilhar → adicionar à tela de início'), 3500);
}

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
    `fogo ${grid.burningCount} focos · cinza ${grid.ashCount} · fumaça ${fx.smoke.length} · vapor ${fx.steam.length}`,
    `bombas ${bombs.inFlight.length} em voo · eventos ${bombs.events} · próximo em ${Math.max(0, bombs.nextEventAt - bombs.elapsed).toFixed(0)}s`,
    `no próximo evento: ${bombsForEvent(bombs.elapsed)} bomba(s)`,
    `som ${audio.muted ? '🔇' : '🔊'} · vozes ${audio.vozes}`,
    `jogo ${game.phase} · nota ${computeScore(game, grid, bombs.elapsed).grade} · perdidas ${game.burned}`,
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
  if (grid.burningCount > 0 || fx.smoke.length > 0 || fx.steam.length > 0) return true;
  if (grid.wetTiles.length > 0 || bombFxActive(bombs, bombFx)) return true;
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
  updateBombs(bombs, grid, dt, SEED);
  updateBombFx(bombFx, dt);
  audio.update(dt, grid.burningCount, bombs);
  tickSave(dt);
  // NÃO marcar `dirty` aqui: o fogo é animação, não entrada. Quem pede o frame é
  // `animFrame()`, que obedece ao teto de `TIME.animHz`.
}

const shake = { t: 0, x: 0, y: 0 };

// --- save -----------------------------------------------------------------
// 10 s de intervalo: serializar custa ~5 ms (123 KB de base64), invisível num
// frame de 16 ms, mas não é grátis a 60 fps. Também salva ao sair da aba.
const SAVE_INTERVAL = 10;
let saveAcc = 0;
// Recomeçar apaga o save e recarrega — mas `pagehide`/`visibilitychange` salvam
// ao sair, e salvariam de novo o estado que acabou de ser descartado.
let saveDescartado = false;

function salvar() {
  if (saveDescartado) return 0;
  return saveGame({
    grid, seed: SEED, elapsed: bombs.elapsed, bombs, camera, state,
  });
}

function tickSave(dt) {
  saveAcc += dt;
  if (saveAcc < SAVE_INTERVAL) return;
  saveAcc = 0;
  salvar();
}

// --- pause ----------------------------------------------------------------
// Fora da aba o jogo não simula: fogo, bombas e o relógio da partida param, e o
// áudio é suspenso (a cama de fogo continuaria tocando na aba escondida).
// `visibilitychange` cobre trocar de aba, minimizar, trocar de app no celular e
// bloquear a tela — que é o que "não estar na tela" significa aqui.
let pausado = false;

function pausar() {
  if (pausado) return;
  pausado = true;
  audio.suspender();
  lastTs = 0; // o próximo frame não conta o tempo parado
}

function retomar() {
  if (!pausado) return;
  pausado = false;
  lastTs = 0;
  audio.retomar();
  dirty = true; // a aba pode voltar com o canvas desatualizado
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    pausar();
    salvar();
  } else {
    retomar();
  }
});
window.addEventListener('pagehide', () => {
  pausar();
  salvar();
});
// Voltando do cache de navegação (bfcache) a página é a mesma: só retoma.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) retomar();
});

function render() {
  const t0 = performance.now();
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, camera.viewW, camera.viewH);

  // Tremor: decai em `BOMB.shakeSeconds`. Aplicado depois do fundo (que precisa
  // cobrir a tela inteira) e antes de tudo que é cena.
  let sx = 0;
  let sy = 0;
  if (shake.t > 0) {
    const k = shake.t / BOMB.shakeSeconds;
    sx = shake.x * k;
    sy = shake.y * k;
    shake.t = Math.max(0, shake.t - Math.max(0.016, lastDt));
  }
  if (sx || sy) {
    ctx.save();
    ctx.translate(sx, sy);
  }
  const t1 = performance.now();
  stats.drawnTiles = drawTerrain(ctx, grid, camera, time);
  const t2 = performance.now();
  stats.drawnTrees = drawTrees(ctx, grid, camera);
  drawFx(ctx, grid, camera, time, fx);
  drawBombs(ctx, bombs, camera, time);
  drawBombFx(ctx, camera, bombFx);
  const t3 = performance.now();
  if (state.hover && state.tool !== 'pan') {
    drawBrush(ctx, grid, camera, state.hover.x, state.hover.y, state.brushRadius);
  }
  if (sx || sy) ctx.restore();
  const t4 = performance.now();
  stats.terrainMs = t2 - t1;
  stats.treesMs = t3 - t2;
  stats.overlayMs = t4 - t3;
  stats.renderMs = t4 - t0;
}

let lastTs = 0;
let lastDt = 0.016;
let lastRenderTs = -1e9;
// Autoplay policy: o contexto de áudio só nasce de um gesto do usuário.
for (const evName of ['pointerdown', 'keydown']) {
  window.addEventListener(evName, () => audio.unlock(), { once: false, passive: true });
}

function frame(ts) {
  // Pausado: nada de simulação, partículas, música ou desenho. Só o RAF
  // continua batendo para o jogo retomar no mesmo lugar.
  if (pausado) {
    lastTs = 0;
    requestAnimationFrame(frame);
    return;
  }

  const dt = lastTs ? Math.min((ts - lastTs) / 1000, TIME.maxDt) : 0;
  lastTs = ts;
  lastDt = dt;
  time += dt;

  input.update(dt);
  if (game.phase === PHASE.PLAYING) {
    updateFire(dt);
    drainEvents();
    const fim = checkEnd(game, grid, bombs.elapsed);
    if (fim) finish(fim);
  } else {
    drainEvents(); // deixa as partículas terminarem
  }

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
//
// As teclas de debug (I, N, B, V, L) só existem com o painel ABERTO
// (`dbgMode === 2`): o painel é a chave geral, não o `?debug=1` da URL.
window.addEventListener('keydown', (e) => {
  // I acende fogo no tile sob o cursor (só com debug aberto; M5 traz as bombas)
  if ((e.key === 'i' || e.key === 'I') && dbgMode === 2 && state.hover) {
    hooks.ignite(state.hover.x, state.hover.y, 4);
    return;
  }
  // N = bomba como o jogo sorteia (B mira o cursor e repete o mesmo tile).
  if ((e.key === 'n' || e.key === 'N') && dbgMode === 2) {
    hooks.naturalBomb();
    return;
  }
  if (e.key === 'm' || e.key === 'M') {
    audio.unlock();
    const mudo = audio.toggleMute();
    ui.setMuted(mudo);
    return;
  }
  if (dbgMode === 2 && (e.key === 'v' || e.key === 'V')) {
    hooks.win();
    return;
  }
  if (dbgMode === 2 && (e.key === 'l' || e.key === 'L')) {
    hooks.lose();
    return;
  }
  // D alterna o painel de debug (o gate das teclas especiais).
  if (e.key === 'd' || e.key === 'D') {
    dbgMode = dbgMode === 2 ? 1 : 2;
    applyDbgMode();
    if (dbgMode !== 2) dbgEl.textContent = '';
    dirty = true;
    return;
  }
  if ((e.key === 'b' || e.key === 'B') && dbgMode === 2 && state.hover) {
    hooks.bomb(state.hover.x, state.hover.y);
    return;
  }
  if (e.key !== '`' || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  dbgMode = (dbgMode + 1) % 3;
  if (dbgMode !== 2) dbgEl.textContent = '';
  applyDbgMode();
});

// PWA: service worker deixa o jogo instalável e offline. `?nosw=1` desliga
// (útil para depurar cache preso).
//
// `updateViaCache: 'none'` é o que faz a troca de versão aparecer: sem isso o
// navegador pode servir o `sw.js` do cache HTTP (o GitHub Pages manda
// `max-age=600`) e passar até 10 min achando que não há nada novo.
if ('serviceWorker' in navigator && !params.get('nosw')) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      // Aba/app volta à frente: pergunta agora, não daqui a 24 h.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch {}
  });

  // Instalou uma versão nova (`skipWaiting` já assume o controle): recarrega
  // uma vez para o jogador não ficar num app meio-velho. O save é gravado no
  // `pagehide`, então o progresso não se perde.
  let recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregando) return;
    recarregando = true;
    if (document.visibilityState === 'visible') location.reload();
  });
}

applyDbgMode();
requestAnimationFrame(frame);

// Hook de inspeção manual no console (usado pelos probes headless).
window.__game = {
  grid, camera, state, stats, hooks, fx, bombs, bombFx, audio,
  seed: SEED, retomado, salvar, clearSave, game, records: loadRecords(), PHASE,
  get pausado() { return pausado; },
  get auditivo() { return audio.ativo ? audio.debugCtx.state : 'sem contexto'; },
};
