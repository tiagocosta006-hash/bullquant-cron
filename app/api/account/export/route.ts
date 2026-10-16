import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getUser } from "@/lib/supabase/server"

/**
 * GET /api/account/export — portabilidade (RGPD art. 20.º): tudo o que o utilizador criou, em JSON.
 * Só autenticação (não exige PRO: é um direito, não uma funcionalidade). Nunca inclui segredos:
 * as chaves de corretor guardadas cifradas ficam de fora (só se diz que existe ligação e quando sincronizou).
 */
export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })

  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, email: true, name: true, plan: true, createdAt: true,
      portfolio: { select: { name: true, createdAt: true, items: { select: { quantity: true, avgBuyPrice: true, buyDate: true, broker: true, currency: true, fees: true, notes: true, addedAt: true, company: { select: { ticker: true, name: true } } } } } },
      watchlistItems: { select: { addedAt: true, company: { select: { ticker: true, name: true } } } },
      watchlists: { select: { name: true, createdAt: true, entries: { select: { addedAt: true, company: { select: { ticker: true, name: true } } } } } },
      dcfAnalyses: { select: { label: true, notes: true, fcfMode: true, fcf0: true, growthStage1: true, growthStage2: true, wacc: true, terminalGrowth: true, shares: true, netDebt: true, fairValue: true, priceAtSave: true, marginOfSafety: true, isPublic: true, createdAt: true, company: { select: { ticker: true } } } },
      dcfModelos: { select: { versao: true, titulo: true, tese: true, cenarioAtivo: true, conjunto: true, valorPorAcao: true, valorEsperado: true, precoAoGuardar: true, createdAt: true, company: { select: { ticker: true } } } },
      brokerConnections: { select: { broker: true, lastSyncedAt: true, createdAt: true } },
      aiUsageLogs: { select: { ticker: true, action: true, credits: true, usedAt: true }, orderBy: { usedAt: "desc" }, take: 5000 },
    },
  })
  if (!u) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } })

  const corpo = { exportadoEm: new Date().toISOString(), formato: "bullvalue-export-v1", ...u }
  const ficheiro = `bullvalue-dados-${new Date().toISOString().slice(0, 10)}.json`
  return new NextResponse(JSON.stringify(corpo, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ficheiro}"`,
      "Cache-Control": "no-store",
    },
  })
}
