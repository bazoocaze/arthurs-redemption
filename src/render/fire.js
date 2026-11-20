// Fogo e fumaça. Regras de performance que valem aqui (ver CODE-ATLAS §11):
//
// - **Chamas**: TODOS os focos num único path por cor (3 fills por frame, não
//   importa se são 10 ou 300 focos). Medido: 300 chamas = 0,22 ms.
// - **Fumaça**: partículas com sprite pré-renderizado, com ORÇAMENTO fixo
//   (`FIRE.maxSmoke`). É o efeito mais caro por ser alpha + escala; sem teto ele
//   cresce com o tamanho do incêndio até engasgar o frame.
//
// O fogo é visual: a simulação (sim/fire.js) não sabe que este arquivo existe.
import { TILE_W, TILE_H, ORIGIN_X, COLORS, FIRE } from '../config.js';
import { STATE } from '../grid.js';
import { hash2 } from '../rng.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export function createFx() {
  return {
    smoke: [], steam: [], acc: 0,
    sprite: null, steamSprite: null, flames: null, glow: null,
    seedCounter: 0,
  };
}

/**
 * Vapor: a água batendo no fogo. Diferente da fumaça em TUDO — branco em vez de
 * cinza, vida curta (0,5–0,9 s) em vez de segundos, sobe rápido e é pequeno.
 * É o feedback de "acertei": a fumaça é o fogo falando, o vapor é a água.
 */
export function spawnSteam(fx, x, y, quantidade = 2) {
  const room = FIRE.maxSteam - fx.steam.length;
  const n = Math.min(room, quantidade);
  for (let k = 0; k < n; k++) {
    const h1 = hash2(x * 17 + fx.seedCounter, y * 13, 41);
    const h2 = hash2(y * 11, x * 7 + fx.seedCounter, 43);
    fx.seedCounter++;
    fx.steam.push({
      wx: x + (h1 - 0.5) * 0.6,
      wy: y + (h2 - 0.5) * 0.6,
      vx: (h1 - 0.5) * 26,
      rise: 0,
      vrise: 34 + h2 * 30,
      drag: 1.6,
      t: 0,
      life: 0.5 + h1 * 0.4,
      size: 0.3 + h2 * 0.22,
    });
  }
}

const FLAME_FRAMES = 4;
const FLAME_W = 40;
const FLAME_H = 64;

/**
 * Chamas pré-renderizadas (4 quadros) + halo radial.
 * Desenhar triângulos num path era barato porém feio: 3 sprites com gradiente
 * custam ~2 drawImage por foco (~1 ms para 50 focos) e parecem fogo de verdade.
 */
function buildFlames(fx) {
  fx.flames = [];
  // O halo é assado dentro do sprite: composite 'lighter' por foco derrubou o
  // frame para 21 fps neste ambiente (blending aditivo é caro). Um drawImage
  // por foco, em source-over, custa uma fração disso.
  const PADX = 14; // halo menor = menos área de alpha por foco
  const PADY = 10;
  for (let f = 0; f < FLAME_FRAMES; f++) {
    const c = document.createElement('canvas');
    c.width = FLAME_W + PADX * 2;
    c.height = FLAME_H + PADY;
    const g = c.getContext('2d');
    const wob = (f / FLAME_FRAMES) * 0.9;

    const halo = g.createRadialGradient(c.width / 2, c.height - 14, 3, c.width / 2, c.height - 14, c.width * 0.52);
    halo.addColorStop(0, 'rgba(255, 138, 48, 0.42)');
    halo.addColorStop(0.55, 'rgba(226, 84, 24, 0.14)');
    halo.addColorStop(1, 'rgba(190, 50, 8, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, c.width, c.height);

    g.translate(PADX, 0);

    const grad = g.createLinearGradient(0, FLAME_H, 0, 0);
    grad.addColorStop(0, 'rgba(255, 236, 170, 0.98)');
    grad.addColorStop(0.35, 'rgba(255, 165, 60, 0.92)');
    grad.addColorStop(0.72, 'rgba(214, 74, 22, 0.55)');
    grad.addColorStop(1, 'rgba(150, 40, 10, 0)');

    // gota: base larga, ponta afinando com um vinco lateral (wob por quadro)
    const cx = FLAME_W / 2;
    g.beginPath();
    g.moveTo(cx + wob * 4, 2);
    g.bezierCurveTo(cx + 12, 26, cx + 15 - wob * 3, 44, cx + 11, FLAME_H - 2);
    g.bezierCurveTo(cx + 4, FLAME_H - 8, cx - 4, FLAME_H - 8, cx - 11, FLAME_H - 2);
    g.bezierCurveTo(cx - 15 + wob * 3, 44, cx - 10, 26, cx + wob * 4, 2);
    g.closePath();
    g.fillStyle = grad;
    g.fill();

    // núcleo quente
    const core = g.createRadialGradient(cx, FLAME_H - 14, 1, cx, FLAME_H - 14, 13);
    core.addColorStop(0, 'rgba(255, 250, 214, 0.95)');
    core.addColorStop(1, 'rgba(255, 190, 70, 0)');
    g.fillStyle = core;
    g.fillRect(0, FLAME_H - 32, FLAME_W, 32);
    fx.flames.push(c);
  }
}

function steamSprite(fx) {
  if (fx.steamSprite) return fx.steamSprite;
  const size = 32;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.45, 'rgba(232, 245, 252, 0.5)');
  grad.addColorStop(1, 'rgba(206, 228, 240, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  fx.steamSprite = c;
  return c;
}

function smokeSprite(fx) {
  if (fx.sprite) return fx.sprite;
  const size = 48;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(176, 168, 156, 0.5)');
  grad.addColorStop(0.5, 'rgba(140, 132, 122, 0.26)');
  grad.addColorStop(1, 'rgba(110, 104, 96, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  fx.sprite = c;
  return c;
}

/**
 * Avança as partículas. Só roda quando há fogo — sem fogo, custo zero.
 * `dt` vem clampado do loop principal.
 */
export function updateFx(fx, grid, dt) {
  const burning = grid.burningCount;

  if (burning > 0) {
    fx.acc += dt * burning * FIRE.smokePerBurning;
    const room = FIRE.maxSmoke - fx.smoke.length;
    const spawn = Math.min(room, Math.floor(fx.acc));
    if (spawn > 0) {
      fx.acc -= spawn;
      for (let k = 0; k < spawn; k++) {
        spawnSmoke(fx, grid);
      }
    } else if (fx.acc > 1) {
      fx.acc = 1; // não acumula dívida quando o orçamento está cheio
    }
  } else {
    fx.acc = 0;
  }

  advance(fx.steam, dt);
  advance(fx.smoke, dt);
}

/**
 * Integra uma lista de partículas. Campos: `wx/wy` (tile), `rise` (px de mundo
 * subindo), `vx/vrise`, `drag` (negativo = acelera pra cima), `t/life/size`.
 * Manter os nomes iguais entre fumaça e vapor já custou um bug de NaN (spawn
 * gravava `wx/wy`, update lia `x/y`, o desenho saía com NaN e nada aparecia).
 */
function advance(list, dt) {
  for (let k = 0; k < list.length; ) {
    const p = list[k];
    p.t += dt;
    if (p.t >= p.life) {
      list[k] = list[list.length - 1];
      list.pop();
      continue;
    }
    p.wx += p.vx * dt;
    p.rise += p.vrise * dt;
    p.vrise -= p.drag * dt;
    k++;
  }
}

function spawnSmoke(fx, grid) {
  const list = grid.burningTiles;
  if (!list.length) return;
  const i = list[Math.floor(hash2(fx.seedCounter, 7, 3) * list.length) % list.length];
  const x = i % grid.w;
  const y = (i - x) / grid.w;
  const h1 = hash2(x * 3 + fx.seedCounter, y * 5, 11);
  const h2 = hash2(y * 3, x * 5 + fx.seedCounter, 13);
  fx.seedCounter++;
  fx.smoke.push({
    wx: x + (h1 - 0.5) * 0.5,
    wy: y + (h2 - 0.5) * 0.5,
    vx: (h1 - 0.5) * 14,
    rise: 0,
    vrise: 16 + h2 * 18,
    drag: -6, // acelera para cima
    t: 0,
    life: FIRE.smokeLifeMin + h1 * (FIRE.smokeLifeMax - FIRE.smokeLifeMin),
    size: 0.7 + h2 * 0.7,
  });
}

function baseX(cam, x, y) {
  return ((x - y) * HW + ORIGIN_X - cam.x) * cam.zoom;
}

function baseY(cam, x, y) {
  return ((x + y) * HH + HH - cam.y) * cam.zoom;
}

/** Chamas + fumaça. Desenhar depois das árvores (fogo fica na frente). */
export function drawFx(ctx, grid, cam, time, fx) {
  const z = cam.zoom;
  const burning = grid.burningTiles;
  if (!burning.length && !fx.smoke.length && !fx.steam.length) return 0;

  // Ordem: fumaça (fuligem, cinza) -> chamas -> vapor (branco, por cima).
  // A ordem é a mensagem: o que está embaixo é o que o fogo solta; o vapor da
  // água fica na frente porque é o que o jogador acabou de fazer.

  if (fx.smoke.length) {
    const sprite = smokeSprite(fx);
    for (let k = 0; k < fx.smoke.length; k++) {
      const p = fx.smoke[k];
      const lifeT = p.t / p.life;
      const alpha = (1 - lifeT) * (lifeT < 0.15 ? lifeT / 0.15 : 1) * 0.9;
      const size = (TILE_W * 0.62 * p.size * (0.7 + lifeT * 1.2)) * z;
      const sx = baseX(cam, p.wx, p.wy);
      const sy = baseY(cam, p.wx, p.wy) - p.rise * z * 0.5;
      if (sx + size < 0 || sx - size > cam.viewW || sy + size < 0 || sy - size > cam.viewH) continue;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  if (burning.length) {
    if (!fx.flames) buildFlames(fx);
    const frame = Math.floor(time * 9);
    const tileH = TILE_H * z;
    // Orçamento de chamas: acima disso desenha um subconjunto. A diferença
    // visual é nula num incêndio grande, e protege o frame de um pico de 500 focos.
    const stride = Math.max(1, Math.ceil(burning.length / FIRE.maxFlames));
    for (let k = 0; k < burning.length; k += stride) {
      const i = burning[k];
      const x = i % grid.w;
      const y = (i - x) / grid.w;
      const sx = baseX(cam, x, y);
      const sy = baseY(cam, x, y);
      if (sx < -TILE_W * 2 || sx > cam.viewW + TILE_W * 2) continue;
      if (sy < -TILE_H * 4 || sy > cam.viewH + TILE_H * 3) continue;
      const spr = fx.flames[Math.floor(hash2(x, y, frame) * FLAME_FRAMES) % FLAME_FRAMES];
      const flick = hash2(y * 3, x, frame + 3);
      const grow = Math.min(1, 0.4 + grid.burnT[i] / (FIRE.burnTime * 0.4));
      const h = tileH * (1.35 + flick * 0.5) * grow * (spr.height / FLAME_H);
      const w = h * (spr.width / spr.height);
      ctx.drawImage(spr, sx - w / 2, sy - h * 0.84, w, h);
    }
  }

  if (fx.steam.length) {
    const sp = steamSprite(fx);
    for (let k = 0; k < fx.steam.length; k++) {
      const p = fx.steam[k];
      const lifeT = p.t / p.life;
      const size = TILE_W * p.size * (0.6 + lifeT * 1.3) * z;
      const sx = baseX(cam, p.wx, p.wy);
      const sy = baseY(cam, p.wx, p.wy) - p.rise * z * 0.5;
      if (sx + size < 0 || sx - size > cam.viewW || sy + size < 0 || sy - size > cam.viewH) continue;
      ctx.globalAlpha = (1 - lifeT) * 0.72;
      ctx.drawImage(sp, sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  return burning.length;
}
