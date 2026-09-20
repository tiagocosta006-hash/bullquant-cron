import { prisma } from "@/lib/prisma";

/**
 * Tecto GLOBAL de pedidos ao Gemini por dia.
 *
 * ── Porque é que os créditos por utilizador não chegam ────────────────────
 *
 * O `lib/ai/credits.ts` limita cada pessoa (FREE 5/dia, PRO 20/dia) e está
 * calibrado ao *custo* em tokens. Mas a quota do Gemini não é por utilizador
 * nem por custo: é do PROJECT inteiro, e conta PEDIDOS.
 *
 * Medido no AI Studio a 20 de Setembro de 2026, nível gratuito:
 *
 *     gemini-2.5-flash        RPM 5    TPM 250 000    RPD 20
 *     gemini-2.5-flash-lite   RPM 10   TPM 250 000    RPD 20
 *
 * Vinte pedidos por dia para a plataforma toda. Um único utilizador PRO com
 * 20 créditos chega para os esgotar sozinho, e nesse momento TODA a gente
 * apanha 429 — incluindo o cron de notícias. Os créditos por pessoa não
 * conseguem ver isso, porque cada um só conhece o seu próprio consumo.
 *
 * Daí este tecto: uma contagem global, verificada antes de cada geração.
 *
 * ── Como se conta ─────────────────────────────────────────────────────────
 *
 * Uma linha de `AIUsageLog` é exactamente um pedido ao Gemini: cada uma das
 * quatro rotas (brief, management, analyst_report, analyst_chat) faz um único
 * `generateObject`/`streamText` e escreve uma linha. Contar linhas é portanto
 * contar pedidos — não é uma estimativa.
 *
 * O cron de notícias NÃO escreve aqui (não tem utilizador). Tem o seu próprio
 * orçamento, imposto à cabeça pelo `MAX_ARTICLES` e pela frequência do cron,
 * e deve correr numa conta/modelo separados — ver `lib/news/model.ts`.
 */

/**
 * Pedidos/dia reservados às funcionalidades com utilizador à frente.
 *
 * Por omissão 20, que é o RPD do nível gratuito. Sobe-se isto quando se
 * activar faturação no Google AI Studio — sem tocar em código.
 */
export const RPD_UTILIZADORES = Number(process.env.GEMINI_RPD_UTILIZADORES ?? 20);

/**
 * Margem de segurança: paramos um pouco antes do tecto real.
 *
 * O contador vive na nossa base e o do Google vive no Google. Entre os dois há
 * as tentativas que falharam a meio (o pedido chegou a sair, a linha nunca foi
 * escrita) e as corridas concorrentes. Chegar ao número exacto seria confiar
 * numa sincronia que não existe.
 */
export const RESERVA = Number(process.env.GEMINI_RPD_RESERVA ?? 2);

export type OrcamentoGlobal = {
  usados: number;
  tecto: number;
  restantes: number;
};

function inicioDeHoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Quantos pedidos ao Gemini já saíram hoje, somando todos os utilizadores. */
export async function orcamentoGlobal(): Promise<OrcamentoGlobal> {
  const usados = await prisma.aIUsageLog.count({
    where: { usedAt: { gte: inicioDeHoje() } },
  });
  const tecto = Math.max(0, RPD_UTILIZADORES - RESERVA);
  return { usados, tecto, restantes: Math.max(0, tecto - usados) };
}

/**
 * Há orçamento global para mais um pedido?
 *
 * Devolve `null` para prosseguir, ou o corpo de um 429 pronto a devolver. A
 * mensagem distingue-se de propósito da do limite pessoal: aqui o utilizador
 * não fez nada de mais, e dizer-lhe "gastaste os teus créditos" seria mentira.
 */
export async function assertOrcamentoGlobal(
  custo = 1,
): Promise<{ error: string; message: string; orcamento: OrcamentoGlobal } | null> {
  const orcamento = await orcamentoGlobal();
  if (orcamento.restantes < custo) {
    return {
      error: "global_rate_limit",
      message:
        "A plataforma atingiu o limite diário de pedidos de IA. Volta a tentar amanhã.",
      orcamento,
    };
  }
  return null;
}
