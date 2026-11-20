# AGENTS.md — Arthur's Redemption

Jogo de browser (PWA) isométrico sobre plantar e proteger florestas de
bombardeios e incêndios. Sem build step, sem npm: JS puro (ES modules) + Canvas 2D.

## Documentação (leia antes de codar)

| Documento | Para quê |
| --- | --- |
| `docs/BACKLOG.md` | lista de tarefas e milestones — fonte de verdade do que falta |
| `docs/FEATURES.md` | o que já está implementado e funciona no browser |
| `docs/CODE-ATLAS.md` | mapa do código: arquivos, modelo de dados, invariantes, tunables |
| `brainstorm.txt` | notas originais + decisões de design (não versionado) |

Fluxo obrigatório ao trabalhar aqui:
1. Escolher tarefa em `docs/BACKLOG.md` e marcar `[~]`.
2. Implementar.
3. Marcar `[x]` e registrar a feature em `docs/FEATURES.md`.
4. Atualizar `docs/CODE-ATLAS.md` se criou/moveu/renomeou módulo ou mudou invariante.

## Princípios

- Simples e melhor esforço; bom é melhor que perfeito.
- Zero dependências, zero bundler. Abrir via servidor estático.
- Todos os números de balanceamento vivem em `src/config.js`.
- A simulação não conhece pixels; o render não conhece regras.
- Dirty flags em dois níveis: chunks assados (estático) e skip de frame (dinâmico).
- Áudio procedural, UI em pt-BR e com pouco texto.

## Comandos

```sh
tools/serve.sh 8777            # dev server (porta padrão 8777)
node tools/check.mjs          # testes de sanidade sem browser
node tools/probe.mjs --url="http://localhost:8777/?seed=1234&debug=1" \
  --wait=1500 --eval="window.__game.stats" --shot=/tmp/shot.png
# http://localhost:8777  |  ?debug=1  |  ?seed=123
```

Para expressões longas use `--evalFile=/tmp/probe.js` (evita perda de
caracteres na linha de comando) e redirecione a saída para arquivo: o probe
escreve o JSON de uma vez no fim.

Verificação de UI é feita com `tools/probe.mjs` (Chromium headless via CDP):
ele reporta exceções/console, avalia JS e salva screenshot. Sempre rodar
`check.mjs` + `probe.mjs` antes de marcar tarefa como concluída.

**Métrica de perf**: `window.__game.stats` traz `fps`, `redrawPct`, `redrawHz`
(fração de frames redesenhados na última janela de 0,5 s) e o custo por camada
(`terrainMs`, `treesMs`, `overlayMs`). Ela, não o fps, diz se há trabalho por
frame: parado fica em ~3% (shimmer da água), arrastando/pintando fica em 100%.
Antes de otimizar render, leia `docs/CODE-ATLAS.md` §11 (perfil medido).

## Convenções de código

- ES modules, `export` nomeado; nada de bundler, nada de TypeScript.
- `dt` em segundos, sempre limitado (`Math.min(dt, 0.05)`) para evitar saltos
  após a aba ficar em background.
- Nada de alocação por frame em caminhos quentes (usar pools).
- Commits sem `Co-Authored-By`.
- Responder ao usuário em pt-BR.
