import { prisma } from "@/lib/prisma";
import { generateObject } from "ai";
import { z } from "zod";
import type { Company } from "@prisma/client";
import { geminiModel, GEMINI_MODEL_NAME } from "@/lib/ai/gemini";
import { buildCompanyContext } from "@/lib/ai/context";
import { getFilingForCompany } from "@/lib/ai/sec";

// Janela do 10-K enviada ao modelo — cortada para manter a geração < ~50s
// (o texto completo de um 10-K grande fazia o Gemini demorar >100s → timeout).
const REPORT_FILING_CHARS = 140_000;

// Schema do relatório do Analista — grounded em BD (números) + 10-K (citações).
export const reportSchema = z.object({
  executiveSummary: z
    .string()
    .describe("2-3 frases (pt-PT): a tese e como a empresa ganha dinheiro."),
  businessModel: z
    .string()
    .describe("1 parágrafo (pt-PT): modelo de negócio e principais fontes de receita."),
  moat: z.object({
    rating: z.enum(["WIDE", "NARROW", "NONE"]).describe("Largura do fosso competitivo."),
    text: z.string().describe("1 parágrafo (pt-PT) sobre a vantagem competitiva."),
    quote: z.string().nullable().describe("Citação EXATA do 10-K que suporta, ou null."),
  }),
  segmentsSummary: z
    .string()
    .nullable()
    .describe("Narrativa curta (pt-PT) sobre o mix de segmentos e a sua evolução, ou null."),
  operatingKpis: z
    .array(
      z.object({
        name: z
          .string()
          .describe("KPI operacional específico (NÃO GAAP), ex: 'Vehicle Deliveries (Units)'"),
        value: z.string().describe("Valor mais recente formatado, ex: '1.8M'"),
        quote: z
          .string()
          .describe("Citação EXATA do 10-K que prova o número (frase natural, não linha de tabela)."),
        insight: z.string().describe("1 frase (pt-PT) de contexto sobre a tendência."),
      }),
    )
    .describe("3-8 KPIs operacionais não-GAAP. Array vazio se não houver."),
  risks: z
    .array(
      z.object({
        title: z.string().describe("pt-PT"),
        detail: z.string().describe("pt-PT"),
        quote: z.string().nullable().describe("Citação do 10-K (Item 1A), ou null."),
      }),
    )
    .describe("3-5 riscos principais, do Item 1A do 10-K."),
  bull: z.array(z.string()).describe("3-4 pontos do caso otimista (pt-PT)."),
  bear: z.array(z.string()).describe("3-4 pontos do caso pessimista (pt-PT)."),
});

export type AnalystReportData = z.infer<typeof reportSchema>;

const SYSTEM_PROMPT = `És um analista de equity research sénior que cobre EXCLUSIVAMENTE esta empresa. Escreves em português europeu estrito (pt-PT, evita brasileirismos), conciso e crítico, para um investidor de retail focado em value investing.

REGRAS DE ZERO ALUCINAÇÃO (tolerância zero):
1. NÚMEROS FINANCEIROS: usa APENAS os do bloco "FINANCEIROS ANUAIS VERIFICADOS". Nunca os alteres nem inventes.
2. QUALITATIVO (moat, riscos, modelo de negócio, KPIs): baseia-te APENAS no texto do relatório anual (10-K/20-F) fornecido. Para cada afirmação factual chave, fornece a citação EXATA ("quote") do texto que a prova.
3. KPIs OPERACIONAIS: extrai só métricas NÃO-GAAP específicas do negócio (ex: entregas, utilizadores ativos, same-store sales, GWh, subscritores). NUNCA extraias métricas GAAP genéricas (Net Income, EBITDA, Gross Margin, CapEx) como KPIs.
4. CITAÇÕES: quando o número está numa tabela, cita a FRASE natural adjacente, não a linha de tabela.
5. Se não encontrares algo, deixa null ou array vazio — nunca inventes para preencher.`;

export type GeneratedReport = {
  report: AnalystReportData;
  secUrl: string | null;
  filingLabel: string | null;
  generatedAt: Date;
};

/**
 * Gera o relatório do Analista (contexto BD + 10-K + Gemini) e cacheia em
 * `AnalystReport` (TTL 14 dias). Partilhado entre a rota principal do
 * relatório e a tool `comparePeer` do chat — quem chama é responsável por
 * verificar/cobrar créditos antes de invocar isto (ações diferentes têm
 * custos diferentes: `analyst_report` vs `peer_report`).
 */
export async function generateAndCacheReport(company: Company): Promise<GeneratedReport> {
  const [context, filing] = await Promise.all([
    buildCompanyContext(company),
    getFilingForCompany(company),
  ]);

  const prompt = filing
    ? `${context.text}\n\n=== TEXTO DO ÚLTIMO RELATÓRIO ANUAL (${filing.label}) ===\n${filing.text.slice(0, REPORT_FILING_CHARS)}`
    : `${context.text}\n\n(Não há relatório anual disponível na SEC para esta empresa — baseia o qualitativo apenas nos números verificados acima e deixa as citações a null.)`;

  const { object } = await generateObject({
    model: geminiModel(),
    schema: reportSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  const generatedAt = new Date();

  await prisma.analystReport.upsert({
    where: { companyId: company.id },
    update: {
      reportData: object,
      secUrl: filing?.url ?? null,
      filingLabel: filing?.label ?? null,
      modelVersion: GEMINI_MODEL_NAME,
      generatedAt,
      expiresAt,
    },
    create: {
      companyId: company.id,
      reportData: object,
      secUrl: filing?.url ?? null,
      filingLabel: filing?.label ?? null,
      modelVersion: GEMINI_MODEL_NAME,
      expiresAt,
    },
  });

  return { report: object, secUrl: filing?.url ?? null, filingLabel: filing?.label ?? null, generatedAt };
}
