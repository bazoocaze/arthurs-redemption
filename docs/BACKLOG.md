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

## M4 — Fogo, água e cinzas ✅

- [x] `src/sim/fire.js`: ignição, propagação 8-vizinhos por tick fixo, resistência a `wet`
- [x] R0 explícito: `R0 = vizinhos * chance/s * burnTime`, derivado de `FIRE.r0Target` (0,85 em 90% de densidade)
- [x] Fogo nunca atravessa tile de água (nem diagonal)
- [x] `fireHp` 3–5 por foco: cada spray reduz 1; ao zerar a árvore é **salva**
- [x] Spray molha o tile por `FIRE.wetSeconds` (8s) e serve de aceiro (10% da chance)
- [x] Árvore queimada → cinza (`STATE.ASH`) com `ashT`
- [x] Cinza decai em 60s → terra replantável
- [x] Contadores: `burningCount`, `ashCount`, `treeCount` incrementais + `recount()` nos testes
- [x] Render: chamas com sprite (halo embutido), fumaça com orçamento de 120 partículas, cicatriz de cinza no terreno
- [x] HUD: pílula 🔥 com número de focos
- [x] Ferramenta 💧 sensível ao contexto: apaga fogo / molha árvore / cava lago
- [x] 15 testes novos no `check.mjs` (R0, água como barreira, aceiro, spray, cinza, determinismo, contadores)

### O que a medição mudou no plano

R0 < 1 **é** o que torna o jogo justo, mas sozinho ele deixa o fogo inofensivo:
um foco queima `1/(1-R0) ≈ 6,7` tiles. Medido em 24 seeds a 90% de densidade:

| raio de ignição | focos | mediana queimada | máx | % da floresta |
| --- | --- | --- | --- | --- |
| 2 | ~13 | 19 tiles | 43 | 0,6% |
| 3 | ~29 | 42 tiles | 56 | 1,3% |
| 5 | ~78 | ~500 tiles | — | ~6% |

Conclusão: **o "quanto assusta" é o raio de ignição da bomba (M5), não o R0**. O
R0 fica em 0,85 para o incêndio ter teto (nunca apocalíptico, sempre
reconstruível) e a ameaça vem do tamanho do que a bomba acende.

## M5 — Bombardeio ✅

- [x] Raio de ignição 5 (medido: ~500 tiles queimados por impacto, ~6% da floresta)
- [x] `src/sim/bombs.js`: agendador 15–30 s, primeira bomba em 12–22 s
- [x] Bombas por evento = `min(1 + floor(elapsed/60), 5)`
- [x] Alvo por amostragem: peso para floresta e para longe do último impacto; nunca em água
- [x] Voo visível: arco parabólico entrando pela lateral, rastro, sombra que cresce no alvo
- [x] Impacto: clarão + anel em expansão + poeira + tremor de tela + ignição em raio
- [x] Debug: tecla `B` solta uma bomba no cursor
- [x] 7 testes novos (40 no total): fórmula por evento, alvo fora da água, preferência por floresta, impacto, agendador, determinismo

### Decisões que a medição forçou

- **Alvo prefere floresta.** Bomba em terra vazia é evento nulo: o jogador vê a
  animação e nada acontece. Amostragem de 16 tentativas com peso para tile com
  árvore resolve (teste garante >60% em floresta).
- **Peso contra repetir o canto.** Sem penalidade de distância ao último
  impacto, dois eventos seguidos empilham e o resto do mapa fica intocado.
- **A sombra é o único aviso.** O design pede surpresa, mas sem sombra o jogador
  não tem como reagir; ela cresce e escurece enquanto a bomba desce.

## M6 — Áudio procedural
## M6 — Áudio procedural

- [ ] `src/audio.js`: contexto WebAudio criado no primeiro gesto do usuário (política de autoplay)
- [ ] Fogo: ruído filtrado com amplitude ligada à área queimando
- [ ] Água: splash curto por aplicação
- [ ] Explosão: burst de ruído + lowpass sweep
- [ ] Mudo por padrão? Não — som ligado, com botão de mudo persistido

## M7 — PWA e persistência

- [ ] `manifest.webmanifest` (name, short_name, display standalone, theme_color, ícones)
- [ ] `sw.js`: cache-first do app shell, atualização versionada
- [ ] `src/save.js`: serializar/restaurar grid + timers + score + RNG seed (localStorage, com `version`)
- [ ] Autosave a cada ~10s e no `visibilitychange`/`pagehide`
- [ ] Botão "recomeçar" com confirmação (2 toques, sem modal de texto longo)
- [ ] Testar instalação no Chrome e retomada offline

## M9 — Recursos e objetivo (decidido)

- [x] Recarga de rio: **nenhuma** (arco finito de ~10–12 min, termina em seca)
- [x] Pintar água custa volume: `2 * (1 + distância até água natural)` por tile
- [x] Denominador da cobertura congelado na geração (`initialLandTiles`)
- [x] Seca + fogo ativo = tela final satírica; 90% = vitória e recomeça
- [ ] `waterVol` por tile de água + drenagem ao apagar fogo (consumo por aplicação)
- [ ] Spray consome do tile de água mais próximo dentro do raio; sem água no raio = spray seco
- [ ] Custo de pintura de água com multiplicador por distância até água natural (fecha o exploit do moat)
- [ ] Cobertura: contador árvores / `initialLandTiles` (meta 90%)
- [ ] Transições de estado: `playing` → `victory` | `drought` (seca com fogo ativo)
- [ ] Tela final satírica com mensagem para o Arthur
- [ ] Balancear reservatório total para arco de ~10–12 min

## M10 — Pontuação

- [ ] `score = 1000*cobertura + 500*(agua_restante/agua_total) + 500*rapidez`
- [ ] PAR de tempo (~8 min) como tunável
- [ ] Conceito S/A/B/C/D por faixas, exibido como letra grande
- [ ] Tela final com stats por ícone: árvores vivas, tempo, água restante, árvores perdidas, área queimada
- [ ] Recordes em localStorage (melhor score, melhor cobertura, vitória mais rápida)
- [ ] Contador de cobertura e medidor de água no HUD, sem texto

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
