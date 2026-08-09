/**
 * Rótulos PT-PT das categorias. Vivem aqui, e não em `components/news/shared.tsx`,
 * porque são usados também fora do React (mensagens do Discord).
 * O conteúdo do terminal é sempre em português, por isso não passam por i18n.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  MACRO: "Macro",
  EARNINGS: "Resultados",
  MA: "Fusões & Aquisições",
  CRYPTO: "Cripto",
  COMMODITIES: "Matérias-primas",
  POLICY: "Política & Regulação",
  COMPANY: "Empresas",
};
