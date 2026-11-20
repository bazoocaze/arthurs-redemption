# BACKLOG — Arthur's Redemption

Lista de tarefas de desenvolvimento. Fonte de verdade do "o que falta".
Ao concluir uma tarefa, marcar `[x]` e registrar a feature correspondente em
`docs/FEATURES.md`. Ao criar/renomear módulos, atualizar `docs/CODE-ATLAS.md`.

Convenções de status:
- `[ ]` pendente
- `[~]` em andamento
- `[x]` feito e verificado no browser
- `[!]` bloqueado / decisão pendente

---

## M0 — Fundação (scaffold)

- [x] `git init` + `.gitignore` (brainstorm.txt não versionado)
- [x] `AGENTS.md` com índice da documentação
- [x] `docs/BACKLOG.md`, `docs/FEATURES.md`, `docs/CODE-ATLAS.md`
- [x] Estrutura de pastas `src/`, `src/render/`, `icons/`
- [x] `index.html` com canvas fullscreen + `<noscript>` de aviso
- [x] `tools/serve.sh` (`python3 -m http.server`) e instrução no AGENTS.md
- [x] `src/config.js` centralizando todos os tunables (sem magic numbers no resto)
- [x] `src/rng.js` — PRNG determinístico (mulberry32), seed salva no save
- [x] `manifest.webmanifest` + ícone SVG (base PWA, sem service worker ainda)
- [x] Harness de verificação: `tools/check.mjs` (sem browser) e `tools/probe.mjs` (CDP headless)

## M1 — Mundo isométrico e câmera

- [x] `src/iso.js`: conversões tile↔mundo e centro do losango
- [x] `src/camera.js`: pan (1 dedo / botão esquerdo por enquanto) e zoom (wheel/pinça) com clamp
- [x] `src/grid.js`: grade 96x96 em arrays paralelos (SoA), contadores e `coverage()`
- [x] `src/generator.js`: terra com tons suaves + 1–3 rios serpenteando de borda a borda
- [x] Render base: terra em losangos, batching por cor (poucos `fill` por frame)
- [x] Culling no viewport (~870 tiles a zoom 1.1)
- [x] Medir perf: 60fps a zoom 1.1 e 53fps a zoom-out total (Chromium headless, sem GPU)
- [ ] Highlight/sombra de relevo no terreno (fica flat; árvores vão dominar a leitura)
- [ ] Pan com botão direito/meio dedicado (hoje o esquerdo também arrasta; muda em M3)
- [ ] Medir perf com viewport cheio de árvores (depende de M3)

## M2 — Dirty flags / render em camadas

- [x] Skip de frame: se nada mudou e a câmera está parada, não redesenhar (dirty de frame já ativo)
- [x] Terreno otimizado sem chunks: `Path2D.rect` em espaço de tile + matriz iso (68ms -> 9ms no mundo inteiro)
- [x] Árvores como sprites pré-renderizados (1 `drawImage` por árvore em vez de 6-19 chamadas)
- [x] Overlay de fogo/fumaça/bombas (será dinâmico por frame em M4/M5)
- [x] Contador de debug: fps, tiles desenhados, árvores desenhadas, ms do render
- [ ] Chunks assados em offscreen — **adiado**: as duas otimizações acima resolveram o gargalo; só voltar se o custo por frame pós-M4/M5 (fogo + fumaça + bombas) passar de ~10ms
- [ ] `invalidateTile(x,y)` / cache de chunks — só se chunks voltarem ao plano

## M3 — Pintura (floresta / água)

- [x] `src/input.js`: pointer events unificados (mouse/toque/caneta) + trilha por Bresenham (arrasto rápido não deixa buracos)
- [x] Palheta com 3 ferramentas: 🖐️ pan, 🌲 floresta, 💧 água; atalhos 1/2/3
- [x] Brush circular com raio 1–4 (`BRUSH`, atalhos `[` e `]`, botão na palheta)
- [x] Palheta floresta: planta em terra vazia; ignora água/cinza/fogo
- [x] Palheta água: alaga a terra, custa `2 * (1 + (dist-1) * 0.5)` do reservatório do rio
- [x] Preview do brush (todos os tiles que a pintada atinge)
- [x] Pan sempre disponível: botão direito/meio, shift, espaço, ferramenta mão, 2 dedos, setas/WASD; `F` enquadra o mundo
- [x] Água no incêndio (spray) fica para M4 — depende do modelo de fogo
- [ ] Undo simples (descartado por ora: recomeçar é barato)

## M3b — Espécies e agrupamento visual

- [x] 4 espécies (`SPECIES`: pinheiro, folhosa, bétula, oliveira) escolhidas por fbm + jitter
- [x] Render por sprite pré-renderizado (silhueta, cor de copa e tronco próprios)
- [x] Grove 2x2 / 3x3 detectado por varredura gulosa (sem flood fill), determinístico
- [x] Moita única desenhada no lugar de N árvores dentro do bloco
- [x] LOD: abaixo de `RENDER.lodZoom` (0.45) árvores viram manchas em 4 paths (1 por espécie)

## M3c — Pintura de lago removida ✅

A ferramenta 💧 fazia duas coisas: apagar fogo e cavar lago. O lago foi
**removido** a pedido do autor, com esta medição como justificativa:

| por que o lago não pagava | evidência |
| --- | --- |
| o fogo não viaja | 2 ignições de raio 2 em floresta 100% densa queimaram 42 tiles; cada foco rende ~0,6 tile extra. Alcance de ~3 tiles |
| a barreira protege a vítima errada | a ameaça é o impacto instantâneo (71 focos num raio 5), que cai DENTRO do muro |
| cobra no recurso da vitória | cada tile de água saía do denominador congelado; zerar a reserva em lagos levou a cobertura máxima a 89,4% (meta: 90%) — partida invencível, silenciosamente |

Fica só o **spray** (`sprayTile`), que é throughput de combate. Consequência
boa: nenhum verbo destrói terra, então `landTiles === landTotal` sempre e o teto
de cobertura volta a ser 100%. Travado por teste em `check.mjs`.

## M4 — Fogo, água e cinzas ✅

- [x] `src/sim/fire.js`: ignição, propagação 8-vizinhos por tick fixo, resistência a `wet`
- [x] R0 explícito: `R0 = vizinhos * chance/s * burnTime`, derivado de `FIRE.r0Target` (0,85 em 90% de densidade)
- [x] Fogo nunca atravessa tile de água (nem diagonal)
- [x] `fireHp` 3–5 por foco: cada spray reduz 1; ao zerar a árvore é **salva**
- [x] Spray molha o tile por `FIRE.wetSeconds` (8s) e serve de aceiro (10% da chance)
- [x] Árvore queimada → cinza (`STATE.ASH`) com `ashT`
- [x] Cinza decai em 60s → terra replantável
- [x] Contadores: `burningCount`, `ashCount`, `treeCount` incrementais + `recount()` nos testes
- [x] Render: chamas com sprite (halo embutido), fumaça com orçamento de 156 partículas desenhada **por cima** das chamas, cicatriz de cinza no terreno
- [x] HUD: pílula 🔥 com número de focos
- [x] Ferramenta 💧 sensível ao contexto: apaga fogo / molha árvore / cava lago
- [x] 15 testes novos no `check.mjs` (R0, água como barreira, aceiro, spray, cinza, determinismo, contadores)

### O que a medição mudou no plano

Medido em 10 seeds a 90% de densidade (uma ignição, sem novas bombas):

| raio de ignição | focos | mediana queimada | máx | % da floresta |
| --- | --- | --- | --- | --- |
| 2 | ~12 | 23 tiles | 54 | 0,3% |
| 3 | ~28 | 43 tiles | 67 | 0,5% |
| 5 | ~71 | 81 tiles | 109 | 1,0% |

> **Correção de estimativa.** Durante o M5 eu documentei "~500 tiles por
> impacto, ~6% da floresta". Repetindo com o simulador isolado (16 seeds), o
> número real é **mediana 84 / máx 106** com R0 0,85. O erro nasceu de contar
> tiles queimados acumulados em várias explosões como se fossem uma. A
> conclusão qualitativa não muda — **o "quanto assusta" é o raio de ignição, não
> o R0** — mas a bomba é 6× menos devastadora do que a doc dizia.

### "O fogo anda mais rápido" — decisão final: `burnTime` 10 → 7 s

O pedido foi +30% de propagação. A primeira tentativa foi a leitura literal:
multiplicar a chance de propagação por 1,3 (`r0Target` 0,85 → 1,105). Medido em
16 seeds com bomba raio 5:

| densidade | R0 antes | R0 com chance ×1,3 | tiles antes | tiles depois | duração |
| --- | --- | --- | --- | --- | --- |
| 25% (jogo real) | 0,243 | 0,316 | 18 | 18 | 11 s → 12 s |
| 90% (floresta cheia) | 0,850 | 1,105 | 84 | 91 | 30 s → 36 s |

Quase nada em densidade de jogo, e R0 > 1 em floresta cheia (incêndio sem teto).
**A propagação é limitada por adjacência, não por probabilidade**: com 25% de
floresta cada tile tem ~2 vizinhos, então não existe o que multiplicar.

O botão da **velocidade** é outro. Um tile só passa fogo enquanto está
queimando, então a frente avança ~1 tile por `burnTime`. Revertido o R0 para
0,85 e com `burnTime` 7 s:

| densidade | tiles | duração antes | duração agora |
| --- | --- | --- | --- |
| 25% | 18 | 11 s | **8 s** |
| 90% | 87 | 30 s | **25 s** |

Mesma área queimada, frente ~20% mais rápida, R0 de volta abaixo de 1. Travado
por teste em `check.mjs` (`frente de fogo avança um tile por burnTime`).

## M5 — Bombardeio ✅

- [x] Raio de ignição 5 (medido: mediana 84 tiles queimados por impacto em floresta cheia)
- [x] `src/sim/bombs.js`: agendador 15–30 s, primeira bomba em 12–22 s
- [x] Bombas por evento = `min(1 + floor(elapsed/60), 5)`
- [x] Alvo: 50% destino aleatório / 50% mira floresta (`BOMB.forestBias`); nunca em água
- [x] Voo visível: arco parabólico entrando pela lateral, rastro, sombra que cresce no alvo
- [x] Impacto: clarão + anel em expansão + poeira + tremor de tela + ignição em raio
- [x] Debug: `B` solta uma bomba no cursor, `N` solta uma bomba sorteada como o jogo faz
- [x] 7 testes novos (40 no total): fórmula por evento, alvo fora da água, preferência por floresta, impacto, agendador, determinismo

### Decisões que a medição forçou

- **Metade mira, metade é aleatória.** Só mirar floresta torna o jogo
  previsível (toda bomba dói); só aleatório faz metade dos eventos cair no vazio.
  Medido em 600 alvos: mira acerta 71% num mapa de 46% de floresta (85% a 71% de
  densidade, 39% a 5%).
- **"Mirar" tem que encontrar.** A primeira versão só pontuava 16 amostras, e a
  mira herdava a densidade do mapa (24% de acerto com 3,5% de árvores, metade
  disso vindo do modo aleatório). Agora procura árvore por rejeição (32
  tentativas) e escolhe a mais longe do último impacto.
- **Peso contra repetir o canto.** Sem penalidade de distância ao último
  impacto, dois eventos seguidos empilham e o resto do mapa fica intocado.
- **A sombra é o único aviso.** O design pede surpresa, mas sem sombra o jogador
  não tem como reagir; ela cresce e escurece enquanto a bomba desce.

## M6 — Áudio procedural ✅

- [x] `src/audio.js`: contexto criado no primeiro gesto (política de autoplay)
- [x] Fogo: cama de ruído filtrado com ganho ligado à área queimando + estalos sorteados
- [x] Água: splash curto por aplicação, splash maior ao debelar foco
- [x] Explosão: burst de ruído com lowpass descendo + thump senoidal grave
- [x] Assovio descendente durante a queda da bomba (único aviso sonoro)
- [x] Plantar: toque curto de madeira
- [x] Mudo pela tecla `M` ou botão 🔊, persistido em localStorage
- [x] Pan estéreo pela posição do tile na tela

### Decisões

- **Fogo é ambiente, não evento.** Um som por foco seriam 100 osciladores.
  Cama contínua de ruído + estalos com densidade proporcional resolve com 1 nó.
- **Throttle por tipo de som.** Um spray de raio 4 empurra 49 eventos no mesmo
  frame; sem throttle seriam 49 splashes empilhados (= ruído branco saturado).
  Medido: 49 eventos → 1 voz.
- **Teto global de 14 vozes.** Acima disso descarta, em vez de somar.
- **Assovio é o único aviso.** O design quer surpresa visual (a bomba só aparece
  voando), mas som dá tempo de reação sem mostrar onde ela cai.

## M7 — PWA e persistência ✅

- [x] `manifest.webmanifest` com ícones PNG 192/512 + maskable (gerados por `tools/icons.mjs`)
- [x] `sw.js`: app shell em cache, atualização versionada, network-first em dev
- [x] `src/save.js`: grid + relógio + bombas + câmera + ferramenta em localStorage, versionado
- [x] Autosave a cada 10 s e no `visibilitychange`/`pagehide`
- [x] Botão ↺ com confirmação em 2 toques (sem modal)
- [x] `?fresh=1` ignora o save; `?nosw=1` não registra o service worker
- [x] 5 testes de roundtrip (45 no total)

### Decisões

- **O terreno não é salvo.** Ele é determinístico a partir da seed, então
  `generateWorld(seed)` reconstrói terreno, tons, rios, `distToWater` e
  `landTotal` idênticos. Salva só o que muda: 123 KB de base64 em vez de ~2 MB
  de JSON.
- **Arrays tipados, não JSON.** Float32 vira Uint8/Uint16 com escala (`burnT`
  em segundos, `wet` em décimos, `waterVol` em décimos). Encode custa ~5 ms.
- **Ordem de boot importa.** `waterInitial` (denominador da barra de água) é
  lido do mundo recém-gerado, antes de aplicar o save; e a câmera é restaurada
  antes de `resize()` para o `fitWorld` não sobrescrever a posição salva.
- **`pagehide` + recomeçar = bug.** O botão apagava o save e recarregava, mas o
  `pagehide` salvava de novo o estado descartado (o jogo "voltava" depois de
  recomeçar). Corrigido com a flag `saveDescartado`.
- **Dev é network-first.** Stale-while-revalidate em localhost serviria o código
  do carregamento anterior após cada edição. Em produção é stale-while-revalidate
  (abre na hora e atualiza por trás).

## M9 — Recursos e objetivo ✅

- [x] Recarga de rio: **nenhuma** (arco finito, termina em seca)
- [x] Pintar água custa volume (custo sub-linear por distância até água natural)
- [x] Denominador da cobertura congelado na geração (`landTotal`)
- [x] `waterVol` por tile + spray debita do rio mais próximo (custo por distância)
- [x] Cobertura = árvores / `landTotal` (meta 90%)
- [x] Transições: `playing` → `victory` (90%) | `drought` (água zerada **e** fogo ativo)
- [x] Tela final satírica: 4 frases de vitória + 3 de derrota, sorteadas
      (`pickMessage` não repete a anterior)
- [x] Sim e pintura congelam ao fim da partida

### Decisões

- **Vitória é checada a cada frame**, não por timer: o jogo termina no tile que
  fecha os 90%, com feedback imediato.
- **Derrota só com fogo ativo.** Água zerada com floresta intacta é só "não tem
  mais como apagar" — o jogo continua. Sem isso, gastar água pintando lagos
  encerraria a partida sem drama.
- **Partida encerrada não é salva.** `saveDescartado` + `clearSave()`: recarregar
  começa outra. Os recordes ficam (chave separada).

## M10 — Pontuação ✅

- [x] `score = 1000·cobertura + 500·(água restante/inicial) + 500·rapidez`
- [x] PAR de 8 min (`GAME.parSeconds`) para o bônus de rapidez
- [x] Nota S/A/B/C/D por faixas; derrota é sempre **F**
- [x] Tela final com stats por ícone (árvores e %, água, árvores perdidas, tempo)
- [x] Recordes em localStorage (`ar.records`): pontos, cobertura, vitória mais rápida
- [x] Contador de cobertura e medidor de água no HUD (sem texto)

### Faixas

| nota | pontos | leitura |
| --- | --- | --- |
| S | ≥ 1650 | vitória cheia, água quase intacta, rápida |
| A | ≥ 1350 | vitória confortável |
| B | ≥ 1050 | venceu com folga pequena |
| C | ≥ 750 | venceu no limite (90%, seca, no PAR) |
| D | < 750 | venceu arrastando |
| F | — | secou com fogo ativo |

## M8 — Polimento

- [ ] HUD mínimo: árvores vivas, tempo, nível de bombardeio (ícones + números)
- [ ] Tela inicial / onboarding de 1 linha ("plante arrastando")
- [ ] Ajuste de balanceamento (tempos, chance de propagação, N de água)
- [ ] Acessibilidade básica: contraste, alvos grandes no mobile, `prefers-reduced-motion` reduzindo shake/partículas
- [ ] Teste em tela pequena (360px) e touch real

---

## Dúvidas / decisões futuras

- [x] Sem vento — decidido: fogo sem direção preferencial
- [x] Espécies de árvore — decidido: 3–4 espécies + tiles de agrupamento
- [x] Recarga de rio, anti-moat, finais e denominador — decididos (M9)
- [ ] Espécie influenciar inflamabilidade (ex. pinheiro queima mais rápido)?
