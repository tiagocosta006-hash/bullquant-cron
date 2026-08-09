/**
 * Catálogo de tokens editáveis pelo painel Tweak (components/devtools/TweakPanel).
 *
 * Só entra aqui o que faz sentido mexer a olho durante o design. Os primitivos
 * crus (--paper-*, --night-*) ficam de fora de propósito: o que se quer afinar
 * é a camada SEMÂNTICA (--primary, --background, …), que é a que a UI consome.
 * Ver a arquitetura de 3 camadas em app/globals.css.
 */

export type TweakKind = "color" | "length" | "select"

export type TweakToken = {
  /** Nome da custom property, com os dois hífenes. */
  name: string
  label: string
  kind: TweakKind
  /** Só para kind "length": limites do slider, na unidade indicada. */
  min?: number
  max?: number
  step?: number
  unit?: string
  /** Só para kind "select". */
  options?: { label: string; value: string }[]
}

export type TweakGroup = {
  id: string
  label: string
  tokens: TweakToken[]
}

/** Stacks de fontes oferecidas no seletor. As duas primeiras são as do produto. */
const FONT_OPTIONS = [
  { label: "SF UI Text (atual)", value: "var(--font-sans)" },
  { label: "Scotch Display (atual)", value: "var(--font-heading)" },
  { label: "System UI", value: "system-ui, sans-serif" },
  { label: "Georgia (serifa)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Iowan / Palatino", value: "'Iowan Old Style', Palatino, serif" },
  { label: "Helvetica / Arial", value: "Helvetica, Arial, sans-serif" },
  { label: "Menlo (mono)", value: "Menlo, Consolas, monospace" },
]

export const TWEAK_GROUPS: TweakGroup[] = [
  {
    id: "brand",
    label: "Marca",
    tokens: [
      { name: "--primary", label: "Primária (ouro)", kind: "color" },
      { name: "--primary-foreground", label: "Texto sobre primária", kind: "color" },
      { name: "--ring", label: "Anel de foco", kind: "color" },
    ],
  },
  {
    id: "surface",
    label: "Superfícies",
    tokens: [
      { name: "--background", label: "Fundo", kind: "color" },
      { name: "--foreground", label: "Texto", kind: "color" },
      { name: "--card", label: "Cartão", kind: "color" },
      { name: "--muted", label: "Suave (fundo)", kind: "color" },
      { name: "--muted-foreground", label: "Suave (texto)", kind: "color" },
      { name: "--secondary", label: "Secundária", kind: "color" },
      { name: "--border", label: "Contorno", kind: "color" },
    ],
  },
  {
    id: "market",
    label: "Mercado",
    tokens: [
      { name: "--bull", label: "Sobe", kind: "color" },
      { name: "--bear", label: "Desce", kind: "color" },
    ],
  },
  {
    id: "shape",
    label: "Forma",
    tokens: [
      { name: "--radius", label: "Raio", kind: "length", min: 0, max: 2, step: 0.05, unit: "rem" },
    ],
  },
  {
    id: "type",
    label: "Tipografia",
    tokens: [
      { name: "--font-sans", label: "Fonte de UI", kind: "select", options: FONT_OPTIONS },
      { name: "--font-heading", label: "Fonte display", kind: "select", options: FONT_OPTIONS },
    ],
  },
  {
    id: "motion",
    label: "Movimento",
    tokens: [
      { name: "--dur-hover", label: "Hover", kind: "length", min: 0, max: 600, step: 10, unit: "ms" },
      { name: "--dur-base", label: "Base", kind: "length", min: 0, max: 900, step: 10, unit: "ms" },
      { name: "--dur-reveal", label: "Reveal", kind: "length", min: 0, max: 2000, step: 50, unit: "ms" },
    ],
  },
]

/**
 * Ajustes que não são custom properties — precisam de uma regra CSS injetada,
 * porque o alvo são utilitários do Tailwind espalhados pelo markup.
 */
export type TweakRule = {
  id: string
  label: string
  min: number
  max: number
  step: number
  unit: string
  /** Valor por omissão (o que a página já faz sem o painel). */
  fallback: number
  /** Gera o CSS a injetar. */
  css: (value: string) => string
}

export const TWEAK_RULES: TweakRule[] = [
  {
    id: "showcaseFade",
    label: "Suavidade entrada/saída",
    min: 0,
    max: 90,
    step: 5,
    unit: "vh",
    fallback: 40,
    /* Distância de scroll durante a qual o quadro aparece e desaparece.
       É DIFERENTE da paragem: este é "quão gradual", o outro é "quanto
       tempo fica quieto". A 0 o quadro surge de repente; a 90 materializa-se
       ao longo de quase um ecrã inteiro. */
    css: (v) => `:root{--showcase-fade:${v}}`,
  },
  {
    id: "showcaseHold",
    label: "Paragem do quadro",
    min: 0,
    max: 140,
    step: 5,
    unit: "vh",
    fallback: 55,
    /* Quanto tempo o quadro fica PARADO, depois de já ter aparecido. Não
       afeta a suavidade da entrada nem da saída — isso é o slider acima. */
    css: (v) => `:root{--showcase-hold:${v}}`,
  },
  {
    id: "container",
    label: "Largura do conteúdo",
    min: 640,
    max: 1600,
    step: 16,
    unit: "px",
    fallback: 1152, // max-w-6xl = 72rem
    css: (v) => `.max-w-6xl{max-width:${v} !important}`,
  },
  {
    id: "rootFont",
    label: "Escala de texto",
    min: 12,
    max: 22,
    step: 0.5,
    unit: "px",
    fallback: 16,
    css: (v) => `html{font-size:${v} !important}`,
  },
  {
    id: "sectionPad",
    label: "Ar entre secções",
    min: 0,
    max: 220,
    step: 4,
    unit: "px",
    fallback: 128, // py-32
    css: (v) =>
      `.py-24{padding-block:calc(${v} * 0.75) !important}` +
      `@media(min-width:768px){.md\\:py-32{padding-block:${v} !important}}`,
  },
]
