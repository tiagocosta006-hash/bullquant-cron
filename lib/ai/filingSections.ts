import * as cheerio from "cheerio";

/**
 * Extrai do relatório anual (10-K / 20-F) as secções que o Analista IA usa.
 *
 * ── Porque é que já não é uma janela fixa ─────────────────────────────────
 *
 * A versão anterior procurava a PRIMEIRA ocorrência de "Item 7. Management" e
 * mandava 160 mil caracteres a partir daí. Funcionava por acaso: quando essa
 * primeira ocorrência era a linha do índice, a janela apanhava o índice e
 * depois o Item 1 (Business) e o 1A (Risk Factors). Quando o índice estava
 * formatado de outra maneira — "Item 7.Management" sem espaço, como no da
 * Apple de 2026 — a primeira ocorrência já era o MD&A verdadeiro, e o modelo
 * nunca via o negócio nem os riscos. Resultado na Apple: "moat NONE" e zero
 * KPIs, duas gerações seguidas. Medido em 10 filings reais (2026-11-04): o
 * mesmo acontecia na NVIDIA, no JPMorgan e na Visa; nos 20-F sem cabeçalhos
 * "Item" (ASML) a janela caía nas demonstrações financeiras.
 *
 * Agora localizam-se as secções pelo cabeçalho: uma linha que COMEÇA por
 * "Item N". O índice também tem linhas assim, mas cada uma é seguida quase de
 * imediato pela seguinte; o cabeçalho verdadeiro é o que tem texto a sério até
 * ao próximo cabeçalho. Escolhe-se, para cada Item, a ocorrência com o maior
 * troço — o que descarta o índice e as remissões ("ver Item 7"), que ficam a
 * meio de um parágrafo e por isso nem chegam a ser linhas de cabeçalho.
 */

/** Todo o texto produzido aqui começa por isto — é o que distingue a cache nova da antiga. */
export const SECTION_MARKER = "=== ";

type SectionSpec = {
  /** Número do Item, como aparece no cabeçalho ("1", "1A", "7"…). */
  id: string;
  label: string;
  /** Máximo de caracteres desta secção. A última fica com o que sobrar. */
  cap: number;
  /**
   * Alguns 10-K (bancos, sobretudo) põem no Item 7 só uma remissão para o MD&A
   * que vem mais abaixo, no relatório anual anexo. Nesse caso procura-se o
   * título do MD&A como cabeçalho próprio.
   */
  titleFallback?: RegExp;
};

// Orçamentos pensados para a janela de 140 mil do relatório (REPORT_FILING_CHARS):
// 40k de negócio + 35k de riscos deixam ~65k de MD&A, onde vivem os KPIs.
const SECTION_PLANS: Record<string, SectionSpec[]> = {
  "10-K": [
    { id: "1", label: "ITEM 1. BUSINESS", cap: 40_000 },
    { id: "1A", label: "ITEM 1A. RISK FACTORS", cap: 35_000 },
    {
      id: "7",
      label: "ITEM 7. MANAGEMENT’S DISCUSSION AND ANALYSIS",
      cap: Infinity,
      titleFallback: /^management['’]s discussion and analysis\b/i,
    },
  ],
  "20-F": [
    { id: "4", label: "ITEM 4. INFORMATION ON THE COMPANY", cap: 40_000 },
    // O 3.D (Risk Factors) vive dentro do Item 3.
    { id: "3", label: "ITEM 3. KEY INFORMATION (RISK FACTORS)", cap: 35_000 },
    {
      id: "5",
      label: "ITEM 5. OPERATING AND FINANCIAL REVIEW",
      cap: Infinity,
      titleFallback: /^operating and financial review\b/i,
    },
  ],
};

// "Item 1.", "ITEM 1A.", "Item 1—Business", "PART I Item 1", "Items 1 and 2."
const HEADING = /^(?:PART\s+[IV]+\s*[,.:\-–—]?\s*)?ITEMS?\s+(\d{1,2}[A-D]?)(?=[\s.:\-–—]|$)/i;

// Um troço mais curto do que isto é uma linha de índice ou uma remissão, não uma secção.
const MIN_SECTION_CHARS = 1_500;
// Um título de secção é curto; uma frase que começa pelas mesmas palavras não é.
const MAX_TITLE_LINE = 120;

/**
 * HTML → uma linha por bloco (parágrafo, linha de tabela, div).
 *
 * O `$.text()` simples colava tudo numa linha só ("Item 1.Business1Item 1A."),
 * e sem quebras não há forma de distinguir um cabeçalho de uma remissão.
 */
export function filingHtmlToLines(html: string): string[] {
  const $ = cheerio.load(html);
  // O cabeçalho XBRL escondido (ix:header) vinha à cabeça do texto como lixo
  // ("asml-2025123100009379662025FYFALSE…").
  $("ix\\:header, script, style, head").remove();
  $('[style*="display:none"], [style*="display: none"]').remove();
  $("br").replaceWith("\n");
  $("td, th").append(" ");
  $("p, div, tr, li, h1, h2, h3, h4, h5, h6, table").append("\n");
  return $.root()
    .text()
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

type Range = { start: number; end: number };

function charsIn(lines: string[], { start, end }: Range): number {
  let n = 0;
  for (let i = start; i < end; i++) n += lines[i].length + 1;
  return n;
}

/** A ocorrência de um Item com o maior troço até ao cabeçalho seguinte. */
function findSection(
  lines: string[],
  heads: { line: number; id: string }[],
  id: string,
): Range | null {
  let best: Range | null = null;
  let bestLen = 0;
  for (let k = 0; k < heads.length; k++) {
    if (heads[k].id !== id) continue;
    const next = heads.slice(k + 1).find((n) => n.id !== id);
    const range = { start: heads[k].line, end: next ? next.line : lines.length };
    const len = charsIn(lines, range);
    if (len > bestLen) {
      best = range;
      bestLen = len;
    }
  }
  return bestLen >= MIN_SECTION_CHARS ? best : null;
}

/** Cabeçalho pelo título (ex.: o MD&A do relatório anual anexo), depois da última remissão do Item. */
function findByTitle(
  lines: string[],
  heads: { line: number; id: string }[],
  id: string,
  title: RegExp,
): Range | null {
  const lastRef = heads.filter((h) => h.id === id).pop();
  const from = lastRef ? lastRef.line + 1 : 0;
  for (let i = from; i < lines.length; i++) {
    if (lines[i].length <= MAX_TITLE_LINE && title.test(lines[i])) {
      return { start: i, end: lines.length };
    }
  }
  return null;
}

/**
 * Texto para o modelo: as secções encontradas, por ordem, cada uma com o seu
 * título. Sem secções reconhecíveis (20-F em formato de relatório anual, 40-F),
 * manda o início do documento — é aí que estão o negócio e a estratégia; a
 * versão anterior mandava o fim, que são as demonstrações financeiras, e os
 * números já vêm verificados da base de dados.
 */
export function extractAnnualSections(
  lines: string[],
  form: string,
  maxChars = 160_000,
): string {
  const plan = SECTION_PLANS[form] ?? (form.startsWith("10-K") ? SECTION_PLANS["10-K"] : null);
  const parts: string[] = [];

  if (plan) {
    const heads: { line: number; id: string }[] = [];
    lines.forEach((l, i) => {
      const m = l.match(HEADING);
      if (m) heads.push({ line: i, id: m[1].toUpperCase() });
    });

    const byHeading = plan.map((spec) => findSection(lines, heads, spec.id));
    // A procura pelo título só faz sentido num documento com estrutura de
    // Items. Num 20-F em formato de relatório anual (ASML), a única linha
    // "Operating and financial review" está no índice de remissões do fim.
    const hasItems = byHeading.some(Boolean);

    let left = maxChars;
    for (const [i, spec] of plan.entries()) {
      if (!hasItems || left <= 0) break;
      const range =
        byHeading[i] ??
        (spec.titleFallback ? findByTitle(lines, heads, spec.id, spec.titleFallback) : null);
      if (!range) continue;
      const text = lines.slice(range.start, range.end).join(" ").slice(0, Math.min(spec.cap, left));
      left -= text.length;
      parts.push(`${SECTION_MARKER}${spec.label} ===\n${text}`);
    }
  }

  if (parts.length === 0) {
    return `${SECTION_MARKER}RELATÓRIO ANUAL — INÍCIO (secções não identificadas) ===\n${lines.join(" ").slice(0, maxChars)}`;
  }
  return parts.join("\n\n");
}

/** A cache antiga (janela fixa) não tem marcador — tem de ser refeita. */
export function isSectionedText(text: string): boolean {
  return text.startsWith(SECTION_MARKER);
}
