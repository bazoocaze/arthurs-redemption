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

## 2. Mapa de arquivos `[planejado]`

| Arquivo | Responsabilidade | Não deve conter |
| --- | --- | --- |
| `index.html` | canvas, HUD, palheta, `<link rel=manifest>`, registro do SW | lógica de jogo |
| `manifest.webmanifest` | metadados PWA | — |
| `sw.js` | cache do app shell, versionamento | estado de jogo |
| `tools/serve.sh` | servidor estático de dev | — |
| `src/main.js` | bootstrap, loop RAF, acumulador de `dt`, ordem de update/render | regras de fogo/bomba |
| `src/config.js` | **todos** os tunables e cores | lógica |
| `src/rng.js` | PRNG determinístico (mulberry32) | — |
| `src/grid.js` | arrays SoA do mundo, acessores, `invalidateTile` | desenho |
| `src/generator.js` | terreno inicial + rios | simulação em tempo real |
| `src/iso.js` | conversões iso↔tela, geometria do losango | estado |
| `src/camera.js` | pan/zoom, `worldToScreen`, `viewBounds` | input bruto |
| `src/input.js` | eventos pointer/wheel → intents (brush, pan, zoom) | regras de fogo |
| `src/sim/fire.js` | ignição, propagação, extinção, cinzas, decaimento | áudio/partículas |
| `src/sim/bombs.js` | agendador de eventos, alvos, voo, impacto | desenho das partículas |
| `src/sim/water.js` | drenagem de `waterVol`, sucção do tile mais próximo, spray | regras de fogo |
| `src/sim/score.js` | cobertura (terra vs árvore), estados de vitória/seca | render |
| `src/render/terrain.js` | camada assada em chunks (terra, água, árvores, cinzas) | simulação |
| `src/render/entities.js` | overlay dinâmico (fogo, spray, sombra/highlight) | regras |
| `src/render/particles.js` | fumaça, explosão, respingos (pool fixo) | estado do mundo |
| `src/audio.js` | WebAudio procedural | estado de jogo |
| `src/save.js` | (de)serialização versionada | regras |
| `src/ui.js` | palheta, HUD, mudo, recomeçar | simulação |

## 3. Modelo de dados (`grid.js`) `[planejado]`

Grade fixa `GRID_W × GRID_H` (96×96). Arrays paralelos (SoA) para cache-friendly
e serialização trivial. Índice `i = y * GRID_W + x`.

| Array | Tipo | Significado |
| --- | --- | --- |
| `terrain` | Uint8 | `0` terra, `1` água |
| `tree` | Uint8 | `0` vazio, `1` árvore |
| `species` | Uint8 | índice da espécie (3–4), escolhida por ruído espacial + jitter |
| `state` | Uint8 | `0` idle, `1` queimando, `2` cinza |
| `fireHp` | Uint8 | aplicações de água restantes para debelar |
| `ashT` | Float32 | segundos desde que virou cinza (decai em 60s) |
| `wet` | Float32 | segundos restantes de umidade |
| `waterVol` | Float32 | volume de água restante no tile (drenado ao apagar fogo) |

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

Dois níveis distintos — não confundir:

1. **Dirty de chunk (estático).** Chunks de `8×8` tiles assados em canvas
   offscreen contendo terra + água + árvore + cinza. Qualquer mutação chama
   `grid.invalidateTile(x, y)`, que marca `chunk.dirty = true`; só chunks sujos
   são re-assados, no máximo N por frame.
2. **Dirty de frame (dinâmico).** Se `camera` não mudou, nenhum chunk foi
   reassado, e não há partículas/bombas/fogo ativos, o frame anterior do canvas
   é reaproveitado (não redesenha nada). `renderer.needsFrame` é o flag.

O que é dinâmico e sempre desenhado por frame (sobre o assado): fogo, fumaça,
bombas em voo, explosões, respingos, highlight do brush, cursor.

**Agrupamento visual (clusters).** Nada de flood fill global: ao plantar ou
queimar um tile, olhar a janela 5x5 e decidir se o tile pertence a um cluster
(2x2+ de árvores da mesma espécie). O render desenha um tile de agrupamento
(moita/bosque) em vez de N árvores individuais, e o chunk é invalidado
normalmente.

## 6. Tunables (`config.js`) `[planejado]`

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

## 9. Debug

`?debug=1` liga overlay com FPS, chunks reassados/frame, contagem de tiles por
estado, bombas ativas e botão de "ignir 1 tile no centro". `?seed=N` fixa o PRNG.

## 10. Comandos

```sh
tools/serve.sh                     # ou: python3 -m http.server 8080
git status / git diff              # sem build, sem lint configurado ainda
```
