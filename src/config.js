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
  sprayCost: 1, // volume por aplicação de spray encostado no rio
  sprayDistFactor: 0.3, // spray longe do rio custa mais (transporte)
  sprayMaxCost: 5, // teto do custo de transporte
};

// Fogo. O número que importa NÃO é a chance: é o R0.
//
//   R0 = vizinhos_de_árvore * chance_por_segundo * tempo_queimando
//
// Se R0 > 1 o fogo cresce sozinho e o objetivo de 90% de cobertura vira
// impossível (a floresta que você precisa construir é o combustível). Com
// chance derivada de R0 alvo e vizinhos ~7 (densidade 0,9), R0 fica < 1 mesmo no
// fim do jogo; em floresta esparsa R0 cai junto com os vizinhos, então fogo em
// área rala morre sozinho.
//
// Consequência medida (tools: 24 seeds, floresta densa): um foco queima
// ~1/(1-R0) = 6,7 tiles. O incêndio NÃO corre sem limite — e é isso que torna o
// jogo justo — mas também significa que foco pequeno é inofensivo. Quem define
// "o quanto assusta" é o RAIO DE IGNIÇÃO da bomba (~focos / (1-R0) tiles),
// não o R0. Medido, densidade 90%:
//   raio 2 (~13 focos) => mediana 19, máx 43 tiles (0,6% da floresta)
//   raio 3 (~29 focos) => mediana 42, máx 56 tiles (1,3%)
//   raio 5 (~78 focos) => ~500 tiles (~6%) -> bomba de M5
// A cauda é curta: com R0 < 1 não existe incêndio apocalíptico, então o jogador
// sempre pode reconstruir o que perdeu.
export const FIRE = {
  r0Target: 0.85, // alvo de R0 na densidade de 90%
  neighborsAtDense: 7, // vizinhos ocupados esperados com 90% de densidade
  burnTime: 10, // segundos até a árvore virar cinza
  hpMin: 3, // aplicações de spray para debelar um foco
  hpMax: 5,
  tickRate: 10, // ticks de simulação por segundo (fixo = determinístico)
  wetSeconds: 8, // duração da umidade depois do spray
  wetSpreadMul: 0.1, // vizinho molhado quase não pega fogo
  ashSeconds: 60, // cinza -> terra replantável
  smokePerBurning: 0.9, // partículas por segundo por foco
  maxSmoke: 120, // orçamento de partículas (fumaça é o efeito mais caro)
  maxFlames: 260, // orçamento de chamas desenhadas (acima disso, stride)
  smokeLifeMin: 2.2,
  smokeLifeMax: 4.5,
};

/** Chance de propagação por segundo, derivada do R0 alvo. */
export const FIRE_CHANCE = FIRE.r0Target / (FIRE.neighborsAtDense * FIRE.burnTime);

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
  // 4 tons de cinza (terra queimada), do mais escuro ao mais claro. Mesma
  // quantidade que a terra: a cicatriz tem textura em vez de virar um buraco
  // preto chapado, e lê como "lugar a replantar".
  ash: ['#2b261f', '#383228', '#453e31', '#52493a'],
  // fogo: base escura, meio laranja, núcleo claro (3 paths por frame)
  fire: ['#b03a12', '#f2812c', '#ffd05a'],
  charred: '#241d16', // copa consumida pelo fogo
  smoke: 'rgba(26, 22, 18, 0.42)',
  wetTint: 'rgba(120, 160, 190, 0.13)',
  highlightFill: 'rgba(255, 244, 214, 0.16)',
  highlightStroke: 'rgba(255, 244, 214, 0.55)',
  shadow: 'rgba(28, 18, 10, 0.28)',
};

export const TIME = {
  maxDt: 0.05, // clamp do delta para não explodir depois de aba em background
  waterShimmerHz: 2.5,
  // Teto de redesenho quando o ÚNICO motivo do frame é animação (fogo, fumaça,
  // shimmer). As chamas trocam de quadro a 9 Hz e a fumaça sobe a ~1 px/frame,
  // então 30 fps é visualmente idêntico e custa metade. Entrada (pintar, mover a
  // câmera, hover) NUNCA é limitada: latência de input fica em 60 fps.
  animHz: 30,
};
