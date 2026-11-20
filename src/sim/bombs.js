// Bombardeio: agendador, escolha de alvo, voo e impacto.
//
// Três decisões de game design estão aqui:
//
// 1. **O alvo prefere floresta.** Bomba que cai em terra vazia é evento nulo: o
//    jogador vê a animação e nada acontece. Amostragem com peso para tile com
//    árvore garante que o evento ameace o que ele construiu.
// 2. **Alvo longe do último impacto.** Sem isso, dois eventos seguidos podem
//    empilhar no mesmo canto e o resto do mapa fica intocado.
// 3. **Agendador determinístico.** O RNG nasce da seed, então a sequência de
//    bombas é reproduzível nos testes (tools/check.mjs) sem browser.
//
// A sim não conhece pixel: o voo é modelado em tempo, e o render decide o arco.
import { BOMB } from '../config.js';
import { TERRAIN } from '../grid.js';
import { mulberry32 } from '../rng.js';
import { igniteRadius } from './fire.js';

export function createBombs(seed) {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  return {
    rng,
    elapsed: 0, // tempo de jogo (s) — dirige o ramp de bombas por evento
    nextEventAt: BOMB.firstDelayMin + rng() * (BOMB.firstDelayMax - BOMB.firstDelayMin),
    inFlight: [],
    lastTarget: null,
    events: 0,
    impacts: 0,
    launched: 0,
  };
}

/** Bombas por evento: 1 + 1 por minuto decorrido, com teto. */
export function bombsForEvent(elapsed) {
  const n = 1 + Math.floor(Math.max(0, elapsed) / BOMB.eventRampSeconds);
  return Math.min(n, BOMB.maxPerEvent);
}

/**
 * Escolhe o alvo por amostragem: peso para floresta e para longe do último
 * impacto. Nunca devolve água (bomba na água = nada queima).
 */
export function pickTarget(bombs, grid) {
  let best = null;
  let bestScore = -Infinity;
  for (let k = 0; k < BOMB.sampleTries; k++) {
    const x = 2 + Math.floor(bombs.rng() * (grid.w - 4));
    const y = 2 + Math.floor(bombs.rng() * (grid.h - 4));
    const i = grid.idx(x, y);
    if (grid.terrain[i] === TERRAIN.WATER) continue;

    let score = bombs.rng() * 0.5;
    if (grid.tree[i] === 1) score += 1.2; // prefere floresta
    if (bombs.lastTarget) {
      const dx = x - bombs.lastTarget.x;
      const dy = y - bombs.lastTarget.y;
      const d = Math.hypot(dx, dy);
      score += Math.min(1, d / BOMB.avoidRadius) * 0.8; // longe do anterior
    }
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

/** Lança um evento de bombardeio (n bombas escalonadas). */
export function launchEvent(bombs, grid) {
  const n = bombsForEvent(bombs.elapsed);
  const launched = [];
  for (let k = 0; k < n; k++) {
    const target = pickTarget(bombs, grid);
    if (!target) continue;
    bombs.lastTarget = target;
    const bomb = {
      tx: target.x,
      ty: target.y,
      delay: BOMB.staggerMin + bombs.rng() * (BOMB.staggerMax - BOMB.staggerMin),
      dur: BOMB.flightMin + bombs.rng() * (BOMB.flightMax - BOMB.flightMin),
      // lado de onde vem (o render usa para o arco) e um jitter de trajetória
      fromLeft: bombs.rng() < 0.5,
      arc: 0.55 + bombs.rng() * 0.5,
      t: 0,
    };
    bombs.inFlight.push(bomb);
    bombs.launched++;
    launched.push(bomb);
  }
  bombs.events++;
  return launched;
}

/**
 * Avança o agendador e os voos. Ao pousar, ignita em raio e emite evento de
 * explosão para a camada visual.
 */
export function updateBombs(bombs, grid, dt, seed = 0) {
  bombs.elapsed += dt;

  if (bombs.elapsed >= bombs.nextEventAt) {
    launchEvent(bombs, grid);
    bombs.nextEventAt = bombs.elapsed + BOMB.intervalMin + bombs.rng() * (BOMB.intervalMax - BOMB.intervalMin);
  }

  for (let k = 0; k < bombs.inFlight.length; ) {
    const b = bombs.inFlight[k];
    if (b.delay > 0) {
      b.delay -= dt; // escalonamento: só começa a cair depois do atraso
      k++;
      continue;
    }
    b.t += dt;
    if (b.t >= b.dur) {
      impact(bombs, grid, b, seed);
      bombs.inFlight[k] = bombs.inFlight[bombs.inFlight.length - 1];
      bombs.inFlight.pop();
      continue;
    }
    k++;
  }
}

function impact(bombs, grid, b, seed) {
  bombs.impacts++;
  const lit = igniteRadius(grid, b.tx, b.ty, BOMB.igniteRadius, seed + bombs.impacts * 131);
  if (grid.events.length < 256) {
    grid.events.push({ type: 'explosion', x: b.tx, y: b.ty, lit });
  }
  return lit;
}

/** Usado pelo debug: solta uma bomba já em cima do alvo. */
export function dropBomb(bombs, grid, x, y, seed = 0) {
  const b = { tx: x, ty: y, delay: 0, dur: BOMB.flightMin, fromLeft: true, arc: 0.7, t: 0 };
  bombs.inFlight.push(b);
  bombs.launched++;
  bombs.lastTarget = { x, y };
  return b;
}
