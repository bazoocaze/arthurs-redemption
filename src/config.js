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

export const COLORS = {
  bg: '#12100d',
  // 4 tons de terra, do mais escuro ao mais claro
  dirt: ['#5d4630', '#6b5136', '#7a5e3e', '#87694a'],
  // 2 tons de água (alternados no tempo para dar ondulação)
  water: ['#2b6076', '#33718a'],
  highlightFill: 'rgba(255, 244, 214, 0.16)',
  highlightStroke: 'rgba(255, 244, 214, 0.55)',
};

export const TIME = {
  maxDt: 0.05, // clamp do delta para não explodir depois de aba em background
  waterShimmerHz: 2.5,
};
