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
// Consequência medida (16 seeds, uma bomba de raio 5 no centro, floresta
// sintética): o fogo NÃO corre sem limite, porque a propagação é limitada por
// ADJACÊNCIA, não pela chance. Medido:
//   densidade 25% (jogo real)  R0 0,243 -> mediana 18 tiles queimados
//   densidade 90% (floresta cheia) R0 0,850 -> mediana 84, máx 106
// Ou seja: o "quanto assusta" é o RAIO DE IGNIÇÃO da bomba, não o R0. A
// correção de uma estimativa antiga (~500 tiles por impacto) está em
// docs/BACKLOG.md — ela nunca se confirmou numa medição.
export const FIRE = {
  // R0 na densidade de 90%. Subiu de 0,85 para 1,105 (o "30% mais propagação":
  // chance por segundo × 1,3). Efeito medido em 16 seeds, bomba raio 5:
  //   densidade 25%: 18 -> 18 tiles (nada: ali só há ~2 vizinhos por tile)
  //   densidade 90%: 84 -> 91 tiles, duração 30 -> 36 s
  // R0 > 1 em floresta cheia é supercrítico: o incêndio não morre sozinho, só
  // para na água ou na borda rala. Em 25% de densidade continua subcrítico.
  r0Target: 1.105,
  neighborsAtDense: 7, // vizinhos ocupados esperados com 90% de densidade
  burnTime: 10, // segundos até a árvore virar cinza
  hpMin: 3, // aplicações de spray para debelar um foco
  hpMax: 5,
  tickRate: 10, // ticks de simulação por segundo (fixo = determinístico)
  wetSeconds: 8, // duração da umidade depois do spray
  wetSpreadMul: 0.1, // vizinho molhado quase não pega fogo
  ashSeconds: 60, // cinza -> terra replantável
  smokePerBurning: 1.17, // +30% (era 0,9): partículas/s por foco
  maxSmoke: 156, // orçamento de partículas (fumaça é o efeito mais caro)
  maxFlames: 260, // orçamento de chamas desenhadas (acima disso, stride)
  maxSteam: 50, // orçamento de vapor (vida curta, então quase nunca chega no teto)
  smokeLifeMin: 2.2,
  smokeLifeMax: 4.5,
  // Vento em px de TELA por segundo (negativo = para cima). Em iso, um delta de
  // mundo vira diagonal na tela, então o vento é declarado no que se vê.
  windX: 11,
  windY: -26,
};

/** Chance de propagação por segundo, derivada do R0 alvo. */
export const FIRE_CHANCE = FIRE.r0Target / (FIRE.neighborsAtDense * FIRE.burnTime);

// Bombardeio. O raio de ignição é o botão de "quanto dói" (ver FIRE): raio 5
// abre ~71 focos, que em floresta cheia queimam mediana 81 / máx 109 tiles.
export const BOMB = {
  firstDelayMin: 12, // s até a primeira bomba (dá tempo de plantar algo)
  firstDelayMax: 22,
  intervalMin: 15, // s entre eventos
  intervalMax: 30,
  maxPerEvent: 5,
  eventRampSeconds: 60, // +1 bomba por evento a cada minuto
  igniteRadius: 5,
  flightMin: 1.1, // s de voo visível
  flightMax: 1.7,
  staggerMin: 0, // atraso entre bombas do mesmo evento
  staggerMax: 0.5,
  avoidRadius: 14, // penalidade de alvo perto do último impacto
  randomTries: 24, // tentativas para achar terra no modo aleatório
  forestTries: 32, // tentativas para achar uma árvore no modo floresta
  forestBias: 0.5, // chance de mirar floresta; o resto é destino aleatório
  shakeMag: 7, // px de tremor
  shakeSeconds: 0.3,
  blastSeconds: 0.5,
  dustPuffs: 7, // nuvens de poeira por impacto
};

// Fim de jogo e pontuação. Os pesos somam 2000 (vitória perfeita).
export const GAME = {
  goalCoverage: 0.9, // 90% da terra virou floresta = vitória
  parSeconds: 480, // 8 min: abaixo disso o bônus de rapidez é positivo
  scoreCoverage: 1000,
  scoreWater: 500,
  scoreSpeed: 500,
  gradeS: 1650,
  gradeA: 1350,
  gradeB: 1050,
  gradeC: 750,
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
  // 4 tons de cinza (terra queimada), do mais escuro ao mais claro. Mesma
  // quantidade que a terra: a cicatriz tem textura em vez de virar um buraco
  // preto chapado, e lê como "lugar a replantar".
  ash: ['#2b261f', '#383228', '#453e31', '#52493a'],
  // fogo: base escura, meio laranja, núcleo claro (3 paths por frame)
  fire: ['#b03a12', '#f2812c', '#ffd05a'],
  charred: '#241d16', // copa consumida pelo fogo
  bomb: '#2a2b30',
  bombHi: '#6f7480',
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
