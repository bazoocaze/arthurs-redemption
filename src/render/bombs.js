// Render do bombardeio: bomba em voo (arco + sombra que cresce) e explosão.
//
// O arco é calculado em espaço de TELA: a bomba vem de fora da tela e cai no
// alvo. A sombra no chão é o que dá a leitura de profundidade — ela cresce e
// escurece conforme a bomba desce, então o jogador vê onde vai cair ANTES do
// impacto (é a única "aviso" que o jogo dá).
import { TILE_W, TILE_H, ORIGIN_X, COLORS, BOMB } from '../config.js';
import { hash2 } from '../rng.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export function createBombFx() {
  return { blasts: [], dust: [], ring: null, seedCounter: 0 };
}

function baseX(cam, x, y) {
  return ((x - y) * HW + ORIGIN_X - cam.x) * cam.zoom;
}

function baseY(cam, x, y) {
  return ((x + y) * HH + HH - cam.y) * cam.zoom;
}

/** Nuvem de poeira (canvas reaproveitado do vapor, mas mais quente). */
function dustSprite(fx) {
  if (fx.dustSprite) return fx.dustSprite;
  const size = 40;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(196, 168, 132, 0.75)');
  grad.addColorStop(0.5, 'rgba(150, 124, 94, 0.4)');
  grad.addColorStop(1, 'rgba(120, 98, 74, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  fx.dustSprite = c;
  return c;
}

/** Explosão: 1 clarão + 1 anel em expansão + nuvens de poeira. */
export function spawnBlast(fx, x, y) {
  fx.blasts.push({ wx: x, wy: y, t: 0, life: BOMB.blastSeconds });
  const n = BOMB.dustPuffs;
  for (let k = 0; k < n; k++) {
    const h1 = hash2(x * 13 + fx.seedCounter, y * 7, 61);
    const h2 = hash2(y * 17, x * 11 + fx.seedCounter, 67);
    fx.seedCounter++;
    const ang = (k / n) * Math.PI * 2 + h1 * 0.7;
    fx.dust.push({
      wx: x + Math.cos(ang) * 0.5,
      wy: y + Math.sin(ang) * 0.5,
      vx: Math.cos(ang) * (1.6 + h2 * 2.2),
      rise: 0,
      vrise: 20 + h2 * 28,
      drag: 26,
      t: 0,
      life: 0.9 + h1 * 0.9,
      size: 0.55 + h2 * 0.5,
    });
  }
}

export function updateBombFx(fx, dt) {
  for (let k = 0; k < fx.blasts.length; ) {
    const b = fx.blasts[k];
    b.t += dt;
    if (b.t >= b.life) {
      fx.blasts[k] = fx.blasts[fx.blasts.length - 1];
      fx.blasts.pop();
      continue;
    }
    k++;
  }
  for (let k = 0; k < fx.dust.length; ) {
    const p = fx.dust[k];
    p.t += dt;
    if (p.t >= p.life) {
      fx.dust[k] = fx.dust[fx.dust.length - 1];
      fx.dust.pop();
      continue;
    }
    p.wx += p.vx * dt;
    p.wy += p.vx * dt * 0.35;
    p.rise += p.vrise * dt;
    p.vrise -= p.drag * dt;
    p.vx *= 1 - Math.min(1, 0.9 * dt);
    k++;
  }
}

/** Bombas em voo. Desenhar por cima das árvores (estão no ar). */
export function drawBombs(ctx, bombs, cam, time) {
  const z = cam.zoom;
  if (!bombs.inFlight.length) return 0;
  let drawn = 0;

  for (let k = 0; k < bombs.inFlight.length; k++) {
    const b = bombs.inFlight[k];
    if (b.delay > 0) continue;
    const p = Math.min(1, b.t / b.dur);
    const tx = baseX(cam, b.tx, b.ty);
    const ty = baseY(cam, b.tx, b.ty);

    // trajetória: vem de fora da tela, entrando pelo lado, e cai no alvo
    const spanX = cam.viewW * 0.85;
    const startX = tx + (b.fromLeft ? -spanX : spanX);
    const startY = ty - cam.viewH * 0.9;
    const dx = startX + (tx - startX) * p;
    const dy = startY + (ty - startY) * p;
    const arc = -Math.sin(p * Math.PI) * TILE_H * 5 * b.arc;

    const size = TILE_W * (0.3 + p * 0.16) * z;

    // Rastro: 4 fantasmas ao longo do arco já percorrido. É o que faz a bomba
    // ser "visível cruzando a tela" em vez de um pontinho.
    for (let k2 = 1; k2 <= 4; k2++) {
      const q = Math.max(0, p - k2 * 0.045);
      const tdx = startX + (tx - startX) * q;
      const tdy = startY + (ty - startY) * q;
      const tarc = -Math.sin(q * Math.PI) * TILE_H * 5 * b.arc;
      ctx.globalAlpha = 0.2 - k2 * 0.04;
      ctx.fillStyle = COLORS.smoke;
      ctx.beginPath();
      ctx.ellipse(tdx, tdy + tarc, size * (0.5 - k2 * 0.06), size * (0.7 - k2 * 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // sombra no chão: cresce e escurece chegando (a única dica de onde cai)
    if (p > 0.1) {
      const sr = size * (0.8 + p * 1.9);
      ctx.globalAlpha = 0.1 + p * 0.38;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(tx, ty, sr, sr * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // corpo da bomba
    ctx.fillStyle = COLORS.bomb;
    ctx.beginPath();
    ctx.ellipse(dx, dy + arc, size * 0.66, size, 0, 0, Math.PI * 2);
    ctx.fill();
    // brilho
    ctx.fillStyle = COLORS.bombHi;
    ctx.beginPath();
    ctx.ellipse(dx - size * 0.22, dy + arc - size * 0.32, size * 0.22, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // faísca do pavio
    const flick = 0.55 + 0.45 * Math.sin(time * 24 + k * 3);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = flick > 0.5 ? COLORS.fire[2] : COLORS.fire[1];
    ctx.beginPath();
    ctx.arc(dx, dy + arc - size * 1.2, size * 0.34 * flick, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawn++;
  }
  return drawn;
}

/** Clarão, anel em expansão e poeira. Desenhar DEPOIS das bombas. */
export function drawBombFx(ctx, cam, fx) {
  const z = cam.zoom;

  for (let k = 0; k < fx.dust.length; k++) {
    const p = fx.dust[k];
    if (!fx.dustSprite) dustSprite(fx);
    const lifeT = p.t / p.life;
    const size = TILE_W * p.size * (0.7 + lifeT * 1.6) * z;
    const sx = baseX(cam, p.wx, p.wy);
    const sy = baseY(cam, p.wx, p.wy) - p.rise * z * 0.5;
    if (sx + size < 0 || sx - size > cam.viewW || sy + size < 0 || sy - size > cam.viewH) continue;
    ctx.globalAlpha = (1 - lifeT) * 0.8;
    ctx.drawImage(fx.dustSprite, sx - size / 2, sy - size / 2, size, size);
  }
  ctx.globalAlpha = 1;

  for (let k = 0; k < fx.blasts.length; k++) {
    const b = fx.blasts[k];
    const t = b.t / b.life;
    const sx = baseX(cam, b.wx, b.wy);
    const sy = baseY(cam, b.wx, b.wy);

    // clarão: círculo branco-amarelo que encolhe rápido
    const flashR = TILE_W * (0.55 + t * 1.1) * z;
    ctx.globalAlpha = Math.max(0, 1 - t * 2.2);
    ctx.fillStyle = COLORS.fire[2];
    ctx.beginPath();
    ctx.arc(sx, sy, flashR, 0, Math.PI * 2);
    ctx.fill();

    // anel em expansão
    const ringR = TILE_W * (0.35 + t * 1.9) * z;
    ctx.globalAlpha = Math.max(0, 0.75 - t);
    ctx.strokeStyle = COLORS.fire[1];
    ctx.lineWidth = Math.max(1.5, 4 * z * (1 - t));
    ctx.beginPath();
    ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // núcleo escuro (fuligem) por baixo
    ctx.globalAlpha = Math.max(0, 0.5 - t * 0.6);
    ctx.fillStyle = '#1a1512';
    ctx.beginPath();
    ctx.ellipse(sx, sy, TILE_W * 0.4 * z * (0.6 + t), TILE_W * 0.16 * z * (0.6 + t), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

/** True se há algo animando (para o gate de frame). */
export function bombFxActive(bombs, fx) {
  return bombs.inFlight.length > 0 || fx.blasts.length > 0 || fx.dust.length > 0;
}
