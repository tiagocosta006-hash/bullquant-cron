/**
 * Dimensões de variante oferecidas no separador "Variantes" do painel Tweak.
 *
 * Cada dimensão = um atributo `data-v-<attr>` em <html>. O CSS que as
 * implementa vive em app/design-variants.css; aqui só está o catálogo que o
 * painel usa para desenhar os botões.
 *
 * A opção "a" é SEMPRE o original (nenhum atributo escrito). `finding` liga a
 * dimensão ao achado do detector que a motivou, para o painel poder mostrar
 * porque é que aquela dimensão existe.
 */

export type VariantOption = {
  id: string
  label: string
  hint: string
}

export type VariantDimension = {
  /** Sufixo do atributo: `icon` → `data-v-icon`. */
  attr: string
  label: string
  /** Regra do detector que motivou a dimensão. */
  finding: string
  /** Quantos achados no site, para ordenar por impacto. */
  count: number
  /** `slop` = tell de IA; `quality` = defeito de qualidade. */
  kind: "slop" | "quality"
  options: VariantOption[]
}

export const VARIANT_DIMENSIONS: VariantDimension[] = [
  {
    /* Faltava aqui: o CSS de `[data-v-hero]` existia em design-variants.css e
       as imagens estavam em public/media/hero/, mas sem entrada no catálogo o
       painel nunca mostrou o controlo — não havia forma de trocar as fotos.
       Cada uma tem par claro/escuro, trocado pelo `.dark` do <html>. */
    attr: "hero",
    label: "Foto do hero",
    finding: "hero sem imagem",
    count: 1,
    kind: "quality",
    options: [
      { id: "a", label: "Sem foto", hint: "Só a curva dourada (como está hoje)" },
      { id: "b", label: "Velas", hint: "Gráfico de velas macro" },
      { id: "c", label: "Fita", hint: "Fita de cotações" },
      { id: "d", label: "Bolsa", hint: "Fachada / edifício" },
      { id: "e", label: "Pregão", hint: "Chão de negociação" },
    ],
  },
  {
    attr: "imgsize",
    label: "Tamanho das imagens",
    finding: "mocks pequenos de mais",
    count: 3,
    kind: "quality",
    options: [
      { id: "a", label: "Original", hint: "Como está hoje" },
      { id: "b", label: "Mais largo", hint: "Frame até 80rem; bento a 1 coluna" },
      { id: "c", label: "Full-bleed", hint: "O frame rompe a margem, de bordo a bordo" },
      { id: "d", label: "Zoom dentro", hint: "A moldura fica; o conteúdo cresce 15%" },
    ],
  },
  {
    attr: "icon",
    label: "Ícone dos cartões",
    finding: "icon-tile-stack",
    count: 7,
    kind: "slop",
    options: [
      { id: "a", label: "Original", hint: "Quadrado arredondado por cima do título" },
      { id: "b", label: "Ao lado", hint: "Ícone à esquerda do título, sem caixa" },
      { id: "c", label: "Nu", hint: "Sem caixa, ícone maior, ainda por cima" },
      { id: "d", label: "Sem ícone", hint: "Só tipografia" },
    ],
  },
  {
    attr: "kicker",
    label: "Sobretítulo",
    finding: "kicker-above-heading",
    count: 6,
    kind: "slop",
    options: [
      { id: "a", label: "Original", hint: "MAIÚSCULAS com tracking, a dourado" },
      { id: "b", label: "Removido", hint: "O heading fala por si" },
      { id: "c", label: "Com traço", hint: "Minúsculas com hairline ao lado" },
      { id: "d", label: "Discreto", hint: "Neutro, sem caps (também corrige contraste)" },
    ],
  },
  {
    attr: "nest",
    label: "Cartões aninhados",
    finding: "nested-cards",
    count: 20,
    kind: "slop",
    options: [
      { id: "a", label: "Original", hint: "Caixas dentro de caixas" },
      { id: "b", label: "Achatado", hint: "Interior sem superfície" },
      { id: "c", label: "Divisores", hint: "Linhas em vez de caixas" },
      { id: "d", label: "Só exterior", hint: "Uma superfície apenas" },
    ],
  },
  {
    attr: "sheen",
    label: "Texto com gradiente",
    finding: "gradient-text",
    count: 5,
    kind: "slop",
    options: [
      { id: "a", label: "Original", hint: "Varrimento dourado no texto" },
      { id: "b", label: "Cor sólida", hint: "Dourado sem gradiente" },
      { id: "c", label: "Sublinhado", hint: "Acento por baixo, texto normal" },
      { id: "d", label: "Só itálico", hint: "A forma marca, sem cor" },
    ],
  },
  {
    attr: "elev",
    label: "Elevação das superfícies",
    finding: "gpt-thin-border-wide-shadow",
    count: 5,
    kind: "slop",
    options: [
      { id: "a", label: "Original", hint: "Borda fina + sombra larga" },
      { id: "b", label: "Assente", hint: "Sombra curta, sem borda" },
      { id: "c", label: "Papel", hint: "Só borda, zero sombra" },
      { id: "d", label: "Plano", hint: "Distingue-se pelo tom" },
    ],
  },
  {
    attr: "contrast",
    label: "Contraste do dourado",
    finding: "low-contrast",
    count: 54,
    kind: "quality",
    options: [
      { id: "a", label: "Original", hint: "#b8873b — 3,1:1, falha AA" },
      { id: "b", label: "Dourado AA", hint: "Escurecido até passar 4,5:1" },
      { id: "c", label: "Neutro", hint: "Ouro só em CTAs; rótulos a neutro" },
      { id: "d", label: "Ambos", hint: "Dourado AA + rótulos neutros" },
    ],
  },
  {
    attr: "microtext",
    label: "Texto minúsculo",
    finding: "undersized-ui-text",
    count: 40,
    kind: "quality",
    options: [
      { id: "a", label: "Original", hint: "Rótulos a 9–10px" },
      { id: "b", label: "Piso 11px", hint: "O mínimo defensável" },
      { id: "c", label: "Piso 12px", hint: "Confortável, sem tracking" },
      { id: "d", label: "12px sem caps", hint: "Máxima legibilidade" },
    ],
  },
  {
    attr: "reveal",
    label: "Conteúdo escondido",
    finding: "content-hidden-at-rest",
    count: 3,
    kind: "quality",
    options: [
      { id: "a", label: "Original", hint: "83% do texto a opacity 0 em repouso" },
      { id: "b", label: "Só movimento", hint: "Visível sempre, só desliza" },
      { id: "c", label: "Sem reveal", hint: "Tudo assente desde o início" },
      { id: "d", label: "Fade curto", hint: "220ms, sem deslocação" },
    ],
  },
]
