import { generateObject } from "ai";
import { z } from "zod";
import { newsModel } from "./model";
import { NEWS_CATEGORIES, type StoryCluster } from "./types";

/** Nº máximo de clusters enviados numa única chamada de triagem. */
export const TRIAGE_BATCH_SIZE = 40;

/** Score mínimo para uma história merecer um artigo. */
export const RELEVANCE_THRESHOLD = 70;

/**
 * Score a partir do qual um artigo se publicaria sozinho.
 *
 * Acima de 100 de propósito — ou seja, **nada publica automaticamente**. Todos
 * os artigos nascem em DRAFT e só ficam visíveis depois de aprovados, pelo
 * botão no Discord ou em /{locale}/admin/news.
 *
 * É esta decisão que põe uma pessoa com responsabilidade editorial no circuito.
 * Ver docs/PIPELINES.md §6.9. Baixar isto para 80 repõe o auto-publish — e
 * retira a revisão humana do processo.
 */
export const AUTO_PUBLISH_THRESHOLD = 101;

const triageSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().describe("O índice da história, tal como dado no input"),
      relevanceScore: z
        .number()
        .int()
        .min(0)
        .max(100)
        .describe("0 = ruído irrelevante, 100 = movimenta os mercados agora"),
      category: z.enum(NEWS_CATEGORIES),
      tickers: z
        .array(z.string())
        .describe("Tickers cotados diretamente afetados, em maiúsculas. Vazio se nenhum."),
      reason: z.string().describe("Uma frase curta a justificar o score"),
    })
  ),
});

export interface TriageResult {
  cluster: StoryCluster;
  relevanceScore: number;
  category: (typeof NEWS_CATEGORIES)[number];
  tickers: string[];
  reason: string;
}

const TRIAGE_SYSTEM = `És o editor-chefe de uma plataforma portuguesa de análise fundamental de ações (Bull Value). Recebes um lote de manchetes financeiras internacionais e tens de decidir, para cada uma, se merece um artigo no terminal de notícias.

Pontua de 0 a 100 a relevância para um investidor particular informado:

90-100 — Move os mercados hoje: decisões de bancos centrais, dados de inflação/emprego acima do esperado, choques geopolíticos com impacto financeiro, colapsos ou resgates de instituições.
75-89  — Resultados trimestrais de grandes empresas com surpresa material, fusões e aquisições relevantes, guidance revisto, alterações regulatórias com impacto setorial, movimentos fortes em commodities ou cripto.
50-74  — Notícia corporativa real mas de impacto limitado ou já descontada pelo mercado.
0-49   — RUÍDO. Pontua sempre aqui: artigos de opinião e colunas, listas ("5 ações para..."), conteúdo promocional ou patrocinado, previsões de analistas isoladas, recapitulações do dia sem informação nova, desporto, lifestyle, celebridades, tecnologia de consumo sem ângulo financeiro, e qualquer manchete que seja pergunta retórica ou clickbait.

Sê exigente. É preferível deixar passar uma história do que publicar ruído. A maioria das manchetes deve ficar abaixo de 50.

O campo "tickers" só deve conter símbolos de empresas cotadas diretamente envolvidas (ex.: AAPL, MSFT) ou índices/ETF relevantes (ex.: SPY, QQQ). Nunca inventes tickers.`;

/**
 * Triagem em lote: uma única chamada de LLM para dezenas de histórias, em vez
 * de uma chamada por manchete. Devolve apenas as que passam o limiar.
 */
export async function triageClusters(clusters: StoryCluster[]): Promise<TriageResult[]> {
  if (clusters.length === 0) return [];

  const batch = clusters.slice(0, TRIAGE_BATCH_SIZE);

  const input = batch
    .map((c, i) => {
      const lines = [
        `[${i}] ${c.lead.title}`,
        `    fontes: ${c.sourceCount} (${[...new Set(c.items.map((it) => it.source))].join(", ")})`,
      ];
      if (c.lead.summary) lines.push(`    resumo: ${c.lead.summary.slice(0, 300)}`);
      if (c.matchedTickers.length > 0) {
        lines.push(`    empresas na nossa base: ${c.matchedTickers.join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const { object } = await generateObject({
    model: newsModel(),
    schema: triageSchema,
    system: TRIAGE_SYSTEM,
    prompt: `Avalia as ${batch.length} histórias seguintes. Devolve exatamente um resultado por índice.\n\n${input}`,
    temperature: 0.1,
  });

  const results: TriageResult[] = [];
  const seen = new Set<number>();

  for (const r of object.results) {
    const cluster = batch[r.index];
    if (!cluster || seen.has(r.index)) continue;
    seen.add(r.index);
    if (r.relevanceScore < RELEVANCE_THRESHOLD) continue;

    // Os tickers publicados vêm SÓ do LLM. O matching de `cluster.matchedTickers`
    // é heurístico e serve apenas para ordenar candidatos — propagá-lo para o
    // artigo publicaria falsos positivos ("price target" -> TGT).
    const tickers = [...new Set(r.tickers.map((t) => t.toUpperCase()))].filter((t) =>
      /^[A-Z][A-Z0-9.\-]{0,5}$/.test(t)
    );

    results.push({
      cluster,
      relevanceScore: r.relevanceScore,
      category: r.category,
      tickers,
      reason: r.reason,
    });
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
