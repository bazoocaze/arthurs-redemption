# Arthur's Redemption

Jogo isométrico no navegador: o Arthur queimou tudo e agora precisa replantar.
Plante floresta, apague incêndio e chegue a **90% de cobertura** antes que o rio
seque.

**Jogar:** https://bazoocaze.github.io/arthurs-redemption/

Funciona offline e é instalável (PWA). Sem build, sem dependências: HTML, CSS e
ES modules servidos direto.

## Como se joga

- **Arraste** para plantar (ferramenta 🌲), com o botão esquerdo.
- **💧 Água** apaga fogo: arraste sobre um tile em chamas. Cada foco precisa de
  3 a 5 aplicações, e o custo cresce com a distância do rio.
- **🖐️ Mover**: botão direito/meio, dois dedos, setas do teclado ou a ferramenta
  de mão.
- Bombas caem de tempos em tempos — 50% em lugar aleatório, 50% mirando floresta.
  Um impacto acende ~71 focos num raio de 5 tiles.
- **Vitória** em 90% de cobertura. **Derrota** quando a água zera e há fogo ativo.

A água é uma reserva fixa (10 por tile de rio) e nunca se recarrega: o mesmo
tanque paga o combate ao fogo. Gastar tudo é uma decisão, não um acidente.

## Teclas

| tecla | ação |
| --- | --- |
| `1` `2` `3` | plantar · água · mover |
| `[` `]` | raio do pincel |
| setas | mover a vista |
| `F` | enquadrar o mapa inteiro |
| `M` | som |
| `` ` `` | chip de fps / painel |
| `D` | painel de debug |

Com o **painel de debug aberto** (`D`): `I` acende fogo no cursor, `B` solta
bomba no cursor, `N` solta bomba sorteada como o jogo faz, `V` força vitória e
`L` força derrota.

## Estrutura

```
index.html          UI, HUD, CSS
src/config.js       todos os tunables (fogo, bomba, água, meta, pontuação)
src/grid.js         dados em SoA: terreno, árvore, espécie, fogo, cinza, água
src/generator.js    rios paramétricos + BFS de distância até a água
src/sim/            pintura, fogo (R0), bombardeio
src/render/         terreno, árvores, fogo/fumaça, bombas, overlay
src/game.js         máquina de estados (playing → victory | drought) e nota
src/save.js         save binário em localStorage
tools/check.mjs     56 testes headless (node tools/check.mjs)
tools/probe.mjs     verificação no navegador via CDP (screenshots, eval)
docs/               BACKLOG, FEATURES, CODE-ATLAS
```

## Rodando local

```sh
tools/serve.sh            # http://localhost:8777
node tools/check.mjs      # testes
```

Parâmetros de URL: `?fresh=1` ignora o save, `?debug=1` abre o painel de debug,
`?nosw=1` não registra o service worker.

## Decisões de design

O fogo usa R0 < 1 de propósito (cada foco alcança ~6,7 tiles): o incêndio sempre
tem teto, então a floresta é sempre reconstruível. A ameaça vem do raio de
ignição da bomba, não da propagação. Detalhes e medições em
[docs/BACKLOG.md](docs/BACKLOG.md).
