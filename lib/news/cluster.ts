import type { RawNewsItem, StoryCluster } from "./types";
import { jaccard, titleTokens } from "./normalize";

/** Acima deste Jaccard sobre tokens significativos, dois títulos são a mesma história. */
export const SIMILARITY_THRESHOLD = 0.35;

/**
 * Agrupa itens pela história que descrevem, sem gastar uma única chamada de
 * LLM. Clustering aglomerativo simples (single-link): para cada item, procura
 * o cluster existente mais parecido; se nenhum passar o limiar, abre um novo.
 *
 * O que interessa a jusante é o `sourceCount`: uma história coberta por várias
 * fontes distintas na mesma janela é o sinal mais barato e mais fiável de que
 * "está a bombar".
 */
export function clusterItems(items: RawNewsItem[]): StoryCluster[] {
  const tokenCache = new Map<string, Set<string>>();
  const tokensOf = (item: RawNewsItem) => {
    let tokens = tokenCache.get(item.dedupKey);
    if (!tokens) {
      tokens = titleTokens(item.title);
      tokenCache.set(item.dedupKey, tokens);
    }
    return tokens;
  };

  const groups: RawNewsItem[][] = [];

  for (const item of items) {
    const tokens = tokensOf(item);
    if (tokens.size === 0) continue;

    let bestGroup: RawNewsItem[] | null = null;
    let bestScore = SIMILARITY_THRESHOLD;

    for (const group of groups) {
      // single-link: basta parecer-se com um membro do grupo
      let score = 0;
      for (const member of group) {
        score = Math.max(score, jaccard(tokens, tokensOf(member)));
        if (score >= 0.9) break;
      }
      if (score >= bestScore) {
        bestScore = score;
        bestGroup = group;
      }
    }

    if (bestGroup) bestGroup.push(item);
    else groups.push([item]);
  }

  return groups.map(toCluster);
}

function toCluster(group: RawNewsItem[]): StoryCluster {
  const sources = new Set(group.map((i) => i.source));
  // Líder = o item com mais informação; empate resolvido pelo mais recente.
  const lead = [...group].sort((a, b) => {
    const scoreA = (a.summary?.length ?? 0) + (a.imageUrl ? 200 : 0);
    const scoreB = (b.summary?.length ?? 0) + (b.imageUrl ? 200 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  })[0];

  return {
    lead,
    items: group,
    sourceCount: sources.size,
    matchedTickers: [],
  };
}

/**
 * Nomes de empresa que colidem com vocabulário financeiro corrente. Sem esta
 * lista, "price target" dava TGT, "GOP ballot" dava BALL e "Francisco" dava
 * CSCO. O matching por nome é ignorado para estes — só o ticker explícito vale.
 */
const AMBIGUOUS_NAMES = new Set([
  "target", "ball", "block", "gap", "key", "now", "match", "loop", "wave",
  "open", "core", "pool", "sun", "shell", "cross", "post", "range", "peak",
  "summit", "vision", "capital", "global", "united", "first", "general",
  "national", "american", "international", "energy", "power", "future",
]);

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Marca os clusters com os tickers da nossa base que aparecem no título ou no
 * resumo. Serve para ORDENAR os candidatos antes da triagem — não é a fonte
 * de verdade dos tickers publicados (isso é o LLM, ver triage.ts).
 */
export function matchTickers(
  clusters: StoryCluster[],
  companies: Array<{ ticker: string; name: string }>
): StoryCluster[] {
  // Nome curto: "Apple Inc." -> "apple". Remove sufixos legais que não ajudam.
  const entries = companies.map((c) => {
    const needle = c.name
      .toLowerCase()
      .replace(
        /\b(inc|corp|corporation|company|co|plc|ltd|limited|sa|nv|ag|holdings?|group|the|class [a-c])\b\.?/g,
        " "
      )
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Nome completo ("cisco systems") e forma curta ("cisco"), porque as
    // manchetes raramente escrevem a razão social por extenso. A forma curta
    // só é aceite se for distintiva — é o que impede "Ball Corporation" de
    // casar com "ballot" e "Target Corporation" com "price target".
    const primeiro = needle.split(" ")[0];
    const needles = [needle, primeiro].filter(
      (n, i, arr) => n.length >= 5 && !AMBIGUOUS_NAMES.has(n) && arr.indexOf(n) === i
    );

    return { ticker: c.ticker.toUpperCase(), needles };
  });

  for (const cluster of clusters) {
    const haystack = cluster.items.map((i) => `${i.title} ${i.summary ?? ""}`).join(" ");
    const lower = haystack.toLowerCase();
    const found = new Set<string>();

    for (const { ticker, needles } of entries) {
      if (matchesTicker(haystack, ticker)) {
        found.add(ticker);
        continue;
      }
      // Fronteira de palavra: "ball" não pode casar dentro de "ballot".
      if (needles.some((n) => new RegExp(`\\b${escapeRegex(n)}\\b`).test(lower))) {
        found.add(ticker);
      }
    }

    cluster.matchedTickers = [...found];
  }

  return clusters;
}

/**
 * Um ticker só conta se aparecer como símbolo, não como palavra. Tickers de
 * 1-2 letras (T, F, C, GM) exigem a forma explícita `(T)` ou `$T`, senão
 * qualquer inicial solta na manchete daria um falso positivo.
 */
function matchesTicker(haystack: string, ticker: string): boolean {
  const t = escapeRegex(ticker);
  if (new RegExp(`[($]${t}[)\\s.,:]`).test(haystack)) return true;
  if (ticker.length <= 2) return false;
  // 3+ letras: aceita o símbolo isolado, desde que rodeado por não-letras.
  return new RegExp(`(^|[^A-Za-z0-9])${t}([^A-Za-z0-9]|$)`).test(haystack);
}

/**
 * Score composto dos sinais baratos, para decidir quais os clusters que valem
 * uma chamada de triagem ao LLM.
 *
 * Composto e não lexicográfico de propósito: em fins de semana e fora de horas
 * quase nada tem cobertura multi-fonte, e uma ordenação estrita por
 * `sourceCount` degeneraria em "ordenar por recência" — o que deixaria de fora
 * histórias com empresas nossas.
 */
export function clusterScore(cluster: StoryCluster): number {
  // Cobertura multi-fonte é o sinal mais forte, mas satura: 5 fontes não são
  // 5x melhores do que 1.
  const cobertura = Math.log2(cluster.sourceCount + 1) * 40;
  const tickers = Math.min(cluster.matchedTickers.length, 3) * 8;
  const horas = (Date.now() - cluster.lead.publishedAt.getTime()) / 3600_000;
  const recencia = Math.max(0, 20 - horas * 3);
  const temResumo = cluster.lead.summary ? 5 : 0;
  return cobertura + tickers + recencia + temResumo;
}

/** Ordena os clusters do mais ao menos promissor, por `clusterScore`. */
export function rankClusters(clusters: StoryCluster[]): StoryCluster[] {
  return [...clusters].sort((a, b) => clusterScore(b) - clusterScore(a));
}
