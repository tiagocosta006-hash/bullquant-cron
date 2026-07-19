import { tool } from "ai";
import { z } from "zod";
import type { Company, Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCompanyContext } from "@/lib/ai/context";
import { generateAndCacheReport } from "@/lib/ai/generateAnalystReport";
import { assertCreditsAvailable, chargeCredits } from "@/lib/ai/credits";

/**
 * Tool `comparePeer` — usada pelo chat do Analista para responder a "compara
 * com [peer]". Peers = mesma indústria (mesma definição que /compare usa).
 * Números vêm sempre da BD (grátis). O qualitativo usa o AnalystReport do
 * peer se já existir em cache; senão, gera+cacheia on-demand (Opção C) desde
 * que haja créditos — caso contrário devolve só os números com uma nota.
 */
export function createComparePeerTool(baseCompany: Company, userId: string, plan: Plan) {
  return tool({
    description:
      "Compara a empresa atual com um concorrente (peer) da mesma indústria. Devolve os financeiros verificados do peer e, quando disponível, o seu relatório qualitativo (moat, riscos, KPIs) para uma comparação fundamentada.",
    inputSchema: z.object({
      peerTicker: z
        .string()
        .describe('Ticker do peer/concorrente a comparar, ex: "BYDDY" ou "GM".'),
    }),
    execute: async ({ peerTicker }) => {
      const ticker = peerTicker.toUpperCase();

      const peer = await prisma.company.findFirst({
        where: {
          ticker,
          industry: baseCompany.industry,
          id: { not: baseCompany.id },
        },
      });

      if (!peer) {
        return {
          error: `${ticker} não foi encontrado como concorrente de ${baseCompany.name} na mesma indústria (${baseCompany.industry ?? "desconhecida"}).`,
        };
      }

      const context = await buildCompanyContext(peer);

      const cachedReport = await prisma.analystReport.findUnique({
        where: { companyId: peer.id },
      });

      let reportData = cachedReport && cachedReport.expiresAt > new Date() ? cachedReport.reportData : null;
      let note: string | null = null;

      if (!reportData) {
        const creditsError = await assertCreditsAvailable(userId, plan, "peer_report");
        if (creditsError) {
          note = "Sem créditos suficientes para gerar o relatório qualitativo deste peer agora — usa só os números.";
        } else {
          try {
            const generated = await generateAndCacheReport(peer);
            reportData = generated.report;
            await chargeCredits(userId, peer.ticker, "peer_report");
          } catch {
            note = "Não foi possível gerar o relatório qualitativo do peer neste momento — usa só os números.";
          }
        }
      }

      return {
        ticker: peer.ticker,
        name: peer.name,
        financials: context.text,
        qualitative: reportData,
        note,
      };
    },
  });
}

/**
 * Tools de anotação (sem trabalho assíncrono real) — o modelo chama-as para
 * marcar afirmações citáveis e próximas ações úteis na plataforma. O
 * frontend lê os seus resultados do stream de UI messages e renderiza
 * botões de citação + chips de ação por baixo da resposta.
 */
export const citeTool = tool({
  description:
    "Regista uma citação de fonte (10-K ou relatório do analista) como prova de uma afirmação factual. Chama isto para CADA facto verificável importante que referires.",
  inputSchema: z.object({
    label: z.string().describe('Nome curto do que está a ser citado, ex: "Vehicle Deliveries"'),
    quote: z.string().describe("A citação exata do texto fonte que prova a afirmação."),
  }),
  execute: async ({ label, quote }) => ({ label, quote }),
});

export const suggestActionTool = tool({
  description:
    'Sugere uma próxima ação útil na plataforma, relacionada com a resposta (ex: "Ver no DCF" → /dcf?ticker=X, "Comparar peers" → /compare?ticker=X).',
  inputSchema: z.object({
    label: z.string().describe('Texto curto do botão, ex: "Ver no DCF"'),
    href: z.string().describe('URL relativo dentro da plataforma, ex: "/dcf?ticker=TSLA"'),
  }),
  execute: async ({ label, href }) => ({ label, href }),
});
