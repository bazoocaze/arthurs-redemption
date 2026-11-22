// Máquina de estados e pontuação.
//
// O jogo tem três fases e duas saídas:
//
//   playing ──(cobertura ≥ 90%)────────────────► victory
//        └────(água insuficiente + fogo ativo)─► drought  (derrota satírica)
//
// Duas decisões:
//
// 1. **Vitória é checada a cada mutação**, não por timer. O jogador vê a barra
//    chegar em 90% e o jogo termina naquele tile — o feedback é imediato.
// 2. **Derrota só existe com fogo ativo.** Água zerada com a floresta intacta é
//    só "não tem mais como apagar"; o jogo segue. Sem essa condição, acabar a
//    água encerraria a partida sem drama nenhum.
// 3. **"Acabou a água" é não poder pagar nem o spray mais barato**, não zero
//    exato. `sprayTile` recusa quando `waterTotal < custo`, então a água encalhava
//    em 0,7 (abaixo do custo mínimo 1) e a derrota nunca disparava: fogo queimando
//    a floresta toda, barra em 0% e a partida seguindo para sempre.
//
// A pontuação existe para diferenciar vitórias: sobreviver é o mínimo, chegar
// rápido e sem gastar água é o que dá S.
import { GAME, WATER } from './config.js';

export const PHASE = { PLAYING: 'playing', VICTORY: 'victory', DROUGHT: 'drought' };

const RECORDS_KEY = 'ar.records';

export function createGame(waterInitial) {
  return {
    phase: PHASE.PLAYING,
    waterInitial: Math.max(1, waterInitial),
    // Cada tile que vira cinza é uma árvore perdida; contado por evento da sim.
    burned: 0,
    result: null,
  };
}

/** Checa as duas condições de fim. Devolve o `result` ou null. */
export function checkEnd(game, grid, elapsed) {
  if (game.phase !== PHASE.PLAYING) return null;
  if (grid.coverage() >= GAME.goalCoverage) return endGame(game, grid, elapsed, PHASE.VICTORY);
  if (grid.burningCount > 0 && grid.waterTotal < WATER.sprayCost) {
    return endGame(game, grid, elapsed, PHASE.DROUGHT);
  }
  return null;
}

/** Força o fim (usado pelas teclas de debug e pela derrota por seca). */
export function endGame(game, grid, elapsed, phase) {
  if (game.phase !== PHASE.PLAYING) return game.result;
  game.phase = phase;
  game.result = {
    phase,
    ...computeScore(game, grid, elapsed),
    stats: {
      trees: grid.treeCount,
      landTotal: grid.landTotal,
      burned: game.burned,
      elapsed,
      waterLeft: Math.max(0, grid.waterTotal),
      waterInitial: game.waterInitial,
      burningLeft: grid.burningCount,
    },
  };
  return game.result;
}

/**
 * score = 1000·cobertura + 500·água restante + 500·rapidez
 *
 * Os três termos somam 2000 quando a vitória é perfeita (100% de cobertura, sem
 * gastar água, no tempo zero). Vitória no limite (90%, seca, no PAR) vale 900.
 */
export function computeScore(game, grid, elapsed) {
  const cobertura = Math.min(1, grid.coverage());
  const agua = Math.min(1, Math.max(0, grid.waterTotal / game.waterInitial));
  const rapidez = Math.max(0, (GAME.parSeconds - elapsed) / GAME.parSeconds);
  const partes = {
    cobertura: Math.round(GAME.scoreCoverage * cobertura),
    agua: Math.round(GAME.scoreWater * agua),
    rapidez: Math.round(GAME.scoreSpeed * rapidez),
  };
  const score = partes.cobertura + partes.agua + partes.rapidez;
  return {
    score,
    grade: gradeFor(score, game.phase),
    parts: partes,
    coverage: cobertura,
    waterFrac: agua,
  };
}

/** Faixas de nota. Derrota é sempre F — é a piada, não um cálculo. */
export function gradeFor(score, phase = PHASE.PLAYING) {
  if (phase === PHASE.DROUGHT) return 'F';
  if (score >= GAME.gradeS) return 'S';
  if (score >= GAME.gradeA) return 'A';
  if (score >= GAME.gradeB) return 'B';
  if (score >= GAME.gradeC) return 'C';
  return 'D';
}

// --- recordes --------------------------------------------------------------

export function loadRecords(storage = safeStorage()) {
  if (!storage) return { bestScore: 0, bestCoverage: 0, fastestWin: 0 };
  try {
    const raw = storage.getItem(RECORDS_KEY);
    if (!raw) return { bestScore: 0, bestCoverage: 0, fastestWin: 0 };
    const r = JSON.parse(raw);
    return {
      bestScore: Number(r.bestScore) || 0,
      bestCoverage: Number(r.bestCoverage) || 0,
      fastestWin: Number(r.fastestWin) || 0,
    };
  } catch {
    return { bestScore: 0, bestCoverage: 0, fastestWin: 0 };
  }
}

/** Atualiza e devolve `{ records, novos }` — `novos` marca quais recordes caíram. */
export function updateRecords(result, storage = safeStorage()) {
  const records = loadRecords(storage);
  const novos = { score: false, coverage: false, fastest: false };
  if (result.phase !== PHASE.VICTORY) return { records, novos };

  if (result.score > records.bestScore) {
    records.bestScore = result.score;
    novos.score = true;
  }
  if (result.coverage > records.bestCoverage) {
    records.bestCoverage = result.coverage;
    novos.coverage = true;
  }
  if (!records.fastestWin || result.stats.elapsed < records.fastestWin) {
    records.fastestWin = result.stats.elapsed;
    novos.fastest = true;
  }
  if (storage) {
    try {
      storage.setItem(RECORDS_KEY, JSON.stringify(records));
    } catch {
      /* modo privado: jogar sem recorde é melhor que quebrar */
    }
  }
  return { records, novos };
}

export function clearRecords(storage = safeStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(RECORDS_KEY);
  } catch {
    /* ignora */
  }
}

function safeStorage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

// --- mensagens da tela final ----------------------------------------------
// Tom: frase curta, direta, sem piada de guarda-chuva — a graça está em levar o
// Arthur a sério (ou em ele se explicando).
export const VICTORY_MESSAGES = [
  'A floresta foi salva, e o Arthur se redimiu.',
  'O Arthur venceu fogo e bombas.',
  'O fogo passou, as cinzas viraram terra, e o Arthur terminou o que começou.',
  'O Arthur não deixou o fogo ganhar. Dessa vez não.',
];

export const DROUGHT_MESSAGES = [
  'A água acabou e o fogo continua. Arthur jura que estava quase terminando.',
  'Arthur gastou o rio inteiro num lago decorativo. O fogo mandou lembranças.',
  'O mapa virou carvão. Arthur agora planta no save dos outros.',
];

// Última frase usada por lista: evita repetir a mesma duas partidas seguidas.
// Fica em memória de propósito (não persiste) — recarregar zera.
const ultimaFrase = new WeakMap();

/**
 * Sorteia uma frase da fase. Só repete quando a lista tem 1 item: se o sorteio
 * cair na anterior, desloca para uma das outras, mantendo distribuição uniforme.
 */
export function endMessage(result, rng = Math.random) {
  const lista = result.phase === PHASE.VICTORY ? VICTORY_MESSAGES : DROUGHT_MESSAGES;
  return pickMessage(lista, rng);
}

export function pickMessage(lista, rng = Math.random) {
  const anterior = ultimaFrase.get(lista);
  let i = Math.floor(rng() * lista.length) % lista.length;
  if (anterior !== undefined && lista.length > 1 && i === anterior) {
    // anda de 1 a len-1 posições: cai uniformemente em qualquer outra
    i = (i + 1 + Math.floor(rng() * (lista.length - 1))) % lista.length;
  }
  ultimaFrase.set(lista, i);
  return lista[i];
}
