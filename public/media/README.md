# Media da landing page

A landing tem **slots** para vídeos/fotos do produto. Enquanto um slot não
tiver ficheiro, mostra um mock em JSX (showcase) ou a secção nem aparece
(feature tour). Para ativar, coloca os ficheiros nesta pasta com os nomes
abaixo e preenche o slot em `components/marketing/media.ts`.

## Slots

| Slot | Ficheiros | Aspect | Resolução alvo | Onde aparece |
|---|---|---|---|---|
| `showcaseTerminal` | `showcase-terminal.mp4` + `showcase-terminal.jpg` (poster) | **16:10** | 2560×1600 | Showcase principal (a app "abre-se" com o scroll, logo abaixo do hero) |
| `featureTour` | `feature-tour.mp4` + `feature-tour.jpg` (poster) | **16:9** | 1920×1080 | Faixa larga entre as stories e o bento (só renderiza com ficheiro) |

Exemplo de ativação em `components/marketing/media.ts`:

```ts
showcaseTerminal: {
  video: "/media/showcase-terminal.mp4",
  poster: "/media/showcase-terminal.jpg",
},
```

## Specs dos vídeos

- **MP4 (H.264)**, sem faixa de áudio (tocam sempre muted).
- **< 8 MB** por vídeo (a CSP obriga a self-hosting — isto pesa no deploy
  e no LCP de quem faz scroll). 20–30s em loop chega.
- 24–30 fps; bitrate ~4–6 Mbps a 1600p, ~3–4 Mbps a 1080p.
- **Poster JPG obrigatório** (primeiro frame, mesmo aspect) — é o que se
  vê antes do vídeo carregar e com `prefers-reduced-motion`.
- Gravar com o tema **light** (papel) por defeito; se gravarem também em
  dark, sufixo `-dark` e falamos de theme-switching depois.
- Sem rato a saltar: movimentos lentos e deliberados (estilo vídeos da Apple).

## Fotos (futuro)

Screenshots para os cards do bento: PNG/WebP 2×, nome `bento-<card>.png`.
Adicionamos os slots quando existirem.
