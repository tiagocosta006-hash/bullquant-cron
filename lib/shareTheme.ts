/**
 * Paleta dos cartões de partilha (imagens exportadas).
 *
 * PORQUÊ HEX LITERAL E NÃO `var(--token)`:
 * o `html-to-image` clona o nó, serializa-o dentro de um `<foreignObject>` e
 * rasteriza esse SVG isolado. Nesse documento a cascata do `<html class="dark">`
 * JÁ NÃO EXISTE, e as cores que o Recharts escreve como *atributos* SVG
 * (`stroke="var(--border)"`) ficam por resolver → eixos/grelha invisíveis.
 * Por isso o cartão nunca depende de custom properties: resolve tudo para hex
 * antes de renderizar.
 *
 * Os valores espelham o bloco `.dark` de globals.css — o cartão é sempre
 * escuro, independentemente do tema em que o utilizador está. Se os tokens
 * dark mudarem lá, mudam aqui.
 */
export const SHARE_PALETTE = {
  bg: "#100f0d", // --night-bg
  surface: "#191815", // --night-surface
  surface2: "#201e1a", // --night-surface-2
  border: "#262420", // --night-border
  borderStrong: "#38352f", // --night-border-strong
  text: "#f2f1eb", // --night-text
  text2: "#a9a59b", // --night-text-2
  text3: "#7c786e", // --night-text-3
  gold: "#d6a64a", // --gold-matte-bright (acento dark)
  goldDeep: "#c28b1a", // fill do logo.svg
  bull: "#3dd07e", // --market-up-dark
  bear: "#ff5a4d", // --market-down-dark
} as const;

/** `var(--token)` → hex dark. Chaves = tokens usados nos configs de gráfico. */
const TOKEN_TO_HEX: Record<string, string> = {
  "var(--chart-1)": SHARE_PALETTE.gold,
  "var(--chart-2)": SHARE_PALETTE.bull,
  "var(--chart-3)": SHARE_PALETTE.bear,
  "var(--chart-4)": "#c17a3f",
  "var(--chart-5)": "#4d90d1",
  "var(--bull)": SHARE_PALETTE.bull,
  "var(--bear)": SHARE_PALETTE.bear,
  "var(--primary)": SHARE_PALETTE.gold,
  "var(--border)": SHARE_PALETTE.border,
  "var(--muted)": SHARE_PALETTE.surface2,
  "var(--muted-foreground)": SHARE_PALETTE.text2,
  "var(--foreground)": SHARE_PALETTE.text,
};

/**
 * Resolve uma cor de série para hex. Cores que já são hex/rgb passam
 * intactas (ex.: os `segmentColors` dos segmentos de receita).
 */
export function shareColor(color: string | undefined): string {
  if (!color) return SHARE_PALETTE.gold;
  return TOKEN_TO_HEX[color.trim()] ?? color;
}
