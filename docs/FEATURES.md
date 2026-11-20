# FEATURES — Arthur's Redemption

Registro do que **existe hoje e funciona no browser**. Não listar intenção aqui:
intenção vive em `docs/BACKLOG.md`.

Legenda: ✅ funcionando · 🧪 implementado mas sem verificação visual · ❌ removido

## Estado atual

**M1 concluído** — mundo isométrico 96×96 navegável com rios gerados. Ainda não
há pintura nem simulação de fogo.

## Infra / projeto

| Feature | Status | Onde |
| --- | --- | --- |
| Repositório git inicializado | ✅ | `.git/` |
| `brainstorm.txt` fora do versionamento | ✅ | `.gitignore` |
| Documentação: backlog, features, atlas de código | ✅ | `docs/` |
| Instruções do projeto indexando a documentação | ✅ | `AGENTS.md` |
| Servidor estático de dev | ✅ | `tools/serve.sh` |
| Testes de sanidade sem browser | ✅ | `tools/check.mjs` |
| Probe headless (CDP) com erros de console e screenshot | ✅ | `tools/probe.mjs` |
| Manifest + ícone PWA | ✅ | `manifest.webmanifest`, `icons/icon.svg` |

## Mundo e câmera

| Feature | Status | Observações |
| --- | --- | --- |
| Grade isométrica 96×96 (tile 64×32) | ✅ | mundo de 6144×3072 px |
| Geração determinística por seed | ✅ | `?seed=N`; mesma seed = mesmo mapa |
| Rios serpenteando de borda a borda | ✅ | 1–3 rios, largura variável com afinamento nas pontas |
| Tons de terra em manchas suaves | ✅ | 4 tons via fbm + dither leve |
| Pan por arrasto (1 dedo / mouse) | ✅ | esquerdo ainda arrasta; muda em M3 |
| Zoom por wheel e pinça | ✅ | 0.18× a 3×, ancorado no ponteiro |
| Clamp de câmera (não sai do mundo) | ✅ | margem de 220 px de mundo |
| Culling de tiles fora do viewport | ✅ | ~870 tiles a zoom 1.1 |
| Highlight do tile sob o cursor | ✅ | feedback de mira |
| Dirty flag de frame (não redesenha parado) | ✅ | câmera/hover/shimmer assinados |
| Overlay de debug (`?debug=1`) | ✅ | fps, tiles desenhados, câmera, tile, seed |
| Volume de água por tile dos rios | ✅ | `waterVol` = 10/tile (soma 2.870 na seed 1234) |

## Performance medida

Chromium headless (software rendering, pior caso):

| Cenário | fps | tiles/frame |
| --- | --- | --- |
| zoom-out total (mundo inteiro) | 53 | 9216 |
| zoom 1.1 (trabalho normal) | 60 | 867 |

## Jogo

| Feature | Status | Observações |
| --- | --- | --- |
| Pintura de floresta/água | ❌ | M3 |
| Árvores, espécies, clusters | ❌ | M3/M3b |
| Fogo, cinzas, água como recurso | ❌ | M4/M9 |
| Bombardeio | ❌ | M5 |
| Áudio | ❌ | M6 |
| Save/retomada | ❌ | M7 |
| Pontuação e finais | ❌ | M10 |

## Como verificar

```sh
tools/serve.sh 8777
node tools/check.mjs                                   # matemática + gerador
node tools/probe.mjs --url="http://localhost:8777/?seed=1234&debug=1" \
  --wait=1500 --eval="window.__game.stats" --shot=/tmp/shot.png
```

Manual: abrir `http://localhost:8777` — arrastar para navegar, wheel/pinça para
zoom, `?debug=1` para métricas, `?seed=N` para fixar o mapa.
