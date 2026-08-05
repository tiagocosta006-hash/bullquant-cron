import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/crypto"
import { fetchTrading212Transactions, Trading212ApiError } from "@/lib/broker/trading212"

/**
 * Importa o histórico de movimentos de caixa (depósitos/levantamentos) da
 * Trading212 para a BD, de onde o XIRR é calculado em /api/portfolio/xirr.
 *
 * Uma chamada = um *burst* de até 6 páginas (300 movimentos). Contas com mais
 * histórico precisam de várias chamadas: a resposta traz `backfillDone: false`
 * e o cliente volta a chamar. O cursor fica guardado em `BrokerConnection`,
 * por isso cada chamada continua de onde a anterior parou em vez de recomeçar.
 *
 * Idempotente: a deduplicação é feita pelo `reference` do movimento
 * (unique em `[userId, broker, reference]`), logo repetir uma chamada ou
 * apanhar páginas sobrepostas não duplica nada.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const connection = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId: user.id, broker: "TRADING212" } },
  })
  if (!connection) {
    return NextResponse.json({ error: "No Trading212 connection found" }, { status: 404 })
  }

  try {
    const apiKey = decryptSecret(connection.encryptedApiKey)
    const apiSecret = decryptSecret(connection.encryptedApiSecret)

    const incremental = connection.cashFlowBackfillDone
    let imported = 0

    // Inserimos página a página (em vez de tudo no fim) por duas razões: no
    // backfill, uma falha a meio não perde o que já foi lido; no incremental,
    // é o nº de linhas novas por página que nos diz quando parar.
    const persistPage = async (pageTransactions: typeof transactions) => {
      if (pageTransactions.length === 0) return 0
      const created = await prisma.brokerCashFlow.createMany({
        data: pageTransactions.map(tx => ({
          userId: user.id,
          broker: "TRADING212" as const,
          reference: tx.reference,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          occurredAt: tx.dateTime,
        })),
        skipDuplicates: true,
      })
      imported += created.count
      return created.count
    }

    const { transactions, nextPath } = await fetchTrading212Transactions(apiKey, apiSecret, {
      // Backfill a meio → retoma do cursor guardado. Incremental → começa do topo.
      startPath: incremental ? undefined : connection.cashFlowCursor ?? undefined,
      onPage: async page => {
        const newRows = await persistPage(page)
        // No incremental, a paginação vem do mais recente para o mais antigo:
        // uma página sem nenhuma linha nova significa que já temos tudo o que
        // vem a seguir. Parar aqui poupa o rate limit para as outras chamadas.
        if (incremental && newRows === 0) return false
        return true
      },
    })

    // `transactions` já foi persistido pelo onPage; usamos o total só para o log.
    const backfillDone = nextPath === null
    await prisma.brokerConnection.update({
      where: { userId_broker: { userId: user.id, broker: "TRADING212" } },
      data: {
        cashFlowCursor: nextPath,
        // Uma vez concluído, nunca volta a false: as sincronizações seguintes
        // são incrementais e não têm de reler o histórico todo.
        cashFlowBackfillDone: connection.cashFlowBackfillDone || backfillDone,
        cashFlowsSyncedAt: new Date(),
        lastSyncError: null,
      },
    })

    return NextResponse.json({
      fetched: transactions.length,
      imported,
      backfillDone: connection.cashFlowBackfillDone || backfillDone,
    })
  } catch (error) {
    const message = error instanceof Trading212ApiError
      ? error.message
      : "Failed to sync Trading212 cash flows"

    await prisma.brokerConnection.update({
      where: { userId_broker: { userId: user.id, broker: "TRADING212" } },
      data: { lastSyncError: message },
    })

    console.error("Error syncing Trading212 cash flows:", error)
    const status = error instanceof Trading212ApiError && error.status === 429 ? 429 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
