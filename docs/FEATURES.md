# FEATURES — Arthur's Redemption

Registro do que **existe hoje e funciona no browser**. Não listar intenção aqui:
intenção vive em `docs/BACKLOG.md`.

Legenda: ✅ funcionando · 🧪 implementado mas sem verificação visual · ❌ removido

## Estado atual

**M1 + M2 + M3 + M3b + M4 + M5 concluídos** — mundo isométrico navegável,
floresta de 4 espécies, pintura de água que drena o rio, fogo balanceado com
spray e cinzas, e **bombardeio** com voo visível e explosão. Ainda não há áudio
nem save.

## Infra / projeto

| Feature | Status | Onde |
| --- | --- | --- |
| Repositório git + documentação indexada | ✅ | `AGENTS.md`, `docs/` |
| Servidor estático de dev (porta 8777) | ✅ | `tools/serve.sh` |
| Testes de sanidade sem browser (15 checks) | ✅ | `tools/check.mjs` |
| Probe headless (CDP): erros, `--eval`, screenshot | ✅ | `tools/probe.mjs` |
| Manifest + ícone PWA | ✅ | `manifest.webmanifest`, `icons/icon.svg` |

## Mundo e câmera

| Feature | Status | Observações |
| --- | --- | --- |
| Grade isométrica 96×96 (tile 64×32) | ✅ | mundo 6144×3072 px |
| Geração determinística por seed | ✅ | `?seed=N` |
| Rios de borda a borda, largura variável | ✅ | 1–3 rios; volume 10/tile |
| Tons de terra em manchas suaves | ✅ | 4 tons via fbm + dither |
| Pan: botão direito/meio, shift, espaço, ferramenta 🖐️, 2 dedos, setas/WASD | ✅ | botão esquerdo obedece a palheta |
| Zoom por wheel e pinça, ancorado no ponteiro | ✅ | 0.18× a 3× |
| `F` enquadra o mundo inteiro | ✅ | |
| Culling de tiles/árvores no viewport | ✅ | |
| Dirty flag de frame (não redesenha parado) | ✅ | câmera/hover/shimmer |
| Teto de 30 Hz para frames só-animados | ✅ | entrada (pintar/mover) continua em 60 |
| Chip de perf sempre visível | ✅ | `fps · % redraw`, alternado com a tecla `` ` `` |
| Painel de debug (`?debug=1` ou `` ` ``) | ✅ | fps, redraw %, ms por camada (terreno/árvores/overlay), tiles, árvores, cobertura, água, seed, frames pulados |

## Pintura

| Feature | Status | Observações |
| --- | --- | --- |
| Palheta com 3 ferramentas (🖐️ / 🌲 / 💧) | ✅ | atalhos 1 / 2 / 3 |
| Brush circular raio 1–4 + preview dos tiles | ✅ | `[` `]` ou botão na palheta |
| Trilha interpolada (Bresenham) no arrasto | ✅ | arrasto rápido não deixa buracos |
| Plantar floresta em terra vazia | ✅ | ignora água, cinza e fogo |
| Pintar água drenando o rio | ✅ | custo `2 * (1 + (dist-1) * 0.5)` |
| Reservatório finito de água | ✅ | soma dos `waterVol`; alagar falha sem volume |
| Denominador da cobertura congelado | ✅ | pintar lago não facilita a meta |

## Floresta

| Feature | Status | Observações |
| --- | --- | --- |
| 4 espécies (pinheiro, folhosa, bétula, oliveira) | ✅ | silhueta, copa e tronco próprios |
| Espécie por ruído espacial + jitter | ✅ | mistura de 584/1.454/1.402/442 na seed 1234 |
| Agrupamento 2×2 e 3×3 na mesma espécie | ✅ | desenha moita única |
| Detecção gulosa determinística (sem flood fill) | ✅ | `src/grove.js`, independe da câmera |
| LOD: abaixo de 0.45× de zoom vira mancha por espécie | ✅ | 4 paths por frame |
| Sprites pré-renderizados com sombra embutida | ✅ | 1 `drawImage` por árvore |

## Fogo

| Feature | Status | Observações |
| --- | --- | --- |
| Ignição por raio (bomba/debug) | ✅ | `igniteRadius`; debug acende com `I` sob o cursor |
| Propagação 8-vizinhos em tick fixo (10/s) | ✅ | determinística: `hash2(tile, tick, seed)` |
| R0 derivado de configuração, alvo 0,85 a 90% de densidade | ✅ | `FIRE.r0Target`; R0 cai em floresta rala |
| Fogo não atravessa água | ✅ | testado, inclusive na diagonal |
| Cada foco queima 10s e vira cinza | ✅ | `FIRE.burnTime` |
| `fireHp` 3–5: spray reduz, zerar **salva** a árvore | ✅ | árvore não vira cinza se debelada |
| Spray molha por 8s e serve de aceiro | ✅ | umidade corta a chance para 10% |
| Cinza por 60s → terra replantável | ✅ | `FIRE.ashSeconds` |
| Chamas com sprite + halo, fumaça com teto de 120 partículas | ✅ | `render/fire.js` |
| Fumaça (fuligem) escura e esfarrapada, vento para cima/direita | ✅ | deslocamento em px de tela |
| Vapor (branco-azulado) ao apagar, curto e rápido | ✅ | distinto da fumaça em cor, forma, tamanho e vida |
| Pílula 🔥 no HUD com número de focos | ✅ | pisca enquanto há fogo |
| 💧 contextual: apaga / molha / cava lago | ✅ | a dica muda com a ferramenta |

## Bombardeio

| Feature | Status | Observações |
| --- | --- | --- |
| Primeira bomba em 12–22 s | ✅ | tempo de plantar algo antes |
| Eventos a cada 15–30 s | ✅ | agendador determinístico por seed |
| Bombas por evento = 1 + 1/min, teto 5 | ✅ | `bombsForEvent` |
| Alvo com peso para floresta e longe do último impacto | ✅ | nunca cai em água |
| Voo visível com arco, rastro e faísca | ✅ | 1,1–1,7 s de voo |
| Sombra no alvo que cresce | ✅ | única dica de onde cai |
| Impacto: clarão, anel, poeira, tremor, ignição raio 5 | ✅ | ~500 tiles queimados por impacto |
| `B` solta bomba no cursor (debug) | ✅ | só com `?debug=1` |

## HUD

| Feature | Status | Observações |
| --- | --- | --- |
| Barra de cobertura de floresta com marcador em 90% | ✅ | meta de vitória |
| Barra de água restante (vermelha quando seca) | ✅ | proporção do reservatório inicial |
| Tamanho do brush | ✅ | número no botão da palheta |

## Métrica de redraw

`redraw %` = frames em que o dirty flag disparou na última janela de 0,5 s.
Medido no headless: câmera parada **3%** (2/s, só o shimmer da água), arrastando
a câmera **100%**, zoom contínuo **100%**, pintando terra virgem **100%**,
repintando floresta existente **0%**.

## Performance medida

Chromium headless, **software rendering** (pior caso; GPU real é muito mais rápida):

| Cenário | render | fps |
| --- | --- | --- |
| terreno com o mundo inteiro (9216 tiles) | 9 ms | 50 |
| terreno em zoom 1.2 | 1.8 ms | 60 |
| 1.467 árvores em zoom 0.85 | 2.5 ms | 60 |
| 2.446 árvores em zoom 0.75 (cobertura 100%) | 4.6 ms | 50 |

Otimizações que produziram isso: `Path2D.rect` em espaço de tile com matriz iso
(68 ms → 9 ms) e sprites de árvore (17 ms → 2,5 ms). Ver `CODE-ATLAS.md` §11.

## Ainda não existe

| Feature | Status | Milestone |
| --- | --- | --- |
| Áudio procedural | ❌ | M6 |
| Save/retomada (localStorage) | ❌ | M7 |
| Service worker (offline) | ❌ | M7 |
| Pontuação, vitória e tela satírica | ❌ | M9/M10 |

## Como verificar

```sh
tools/serve.sh 8777
node tools/check.mjs                                   # 15 checks
node tools/probe.mjs --url="http://localhost:8777/?seed=1234&debug=1" \
  --wait=1500 --eval="window.__game.stats" --shot=/tmp/shot.png
```

Manual: abrir `http://localhost:8777` — arrastar planta, 💧 pinta água, 🖐️
ou botão direito move, `F` enquadra, `?debug=1` mostra métricas.
