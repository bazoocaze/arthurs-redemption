// Detecção de agrupamento (groves). Puro: sem canvas, testável sem browser.
//
// Regra: um bloco NxN (N >= 2) de árvores da MESMA espécie vira um "grove",
// desenhado como uma moita única. O lugar do bloco é varrido em ordem de tile,
// então o agrupamento é determinístico e independe da câmera.

export function isTreeOfSpecies(grid, x, y, species) {
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return false;
  const i = y * grid.w + x;
  return grid.tree[i] === 1 && grid.species[i] === species;
}

export function blockMatches(grid, x, y, size, species) {
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (!isTreeOfSpecies(grid, x + dx, y + dy, species)) return false;
    }
  }
  return true;
}

/**
 * Maior bloco ancorado em (x,y) com árvores da mesma espécie.
 * Retorna 0 se não há árvore, 1 se é árvore solta, >=2 se forma grove.
 */
export function groveSizeAt(grid, x, y, maxSize = 3) {
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return 0;
  const i = y * grid.w + x;
  if (grid.tree[i] !== 1) return 0;
  const species = grid.species[i];
  for (let s = maxSize; s >= 2; s--) {
    if (blockMatches(grid, x, y, s, species)) return s;
  }
  return 1;
}
