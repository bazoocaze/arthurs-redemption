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
- [ ] Estrutura de pastas `src/`, `src/sim/`, `src/render/`, `icons/`
- [ ] `index.html` com canvas fullscreen + `<noscript>` de aviso
- [x] `tools/serve.sh` (`python3 -m http.server`) e instrução no AGENTS.md
- [ ] `src/config.js` centralizando todos os tunables (sem magic numbers no resto)
- [ ] `src/rng.js` — PRNG determinístico (mulberry32), seed salva no save

## M1 — Mundo isométrico e câmera

- [ ] `src/iso.js`: `tileToScreen`, `screenToTile`, caminho do losango do tile
- [ ] `src/camera.js`: pan (arrasto botão direito/meio, dois dedos), zoom (wheel/pinça) com clamp
- [ ] `src/grid.js`: grade 96x96 em arrays paralelos (SoA): `terrain`, `tree`, `fireHp`, `ashT`, `wet`
- [ ] `src/generator.js`: terreno marrom com variação de tom + 1–3 rios serpenteando
- [ ] Render base: terra desenhada com highlight/sombra iso, ordenação back-to-front
- [ ] Culling: só desenhar tiles dentro do viewport (`viewBounds` da câmera)
- [ ] Medir perf: alvo 60fps com viewport cheio de árvores

## M2 — Dirty flags / render em camadas

- [ ] Chunks assados (ex. 8x8 tiles) em canvases offscreen para terreno+árvores+cinzas
- [ ] `invalidateTile(x,y)` marca só o chunk afetado
- [ ] Overlay dinâmico (fogo, fumaça, bombas, spray) redesenhado por frame
- [ ] Skip de frame: se nada mudou e a câmera está parada, não redesenhar (blit do frame anterior)
- [ ] Contador de debug (chunks redesenhados/s, fps) atrás de flag `?debug=1`

## M3 — Pintura (floresta / água)

- [ ] `src/input.js`: unificação pointer events (mouse/touch), brush com interpolação entre pontos (arrasto rápido não deixa buracos)
- [ ] Palheta floresta: planta em tile de terra vazia; ignora água/cinza/fogo
- [ ] Brush com raio >= 2 (arrastar precisa render 8000+ tiles; raio 1 é inviável)
- [ ] Palheta água: pinta lago/rio; apaga fogo do tile alvo (ver M4)
- [ ] Feedback visual do brush (destaque do tile sob o cursor)
- [ ] Undo simples? (opcional, só se sobrar tempo)

## M3b — Espécies e agrupamento visual

- [ ] `species` no grid (poucas espécies: 3–4), escolhida por ruído espacial + jitter
- [ ] Render de árvore por espécie (altura, copa, cor)
- [ ] Detecção local de cluster (janela 5x5, não flood fill global) ao plantar/queimar
- [ ] Tile de agrupamento (moita/bosque) desenhado quando o cluster atinge 2x2+
- [ ] Invalidar chunk quando o cluster muda de forma

## M4 — Fogo, água e cinzas

- [ ] `src/sim/fire.js`: ignição, propagação 8-vizinhos com chance/tick e resistência a `wet`
- [ ] Balancear como R0 explícito em config: `R0 = vizinhos * chance/s * burnTime`, alvo R0 < 1 na densidade de 90% (senão o jogo é impossível)
- [ ] Fogo nunca atravessa tile de água
- [ ] `fireHp` por foco: requer N aplicações de água (N ~4, tunável) para debelar
- [ ] Água molha tile por alguns segundos (reduz chance de reignição / serve de aceiro)
- [ ] Árvore queimada → cinza (estado ASH) com `ashT`
- [ ] Cinza decai em 60s → terra vazia replantável
- [ ] Estatísticas: árvores vivas, árvores queimadas, área queimada

## M5 — Bombardeio

- [ ] `src/sim/bombs.js`: agendador 15–30s aleatório
- [ ] Bombas por evento = `min(1 + floor(elapsed/60), 5)`
- [ ] Escolha de alvo: aleatório, com penalidade em raio ao redor do último foco
- [ ] Voo visível: arco parabólico cruzando a tela, escala/sombra crescentes até o impacto
- [ ] Impacto: explosão (partículas + flash + shake leve) + ignição em raio pequeno
- [ ] Áudio da bomba: whoosh na aproximação, boom no impacto

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

## M9 — Recursos e objetivo (design pendente de confirmação)

- [!] Recarga de rio: nenhuma (arco finito) ou lenta (endless)? — decisão do autor
- [!] Anti-moat: restringir pintura de água a adjacente a água existente e/ou cobrar volume — decisão do autor
- [ ] `waterVol` por tile de água + drenagem ao apagar fogo (consumo por aplicação)
- [ ] Spray consome do tile de água mais próximo dentro de um raio; sem água no raio = spray seco
- [ ] Cobertura: contador `tiles terra` vs `tiles árvore` (meta 90%), HUD sem texto
- [ ] Estado de vitória (cobertura >= 90%) e estado de seca sem água + fogo ativo
- [ ] Tela final satírica (opcional, alinhado ao contexto do Arthur)
- [ ] Balancear reservatório total para arco de ~8–12 min

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
- [ ] Modo "lição de moral": mensagem final satírica quando o Arthur perde a
      floresta? (opcional, alinhado ao contexto)
- [ ] Espécie influenciar inflamabilidade (ex. pinheiro queima mais rápido)?
