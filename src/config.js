// Todos os números de render e de balanceamento vivem aqui.
// Nada de "magic number" espalhado pelo resto do código.

export const TILE_W = 64;
export const TILE_H = 32;

export const GRID_W = 96;
export const GRID_H = 96;

// Deslocamento horizontal: garante que todo o mundo caia em coordenadas >= 0.
// O tile (0, GRID_H-1) fica em x = 0.
export const ORIGIN_X = ((GRID_H - 1) * TILE_W) / 2;

// Caixa envolvente do losango do mundo, em pixels de mundo (zoom 1).
export const WORLD_W = ((GRID_W - 1) * TILE_W) / 2 + ((GRID_H - 1) * TILE_W) / 2 + TILE_W;
export const WORLD_H = ((GRID_W - 1) * TILE_H) / 2 + ((GRID_H - 1) * TILE_H) / 2 + TILE_H;

export const CAM = {
  minZoom: 0.18,
  maxZoom: 3,
  initialZoom: 0.55,
  wheelStrength: 0.0016, // fator por unidade de deltaY
  edgePad: 220, // margem de mundo visível além da borda
};

export const GEN = {
  riverCountMin: 1,
  riverCountMax: 3,
  riverWidthMin: 1.5,
  riverWidthMax: 2.7,
  waterVolumePerTile: 10,
};

// Espécies: poucas, com silhuetas diferentes para a floresta parecer aleatória.
// h/w em múltiplos de TILE_H/TILE_W (independente do zoom).
export const SPECIES = [
  // Copas ~20% menores que 1 tile: numa floresta densa ainda dá para ler os
  // vãos de terra, senão o jogador não percebe progresso rumo aos 90%.
  { key: 'pinheiro', shape: 'cone', h: 2.0, w: 0.64, canopy: '#2b6141', canopy2: '#3a7a4e', trunk: '#463322' },
  { key: 'folhosa', shape: 'round', h: 1.5, w: 0.8, canopy: '#38702f', canopy2: '#4e9140', trunk: '#59422d' },
  { key: 'betula', shape: 'round', h: 1.7, w: 0.56, canopy: '#628c39', canopy2: '#84ae4c', trunk: '#8c8a7b' },
  { key: 'oliveira', shape: 'cone', h: 1.2, w: 0.68, canopy: '#4f7542', canopy2: '#6b8f55', trunk: '#584d3c' },
];

export const BRUSH = {
  minRadius: 1,
  maxRadius: 4,
  defaultRadius: 2,
};

export const WATER = {
  pondVolume: 1, // volume do tile criado ao pintar água
  paintBase: 2, // 2:1 encostado no rio (dist 1) — número pedido pelo autor
  paintDistFactor: 0.5, // custo = paintBase * (1 + (dist-1) * fator)
  sprayCost: 1, // volume por aplicação de spray
  sprayReach: 12,
};

export const RENDER = {
  lodZoom: 0.45, // abaixo disso, árvores viram manchas por espécie (batch)
  groveMax: 3, // maior bloco agrupado (3x3)
};

export const COLORS = {
  bg: '#12100d',
  // 4 tons de terra, do mais escuro ao mais claro
  dirt: ['#5d4630', '#6b5136', '#7a5e3e', '#87694a'],
  // 2 tons de água (alternados no tempo para dar ondulação)
  water: ['#2b6076', '#33718a'],
  highlightFill: 'rgba(255, 244, 214, 0.16)',
  highlightStroke: 'rgba(255, 244, 214, 0.55)',
  shadow: 'rgba(28, 18, 10, 0.28)',
};

export const TIME = {
  maxDt: 0.05, // clamp do delta para não explodir depois de aba em background
  waterShimmerHz: 2.5,
};
