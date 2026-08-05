import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/crypto"
import { fetchTrading212AccountSummary, Trading212ApiError } from "@/lib/broker/trading212"
import { calculatePortfolioReturn, type BrokerMovement } from "@/lib/finance/xirr"

/**
 * Retorno anualizado (XIRR) da conta de corretora ligada.
 *
 * Os movimentos vêm da BD (importados por
 * POST /api/broker/trading212/cashflows), o valor atual vem em direto da
 * corretora — é o único pedido externo aqui, e tem rate limit folgado
 * (1 req / 5s), ao contrário do histórico.
 *
 * Nota de âmbito: isto mede a conta **inteira** na corretora, não só as
 * posições que a BullQuant consegue mapear. O sync de posições ignora tudo o
 * que esteja fora da cobertura S&P 500 (`status: "unsupported"`), mas os
 * depósitos e o valor total da conta incluem essas posições — o que torna
 * este número mais fiel ao retorno real do utilizador, não menos.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const connection = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId: user.id, broker: "TRADING212" } },
  })
  if (!connection) {
    // Não é um erro: a maioria dos utilizadores não tem corretora ligada.
    // A UI usa isto para sugerir a ligação em vez de mostrar uma falha.
    return NextResponse.json({ connected: false }, { status: 200 })
  }

  const movements = await prisma.brokerCashFlow.findMany({
    where: { userId: user.id, broker: "TRADING212" },
    orderBy: { occurredAt: "asc" },
    select: { type: true, amount: true, currency: true, occurredAt: true },
  })

  if (movements.length === 0) {
    return NextResponse.json({
      connected: true,
      needsSync: true,
      backfillDone: connection.cashFlowBackfillDone,
    })
  }

  try {
    const apiKey = decryptSecret(connection.encryptedApiKey)
    const apiSecret = decryptSecret(connection.encryptedApiSecret)
    const summary = await fetchTrading212AccountSummary(apiKey, apiSecret)

    const parsed: BrokerMovement[] = movements.map(m => ({
      type: m.type,
      amount: Number(m.amount), // Decimal do Prisma → number para o cálculo
      date: m.occurredAt,
    }))

    const result = calculatePortfolioReturn(parsed, summary.totalValue, new Date())

    // Movimentos numa moeda diferente da conta entram sem conversão cambial —
    // não temos taxas históricas. Sinalizamos para a UI poder avisar em vez de
    // apresentar o número como exato.
    const foreignCurrency = movements.filter(
      m => m.currency && m.currency !== summary.currency,
    ).length

    return NextResponse.json({
      connected: true,
      needsSync: false,
      backfillDone: connection.cashFlowBackfillDone,
      currency: summary.currency,
      xirr: result.xirr,
      totalDeposited: result.totalDeposited,
      totalWithdrawn: result.totalWithdrawn,
      currentValue: result.currentValue,
      absoluteGain: result.absoluteGain,
      totalReturn: result.totalReturn,
      foreignCurrencyCount: foreignCurrency,
      cashFlows: result.cashFlows.map(f => ({
        date: f.date.toISOString(),
        amount: f.amount,
      })),
      syncedAt: connection.cashFlowsSyncedAt?.toISOString() ?? null,
    })
  } catch (error) {
    const message = error instanceof Trading212ApiError
      ? error.message
      : "Failed to fetch account value from Trading212"
    console.error("Error computing portfolio XIRR:", error)
    const status = error instanceof Trading212ApiError && error.status === 429 ? 429 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
