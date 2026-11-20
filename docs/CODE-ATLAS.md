# CODE ATLAS — Arthur's Redemption

Guia de navegação do código para humanos e agentes. Mantenha atualizado sempre
que criar, mover ou renomear módulo: o atlas é o mapa, não a prosa.

> Status: o código de jogo ainda **não existe**. As seções marcadas
> `[planejado]` descrevem o desenho acordado e devem ser ajustadas para refletir
> o código real assim que cada módulo nascer.

## 1. Visão de arquitetura

```
                    ┌──────────────┐
  pointer/wheel ───▶│  input.js    │──▶ comandos de edição (planta/pinta/apaga)
  keyboard ────────▶└──────────────┘
                            │
                            ▼
                     ┌─────────────┐      ┌──────────────┐
                     │  grid.js    │◀────▶│ save.js      │  localStorage
                     │ (estado)    │      └──────────────┘
                     └─────┬───────┘
                            ▲
        ┌───────────┬───────┴────┬─────────────┐
        │ sim/fire  │ sim/bombs  │ particles   │  simulação (dt)
        └─────┬─────┴──────┬─────┴──────┬──────┘
              └────────────┴────────────┘
                            ▼
                     ┌─────────────┐
                     │  render/*   │  canvas 2D (camadas + dirty chunks)
                     └─────────────┘
```

Regra de ouro: **a simulação não conhece pixels; o render não conhece regras.**
`grid.js` é o único dono do estado do mundo. Módulos de simulação recebem
`(grid, dt, ctx)` e mutam o grid. O render lê o grid e mais nada.

## 2. Mapa de arquivos

`✅` existe e roda · `⏳` planejado (ainda não escrito)

| Arquivo | Status | Responsabilidade | Não deve conter |
| --- | --- | --- | --- |
| `index.html` | ✅ | canvas, estilos, hint, `<link rel=manifest>`, entrada do módulo | lógica de jogo |
| `manifest.webmanifest` | ✅ | metadados PWA | — |
| `icons/icon.svg` | ✅ | ícone | — |
| `sw.js` | ⏳ | cache do app shell, versionamento | estado de jogo |
| `tools/serve.sh` | ✅ | servidor estático de dev | — |
| `tools/check.mjs` | ✅ | testes de sanidade sem browser (iso, gerador, determinismo) | DOM |
| `tools/probe.mjs` | ✅ | probe CDP headless: erros, `--eval`, screenshot | lógica de jogo |
| `src/main.js` | ✅ | bootstrap, loop RAF, `dt` clampado, dirty de frame, debug | regras de fogo/bomba |
| `src/config.js` | ✅ | **todos** os tunables e cores | lógica |
| `src/rng.js` | ✅ | `mulberry32`, `hash2`, `noise2`, `fbm2`, `randInt` | — |
| `src/grid.js` | ✅ | arrays SoA do mundo, contadores, `coverage()` | desenho |
| `src/generator.js` | ✅ | terreno inicial + rios de borda a borda | simulação em tempo real |
| `src/iso.js` | ✅ | `tileWorldX/Y`, `tileCenterY`, `worldToTile` | estado |
| `src/camera.js` | ✅ | pan/zoom, `worldToScreen`, `signature()` (dirty) | input bruto |
| `src/input.js` | ✅ | pointer/wheel → pan, zoom, tile sob o cursor | regras de fogo |
| `src/render/terrain.js` | ✅ | terreno: `Path2D.rect` em espaço de tile + matriz iso | simulação |
| `src/render/trees.js` | ✅ | árvores: groves, sprites, LOD por zoom | regras |
| `src/render/sprites.js` | ✅ | sprites de árvore pré-renderizados (base + sombra embutida) | estado |
| `src/render/overlay.js` | ✅ | highlight e preview do brush | regras |
| `src/grove.js` | ✅ | detecção de bloco NxN da mesma espécie (puro, testável) | canvas |
| `src/sim/paint.js` | ✅ | plantar, alagar, brush, trilha, drenagem do rio | render |
| `src/sim/fire.js` | ✅ | ignição, propagação (R0), spray, cinza, umidade | render |
| `src/render/fire.js` | ✅ | chamas (sprites + halo), fumaça, vapor | simulação |
| `src/sim/bombs.js` | ✅ | agendador, escolha de alvo, voo, impacto | render |
| `src/render/bombs.js` | ✅ | bomba em voo (arco/rastro/sombra), explosão | simulação |
| `src/ui.js` | ✅ | palheta, HUD, atalhos | simulação |
| `src/sim/fire.js` | ⏳ | ignição, propagação, extinção, cinzas, decaimento | áudio/partículas |
| `src/sim/bombs.js` | ⏳ | agendador de eventos, alvos, voo, impacto | desenho das partículas |
| `src/sim/water.js` | ⏳ | drenagem de `waterVol`, sucção do tile mais próximo, spray | regras de fogo |
| `src/sim/score.js` | ⏳ | cobertura, pontuação, estados de vitória/seca | render |
| `src/render/entities.js` | ⏳ | overlay dinâmico (fogo, spray, cinzas em transição) | regras |
| `src/render/particles.js` | ⏳ | fumaça, explosão, respingos (pool fixo) | estado do mundo |
| `src/audio.js` | ⏳ | WebAudio procedural | estado de jogo |
| `src/save.js` | ⏳ | (de)serialização versionada | regras |
| `src/ui.js` | ⏳ | palheta, HUD, mudo, recomeçar | simulação |

## 3. Modelo de dados (`grid.js`)

Grade fixa `GRID_W × GRID_H` (96×96). Arrays paralelos (SoA) para cache-friendly
e serialização trivial. Índice `i = y * GRID_W + x`.

| Array | Tipo | Significado |
| --- | --- | --- |
| `terrain` | Uint8 | `0` terra, `1` água |
| `tree` | Uint8 | `0` vazio, `1` árvore |
| `species` | Uint8 | índice da espécie (3–4), escolhida por ruído espacial + jitter |
| `tone` | Uint8 | variação de tom da terra (só render, definido no `generator`) |
| `state` | Uint8 | `0` idle, `1` queimando, `2` cinza |
| `fireHp` | Uint8 | aplicações de água restantes para debelar |
| `ashT` | Float32 | segundos desde que virou cinza (decai em 60s) |
| `wet` | Float32 | segundos restantes de umidade |
| `waterVol` | Float32 | volume de água restante no tile (drenado ao apagar fogo) |
| `distToWater` | Int16 | distância BFS até água NATURAL (-1 = inalcançável); congelado |
| `waterSource` | Int32 | índice do tile de rio mais próximo (de onde a água é debitada) |

Invariantes (validar em modo `?debug=1`):

1. `state === 2` (cinza) ⟹ `tree === 0`.
2. `state === 1` (fogo) ⟹ `tree === 1` e `terrain === 0` (fogo não vive na água).
3. `terrain === 1` ⟹ `tree === 0` e `state === 0`.
4. `fireHp > 0` apenas quando `state === 1`.
5. `waterVol > 0` apenas quando `terrain === 1`.

Serialização: cabeçalho `{version, seed, elapsed, score, arrays}` + arrays
comprimidos (RLE é suficiente; PNG/zlib não vale a complexidade).

## 4. Matemática isométrica (`iso.js`)

Tile `64×32`. Origem no topo do losango do tile `(0,0)`.

```
screenX = (x - y) * TILE_W / 2
screenY = (x + y) * TILE_H / 2
```

Inversa (a partir do centro do losango):

```
sx = (screenX) / (TILE_W / 2)
sy = (screenY) / (TILE_H / 2)
x  = (sx + sy) / 2
y  = (sy - sx) / 2
```

`tileAt(screen)` usa essa inversa + `Math.floor` + teste de dentro do losango
para precisão de borda. Ordem de desenho: `for y … for x` (back-to-front) ou
ordenado por `x + y`.

## 5. Loop e dirty flags

Só existe **dirty de frame** (o nível de chunks assados foi descartado — ver
§11: terreno custa 3 ms com `Path2D.rect` em espaço de tile, não compensa a
complexidade de invalidação).

Cada frame do RAF é decidido por duas classes de motivo, em `main.js`:

| motivo | exemplos | quando redesenha |
| --- | --- | --- |
| **entrada** | pintou, moveu a câmera, hover mudou | imediatamente, sem throttle |
| **animação** | fogo, fumaça, umidade, shimmer da água | respeita `TIME.animHz` |

```js
let redrawn = dirty || inputFrame();          // entrada tem prioridade
if (!redrawn && animFrame())                  // só animação?
  if (ts - lastRenderTs >= 1000/TIME.animHz - 2) redrawn = true;
```

`-2 ms` absorve o jitter do RAF: com RAF a 60 Hz, um teto de 30 Hz rende
exatamente 1 frame sim / 1 não. **Entrada nunca é limitada** — latência de pintar
e arrastar continua a 60 fps; a economia vem só de animação.

Por que 30 Hz basta para o fogo: as chamas trocam de quadro a 9 Hz e a fumaça
sobe ~1 px por frame. Medido com 53 focos + 120 partículas (headless, sem GPU):

| | antes | depois | |
| --- | --- | --- | --- |
| redraws/s | 42 (100%) | 30 (50%) | |
| ms de render por segundo | 147 | 102 | **-30%** |
| RAF fps | 42 | 60 | sobra folga |

Cuidado ao adicionar efeitos: **marcar `dirty = true` dentro de uma animação
fura o throttle**, porque classifica o frame como entrada. Foi o bug do primeiro
teste do fogo (100% de redraw com 42 fps).

Ver também §11 para o custo por efeito.

## 5b. Fluxo do fogo (`sim/fire.js`)

Tick fixo de 1/`FIRE.tickRate` (10/s), nunca `dt` variável — é o que torna o
incêndio determinístico e testável sem browser. Cada tick, em ordem:

1. **Propagação**: para cada foco, 8 vizinhos com árvore sã recebem sorteio
   `hash2(vizinho, tick*8+n, seed) < FIRE_CHANCE * dt * (molhado ? 0,1 : 1)`.
   Os aprovados vão para uma lista `pending` — sem isso o fogo correria vários
   tiles no mesmo tick (BFS instantânea).
2. **Envelhecer**: `burnT += dt`; ao chegar em `FIRE.burnTime` o tile vira cinza
   (`toAsh`: `treeCount--`, `ashCount++`).
3. **Acender** o que a fase 1 aprovou.
4. **Cinzas** decaem (`ashT += dt`); ao chegar em `FIRE.ashSeconds` voltam a ser
   terra replantável.
5. **Umidade** seca (`wet -= dt`).

`R0 = vizinhos × FIRE_CHANCE × burnTime`. Com `r0Target = 0,85` e 7 vizinhos a
90% de densidade, um foco consome `1/(1-R0) ≈ 6,7` tiles: o fogo tem **teto**.
Consequência de design: quem define a ameaça é o **raio de ignição** da bomba,
não o R0 (tabela medida em `BACKLOG.md` M4).

**Spray** (`sprayTile`) é a ferramenta 💧 aplicada a árvore/foco: custa
`sprayCost * (1 + (dist-1) * 0,3)` (teto 5), molha o tile por 8s e reduz
`fireHp`. Zerar o HP **salva a árvore** (não vira cinza). Em terra vazia, a mesma
ferramenta cava lago — daí a dica do HUD mudar com a ferramenta.

### Render do fogo

| decisão | porquê |
| --- | --- |
| chama é sprite pré-renderizado (4 quadros) | triângulos em path eram baratos e feios |
| halo assado **dentro** do sprite | `globalCompositeOperation = 'lighter'` por foco derrubou 43 → 21 fps |
| fumaça com teto de 120 partículas | é o efeito mais caro (alpha + escala) |
| chamas com `stride` acima de 260 focos | num incêndio grande a diferença é nula |
| árvore em chamas não desenha a copa verde | vira tora escura batchada num path |

## 5c. Fluxo do bombardeio (`sim/bombs.js`)

Estado em `createBombs(seed)`: RNG semeado, `nextEventAt`, lista `inFlight`,
`lastTarget`, contadores. Cada `updateBombs`:

1. Se `elapsed >= nextEventAt`: lança `bombsForEvent(elapsed)` bombas e agenda o
   próximo evento (15–30 s). Bombas do mesmo evento entram com `delay` aleatório.
2. Cada bomba em voo acumula `t`; ao chegar em `dur`, **impacta**: `igniteRadius`
   no alvo (raio 5) e empurra `{type:'explosion'}` em `grid.events`.

| peça | decisão |
| --- | --- |
| alvo | moeda: 50% aleatório (terra uniforme) / 50% mira floresta (`BOMB.forestBias`) |
| mira floresta | 32 tentativas procurando árvore; escolhe a mais longe do último impacto; se não achar, cai no fallback pontuado |
| água | nunca é alvo nos dois modos (fogo não pega, seria bomba desperdiçada) |
| voo (sim) | só tempo (`delay`, `dur`); nenhuma coordenada de tela |
| voo (render) | arco em espaço de tela: entra pela lateral, `-sin(p·π)` de altura, rastro de 4 fantasmas, sombra no alvo crescendo |
| impacto (render) | clarão, anel em expansão, poeira (partículas próprias em `render/bombs.js`), tremor de tela |

O tremor é aplicado em `main.js` como `ctx.translate` depois do fundo (que
precisa cobrir a tela toda) e antes de toda a cena, decaindo em
`BOMB.shakeSeconds`.

## 5d. Partículas (`render/fire.js`)

Fumaça e vapor compartilham a lista de campos e o integrador `advance()`, mas
são desenhados para **não se confundirem**:

| | fumaça (fuligem) | vapor |
| --- | --- | --- |
| sprite | 6 blobs escuros sobrepostos, silhueta esfarrapada | 4 blobs branco-azulados, compacto |
| cor | `rgba(44,39,34,…)` | `rgba(255,255,255,…)` |
| tamanho | 0,95–1,7 tile, expande 1,6× | 0,36–0,58 tile, expande 1,5× |
| movimento | vento (`windX 11`, `windY −26` px/s) | sobe forte (−58 a −92 px/s) e freia |
| vida | 2,2–4,5 s | 0,45–0,8 s |
| alpha | entra rápido, sai com `1−t²` | `(1−t)²`, some rápido |

**Deslocamento em px de TELA, não em tiles.** `wx/wy` é a origem no mundo;
`dx/dy` acumula `vdx/vdy` em pixels. Antes era `wx += vx`, e em iso mover X no
mundo é andar na diagonal da tela — a fumaça subia torta. Vento e empuxo agora
são exatamente o que o jogador vê.

## 6. Tunables (`config.js`)

| Chave | Valor inicial | Nota |
| --- | --- | --- |
| `GRID_W`, `GRID_H` | 96, 96 | mundo |
| `TILE_W`, `TILE_H` | 64, 32 | iso |
| `BOMB_FIRST_DELAY` | 15–30 s | aleatório |
| `BOMB_INTERVAL` | 15–30 s | aleatório a cada evento |
| `BOMB_MAX_CONCURRENT` | 5 | teto |
| `BOMB_RAMP_EVERY` | 60 s | +1 bomba por evento |
| `BOMB_FLIGHT_TIME` | ~1.8 s | travessia visível |
| `FIRE_SPREAD_CHANCE` | ~0.012/s | derivado de R0, não chutado |
| `FIRE_BURN_TIME` | ~10 s | tempo queimando antes de virar cinza |
| `FIRE_R0_TARGET` | < 1.0 | `R0 = vizinhos(~7) * chance/s * burnTime`; R0 >= 1 torna o jogo impossível em 90% de densidade |
| `FIRE_SPREAD_INTERVAL` | ~1.0 s | tick de propagação |
| `FIRE_WATER_HITS` | 4 | pintadas para debelar |
| `WET_DURATION` | ~6 s | umidade pós-spray |
| `ASH_DECAY` | 60 s | cinza → terra |
| `BRUSH_RADIUS` | 2–3 | raio 1 é inviável para cobrir ~8000 tiles |
| `WATER_TILE_MAX` | ~10 | volume por tile de água |
| `WATER_PAINT_BASE` | 2 | custo base para pintar 1 tile de água |
| `WATER_PAINT_DIST_MULT` | 1 | custo = `BASE * (1 + dist até água natural)` |
| `SPRAY_COST` | 1 / hit | cobrado do tile de água mais próximo |
| `SPRAY_REACH` | ~12 tiles | alcance da sucção |
| `WIN_COVERAGE` | 0.90 | vitória (denominador congelado na geração) |
| `SCORE_PAR_TIME` | 480 s | PAR de tempo da pontuação |
| `SAVE_EVERY` | ~10 s | autosave |
| `BRUSH.min/max/defaultRadius` | 1 / 4 / 2 | raio do pincel em tiles |
| `WATER.paintBase` | 2 | custo de alagar encostado no rio (2:1) |
| `WATER.paintDistFactor` | 0.5 | custo = `base * (1 + (dist-1) * fator)` |
| `WATER.pondVolume` | 1 | volume do tile alagado |
| `FIRE.r0Target` | 0.85 | R0 alvo a 90% de densidade (não passar de 1) |
| `FIRE.burnTime` | 10 s | tempo de queima até virar cinza |
| `FIRE.hpMin/hpMax` | 3 / 5 | aplicações de spray para debelar |
| `FIRE.tickRate` | 10 /s | tick fixo da simulação de fogo |
| `FIRE.wetSeconds` | 8 s | duração do aceiro molhado |
| `FIRE.wetSpreadMul` | 0.1 | chance de pegar em tile molhado |
| `FIRE.ashSeconds` | 60 s | cinza → terra replantável |
| `FIRE.windX/windY` | 11 / −26 px/s | vento da fumaça (espaço de tela) |
| `FIRE.maxSmoke` | 120 | orçamento de partículas |
| `FIRE.maxFlames` | 260 | orçamento de chamas desenhadas |
| `WATER.sprayCost` | 1 | volume por spray encostado no rio |
| `WATER.sprayDistFactor` | 0.3 | custo de transporte do spray |
| `WATER.sprayMaxCost` | 5 | teto do custo de spray |
| `BOMB.firstDelayMin/Max` | 12 / 22 s | tempo até a primeira bomba |
| `BOMB.intervalMin/Max` | 15 / 30 s | intervalo entre eventos |
| `BOMB.maxPerEvent` | 5 | teto de bombas simultâneas |
| `BOMB.eventRampSeconds` | 60 | +1 bomba por evento a cada minuto |
| `BOMB.igniteRadius` | 5 | raio de ignição (é o "quanto dói") |
| `BOMB.avoidRadius` | 14 | raio de penalidade do último impacto |
| `TIME.animHz` | 30 | teto de redesenho só-animação (entrada nunca é limitada) |
| `RENDER.lodZoom` | 0.45 | abaixo disso árvores viram manchas |
| `RENDER.groveMax` | 3 | maior bloco agrupado |
| `SPECIES` | 4 | pinheiro, folhosa, bétula, oliveira (h/w/copas/tronco) |

Balanceamento se ajusta **aqui**, nunca espalhado pelo código.

## 7. Áudio (`audio.js`) `[planejado]`

Contexto criado no primeiro gesto (política de autoplay). Vozes:
fogo = ruído branco → bandpass com amplitude proporcional à área queimando;
água = ruído curto com envelope rápido + lowpass;
explosão = burst de ruído + sweep de lowpass descendente;
bomba em voo = ruído com pitch subindo (whoosh).
Um `masterGain` para mudo, persistido no save.

## 7b. Estados de jogo e pontuação

Máquina de estados em `main.js` (não espalhar `if` de fim de jogo pelos módulos):

```
playing ──cobertura >= 0.90──▶ victory
   │
   └──aguaTotal == 0 && existe fogo──▶ drought
```

`src/sim/score.js` calcula, para os dois desfechos:

```
score = 1000 * coverage
      +  500 * (waterLeft / waterTotal)
      +  500 * max(0, (PAR - elapsed) / PAR)
```

`coverage = arvoresVivas / initialLandTiles` (congelado na geração; cinza e
água pintada contam contra). Conceito S/A/B/C/D por faixa, exibido como letra.
Recordes em `localStorage` via `save.js`.

## 8. Como estender

- **Nova ferramenta da palheta**: adicionar constante em `config.js`, caso em
  `input.js` (intent) e tratamento em `sim/` (regra) + cor em `render/`.
- **Nova espécie de árvore**: `tree` passa a indexar um array de espécies em
  `config.js`; só afeta `render/terrain.js` e o save.
- **Novo evento (chuva, vento)**: criar `src/sim/<evento>.js` com
  `update(grid, dt, ctx)` e registrar em `main.js`; não tocar em `bombs.js`.

## 9. Debug e perf

Três modos, ciclados pela tecla **`` ` ``** (backtick):

| Modo | O que mostra |
| --- | --- |
| 0 | nada |
| 1 (padrão) | chip `60 fps · 8% redraw` no canto |
| 2 (`?debug=1` começa aqui) | painel completo |

O painel (`#debug`) mostra, por linha: fps e `redraw %`, ms por camada
(`terreno / árvores / overlay`), tiles e árvores desenhados, zoom, ferramenta,
tile sob o cursor, cobertura, água, seed e o acumulado de frames
(`frames / pulados`).

**`redraw %`** = fração dos frames da última janela de 0,5 s em que o dirty flag
disparou, ou seja, quantos frames custaram rasterização de verdade. Leitura:

| Situação | redraw esperado |
| --- | --- |
| parado (sem vento/shimmer) | ~0–5% (a água "respira" a 2,5 Hz) |
| arrastando a câmera | 100% |
| pintando tile novo | 100% |
| repintando floresta já plantada | 0% — nada mudou, `paintPath` não marca dirty |

A métrica é a que responde "o jogo está gastando CPU?" sem olhar o fps: fps alto
com `redraw 3%` significa que o loop está ocioso, não que o render é rápido.

`?seed=N` fixa o PRNG. `window.__game` expõe `grid`, `camera`, `state`, `stats`,
`hooks` e `seed` para inspeção no console e para os probes.

## 9b. Cobertura de testes (`tools/check.mjs`)

33 checks, todos sem browser: matemática iso (roundtrip 9216 tiles), gerador
determinístico, invariantes de contador, BFS de distância à água, custo de
pintura, groves, trilha de brush, e — desde M4 — R0 dentro do alvo, água como
barreira intransponível, aceiro de spray, debelar salvando a árvore, cinza
voltando a ser terra, determinismo do incêndio e sincronia das listas de
trabalho.

## 10. Comandos e verificação

```sh
tools/serve.sh 8777                     # dev server (porta opcional)
node tools/check.mjs                    # testes de sanidade sem browser
node tools/probe.mjs --url="http://localhost:8777/?seed=1234&debug=1" \
  --wait=1500 --eval="window.__game.stats" --shot=/tmp/shot.png
```

`tools/probe.mjs` sobe um Chromium headless via CDP, coleta exceções e
mensagens de console, avalia `--eval` e salva screenshot. Sai com código 1 se
houver erro de página. É a forma padrão de verificar UI sem abrir navegador.

`window.__game = { grid, camera, state, stats, seed }` fica exposto para o
probe e para inspeção manual no console.

## 11. Perfil de render (medido, não estimado)

**Metodologia importa.** Medir com `getImageData()` no fim do laço força o
rasterizador a terminar e cobra a rasterização dentro da janela de medição; já o
`performance.now()` em volta da chamada no loop real mede sobretudo JS + overhead
de chamada (o raster vai para o compositor). Os dois números abaixo são do tipo
"só JS", medidos em Chromium headless **sem GPU** (pior caso).

| Experimento (9216 tiles, mundo inteiro) | ms |
| --- | --- |
| losango: 9216 × (`moveTo`+3 `lineTo`+`closePath`) num `Path2D` | **163** |
| retângulo: 9216 × `Path2D.rect` + 1 `fill` com matriz iso | **3,1** |
| custo de rasterização dos mesmos retângulos (com flush) | +7 |
| 1.000 `drawImage` de sprite 50×70 (destino = 3,5 Mpx) | 17 |

A diferença de 163 → 3,1 ms **não** é a contagem de chamadas: é a **complexidade
do path**. 9216 contornos fechados de 4 segmentos obrigam o Skia a tessellar 46
mil segmentos; 9216 `rect` são contornos triviais e alinhados aos eixos. Regras
que ficaram:

1. **`rect` em espaço de tile + matriz iso.** O quadrado unitário vira o losango
   exato sob `ctx.transform(HW*z, HH*z, -HW*z, HH*z, tx, ty)`: 1 contorno trivial
   por tile, e o culling continua em espaço de tela.
2. **Path complexo é armadilha.** Preferir poucos contornos simples a muitos
   contornos "bonitos". Vale para fogo, cinzas e água.
3. **Preenchimento é o piso em software**: ~4–5 ns/px com alpha, ~1 ns/px opaco.
   Uma tela 1280×800 = 1 Mpx por camada. Em GPU real isso cai ~5–15×.
4. **Overdraw é o custo escondido das árvores**: 2.000 sprites de ~2.000 px
   pintam 4 Mpx, ou seja 4 telas. Por isso árvores custam mais que terreno em
   zoom médio (7,6 ms vs 0,7 ms a 0,8×), e por isso existe o LOD.
5. **Não medir com `getImageData`** e não confiar no fps do RAF: o dirty flag
   pula frames. Use `?debug=1`, que mostra `terreno / árvores / overlay` separados.

### Custo por elemento para M4/M5 (medido)

| Efeito | Custo |
| --- | --- |
| 300 chamas num único path (triângulos) | 0,22 ms |
| 300 partículas de fumaça (sprite 36 px, alpha) | 3,5 ms |
| bomba (sprite + sombra) | desprezível |
| cinzas (path batchado por tom) | ~0,1 ms |

Ou seja: fogo e bombas são baratos por serem **limitados por contagem**, não por
área de tela. Fumaça é o único risco — daí o orçamento de partículas (≤120) e o
sprite pequeno.
