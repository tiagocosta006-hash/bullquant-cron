import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";
import { assertOrcamentoGlobal } from "@/lib/ai/orcamento";

// Preço em créditos por ação, calibrado ao custo real da API Gemini 2.5 Flash
// ($0.30/M tokens input, $2.50/M output) — 1 crédito ≈ $0.006. Ver plano em
// .claude/plans para o cálculo completo. Ajustável sem tocar nas rotas.
export const AI_ACTION_COSTS = {
  brief: 1,
  management: 1,
  analyst_report: 3,
  analyst_chat: 4,
  peer_report: 3,
  kpi_extraction: 12,
} as const;

export type AiAction = keyof typeof AI_ACTION_COSTS;

/**
 * Créditos por dia, por plano.
 *
 * ── Porque é que desceram de 5/20 para 3/8 ────────────────────────────────
 *
 * Os números antigos foram escolhidos a pensar no *custo* das chamadas. O que
 * os limita na prática é outra coisa: o nível gratuito do Gemini dá 20 PEDIDOS
 * por dia ao project inteiro (medido no AI Studio a 2026-09-20). Com PRO a 20
 * créditos, um único utilizador a gerar briefs — que custam 1 crédito e 1
 * pedido cada — esgotava sozinho o orçamento de toda a gente.
 *
 * Prometer 20 e entregar 429 é pior do que prometer 8 e cumprir.
 *
 * O tecto real de pedidos por pessoa é o pior caso, tudo gasto na ação mais
 * barata: 3 pedidos no FREE, 8 no PRO. Três PRO no limite ocupam os 18
 * utilizáveis (20 menos a reserva) — a partir daí o `lib/ai/orcamento.ts`
 * trava com uma mensagem honesta em vez de um erro do Google.
 *
 * O FREE fica em 3 e não em 2 de propósito: `analyst_report` custa 3, e a
 * página de preços promete uma análise completa por dia ao plano gratuito.
 * Descer a 2 quebrava essa promessa em vez de a ajustar.
 *
 * Ambos se sobrepõem por variável de ambiente — no dia em que houver
 * faturação no Google AI Studio, isto sobe sem tocar em código.
 */
export const PLAN_DAILY_CREDITS: Record<Plan, number> = {
  FREE: Number(process.env.AI_CREDITOS_FREE ?? 3),
  PRO: Number(process.env.AI_CREDITOS_PRO ?? 8),
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type CreditsStatus = { used: number; limit: number; remaining: number };

/** Créditos gastos hoje vs o limite do plano. Servir da cache nunca chama isto. */
export async function getCreditsStatus(userId: string, plan: Plan): Promise<CreditsStatus> {
  const limit = PLAN_DAILY_CREDITS[plan];
  const agg = await prisma.aIUsageLog.aggregate({
    where: { userId, usedAt: { gte: startOfToday() } },
    _sum: { credits: true },
  });
  const used = agg._sum.credits ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Verifica se há créditos para a ação ANTES de gerar. Devolve null se pode
 * prosseguir, ou um objeto de erro 429-shaped pronto a devolver ao cliente.
 *
 * São DOIS tectos, e passam-se os dois:
 *
 *  1. o do próprio utilizador, em créditos — pesa o custo em tokens de cada
 *     ação (um chat do analista custa quatro vezes um brief);
 *  2. o da plataforma inteira, em PEDIDOS — a quota do Gemini é do project,
 *     não da pessoa, e no nível gratuito são 20 por dia para toda a gente.
 *
 * O global vem primeiro de propósito: se a plataforma já não tem orçamento,
 * não interessa quantos créditos a pessoa ainda tinha, e é mais honesto
 * dizer-lhe isso do que deixá-la gastar um crédito num pedido que vai apanhar
 * 429 do lado do Google.
 */
export async function assertCreditsAvailable(
  userId: string,
  plan: Plan,
  action: AiAction,
): Promise<{ error: string; message: string; status: CreditsStatus } | null> {
  const status = await getCreditsStatus(userId, plan);

  const global = await assertOrcamentoGlobal();
  if (global) {
    return { error: global.error, message: global.message, status };
  }

  const cost = AI_ACTION_COSTS[action];
  if (status.remaining < cost) {
    return {
      error: "rate_limit",
      message: "Limite diário de créditos de IA atingido. Tenta novamente amanhã.",
      status,
    };
  }
  return null;
}

/** Regista o consumo — só chamar depois de a geração real ter começado/sucedido. */
export async function chargeCredits(userId: string, ticker: string, action: AiAction) {
  await prisma.aIUsageLog.create({
    data: { userId, ticker, action, credits: AI_ACTION_COSTS[action] },
  });
}
