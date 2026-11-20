// Máquina de estados e pontuação.
//
// O jogo tem três fases e duas saídas:
//
//   playing ──(cobertura ≥ 90%)──────────► victory
//        └────(água zerada e fogo ativo)─► drought  (derrota satírica)
//
// Duas decisões:
//
// 1. **Vitória é checada a cada mutação**, não por timer. O jogador vê a barra
//    chegar em 90% e o jogo termina naquele tile — o feedback é imediato.
// 2. **Derrota só existe com fogo ativo.** Água zerada com a floresta intacta é
//    só "não tem mais como apagar"; o jogo segue. Sem essa condição, acabar a
//    água pintando lagos encerraria a partida sem drama nenhum.
//
// A pontuação existe para diferenciar vitórias: sobreviver é o mínimo, chegar
// rápido e sem gastar água é o que dá S.
import { GAME } from './config.js';

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
  if (grid.waterTotal <= 0.001 && grid.burningCount > 0) {
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

/** Mensagens da tela final. Satíricas, curtas, falando com o Arthur. */
export function endMessage(result) {
  if (result.phase === PHASE.VICTORY) {
    const rapido = result.stats.elapsed <= GAME.parSeconds;
    return rapido
      ? 'Arthur plantou rápido e o mapa inteiro respira. Ninguém viu, mas aconteceu.'
      : 'Arthur chegou aos 90%. Demorou, discutiu com o vento, mas chegou.';
  }
  return 'A água acabou e o fogo continua. Arthur disse que estava quase terminando.';
}
