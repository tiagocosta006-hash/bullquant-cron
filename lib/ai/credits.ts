import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";

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

export const PLAN_DAILY_CREDITS: Record<Plan, number> = {
  FREE: 5,
  PRO: 20,
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
 */
export async function assertCreditsAvailable(
  userId: string,
  plan: Plan,
  action: AiAction,
): Promise<{ error: string; message: string; status: CreditsStatus } | null> {
  const cost = AI_ACTION_COSTS[action];
  const status = await getCreditsStatus(userId, plan);
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
