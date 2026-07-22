# BullValue — Fundações visuais (artefacto de testes)

Página única e auto-contida que serve de **laboratório de design** do BullValue:
cor, tipografia, movimento, gráficos e Liquid Glass — para o Alex ver e reagir
antes de tocar em páginas reais da app.

## Como construir e publicar

```bash
cd design/foundations
node build-foundations.js          # gera bullvalue-foundations.html (fontes embebidas)
```

Depois publica `bullvalue-foundations.html` com a ferramenta **Artifact** do Claude
(favicon 🎨). Em sessões anteriores esteve em:
`https://claude.ai/code/artifact/b0e21f45-158d-4009-b104-4b49c21c5638`
(um chat novo cria um URL novo — não há problema.)

- Editar sempre o `foundations.template.html` (o conteúdo). O HTML final é gerado.
- O build lê as fontes reais de `../../public/fonts/` (SF UI Text + Scotch) e
  embebe-as em base64. Não editar o `bullvalue-foundations.html` à mão.

## Direção de design fechada (ver memória `design_vision_bullvalue`)

- **Norte:** "o que faria a Apple". Clean, chamativo mas clean. Nada de premium
  dourado forçado/azeiteiro.
- **Canvas:** claro por defeito + toggle escuro.
- **Cor:** neutros quentes quase monocromáticos + **dourado matte** como acento
  (não azul Apple, não lime/laranja). Verde/vermelho só para semântica (sobe/desce).
  Dourado #E4AA33 pertence à Bullocracy; no BullValue é acento contido.
- **Tipografia:** **SF Pro em tudo**, incl. números (tabular-nums). **JetBrains
  Mono largada.** Usar toda a escala de pesos (Light→Heavy), Heavy nos grandes
  títulos. **Scotch Bold Italic** só num título-herói da landing, nunca maiúsculas.
- **Movimento:** scroll com inércia (glide, ease in/out); reveals reversíveis
  (fade+slide+blur, entram E saem); fundo topográfico flat de página inteira que
  reage ao rato; odómetro nos preços; gráficos animados. **Sem glows** (ai-slop).
  **Sem cursor personalizado** (rejeitado). Tudo respeita prefers-reduced-motion.
- **Gráficos:** linha + barras, uma cor por série (dourado), grelha discreta,
  endpoint destacado, hover, números tabulares (regras da skill `dataviz`).

## ✅ Liquid Glass v3 — refração edge-confined por SDF

O efeito Apple iOS 26 "Liquid Glass" foi refeito. A correção-chave: o mapa de
deslocamento antigo era uma **rampa linear** (deslocamento uniforme da pane
inteira) — por isso nunca convencia (ou pouca distorção, ou tudo esborratado).
Agora o mapa é gerado a partir de um **signed distance field (SDF) de retângulo
arredondado**, então o deslocamento é **~0 no centro** (passa nítido) e sobe só
junto às **bordas arredondadas** (dobra o fundo como vidro espesso). Técnica:
dev.to/childrentime + **`shuding/liquid-glass`**.

Camadas (ver `.glass` e secção "06 — Liquid Glass" no template):

1. **Refração edge-confined** — mapa SDF gerado em JS **por pane** (aspeto/raio
   reais), injetado num `<filter id="glass-lens-N">` próprio. Cada filtro corre o
   `feDisplacementMap` **3× a scales ligeiramente diferentes (R/G/B)** e recombina
   com `feBlend screen` → **aberração cromática** subtil só no rim. Aplicado via
   `backdrop-filter: var(--lens) …`. Regenera em resize (`ResizeObserver`).
2. **Frost** — `blur(1.4px) saturate() brightness() contrast()` leve por cima (o
   blur pesado matava a definição; agora a "vidrez" vem da lente).
3. **Specular / rim** — fio de luz no topo (`::before`), brilho a seguir o rato +
   glow de canto (`::after`), contra-rim inferior (box-shadow), cantos **squircle**
   (`corner-shape: superellipse` com fallback), cáustica líquida (`filter #liquid`).

**Tunables** (topo do bloco JS, objeto `GLASS`, afinar em vivo): `EDGE` (espessura
da banda de refração), `STRENGTH` (intensidade da lente), `ABERR` (separação RGB),
`MAXRES` (resolução do mapa).

**Toggle de fundos** no demo (procedural, CSP-safe): **Foto** (wallpaper vívido em
canvas — prova a lente), **Mesh** (aurora em tons de marca), **App** (mock da UI
BullValue — ver o vidro sobre a app real), **Contour** (o fundo topográfico da
página). Só funciona bem em Chromium (Safari/FF caem no frost via `-webkit-`).

## Estado atual

`v3` — Liquid Glass com refração edge-confined por SDF + aberração cromática +
toggle de fundos. Fontes: 7 faces embebidas (~660 KB). Ficheiro-fonte:
`foundations.template.html`.
