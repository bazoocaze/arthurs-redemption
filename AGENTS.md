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
tools/serve.sh                 # dev server (quando existir)
python3 -m http.server 8080    # alternativa sem script
# http://localhost:8080  |  ?debug=1  |  ?seed=123
```

## Convenções de código

- ES modules, `export` nomeado; nada de bundler, nada de TypeScript.
- `dt` em segundos, sempre limitado (`Math.min(dt, 0.05)`) para evitar saltos
  após a aba ficar em background.
- Nada de alocação por frame em caminhos quentes (usar pools).
- Commits sem `Co-Authored-By`.
- Responder ao usuário em pt-BR.
