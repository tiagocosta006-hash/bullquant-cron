/**
 * Constrói um Chrome/Edge Text Fragment (#:~:text=...) robusto a partir de uma
 * citação, para saltar diretamente para a frase exata dentro do 10-K da SEC.
 *
 * Extraído de StockKPIs.tsx (handleOpenSec) para ser partilhado pelo Analista IA.
 * Sintaxe: #:~:text=[prefix-,]textStart[,textEnd][,-suffix]
 */
export function buildTextFragmentUrl(baseUrl: string, quote: string): string {
  const cleanQuote = quote.replace(/[\n\r]+/g, " ").trim();
  if (!cleanQuote) return baseUrl;

  const words = cleanQuote.split(" ").filter((w) => w.length > 0);

  let textFragment = "";
  const numberWords = words.filter((w) => /\d/.test(w)).length;
  // Linhas de tabela (muitos números / poucas palavras) partem os matches
  // exatos porque atravessam blocos <td>; usar 1 palavra no início e 1 no fim.
  const isTableRow = numberWords / words.length > 0.3 || words.length < 8;

  if (words.length <= 1) {
    textFragment = `#:~:text=${encodeURIComponent(cleanQuote)}`;
  } else if (isTableRow) {
    textFragment = `#:~:text=${encodeURIComponent(words[0])},${encodeURIComponent(
      words[words.length - 1],
    )}`;
  } else {
    // Parágrafos de linguagem natural: 3 palavras no início e 3 no fim
    // garantem unicidade sem apanhar o parágrafo errado.
    const start = words.slice(0, 3).join(" ");
    const end = words.slice(-3).join(" ");
    textFragment = `#:~:text=${encodeURIComponent(start)},${encodeURIComponent(end)}`;
  }

  return baseUrl + textFragment;
}
