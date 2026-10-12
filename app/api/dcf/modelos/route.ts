import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { exigirPro } from "@/lib/api/acessoPro"
import { normalizarTicker } from "@/lib/ticker"
import { guardarSchema } from "@/lib/finance/modelo/validar"

/**
 * Modelos DCF avançados guardados (com versões e tese).
 *
 * GET  /api/dcf/modelos?ticker=MSCI → versões do utilizador para essa empresa
 *      (sem o conjunto: a lista é leve; o modelo inteiro vem de /[id]).
 * POST /api/dcf/modelos             → grava uma NOVA versão (nunca reescreve).
 */

const SEM_CACHE = { "Cache-Control": "no-store" }
const dec = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10_000) / 10_000 : null)
const numero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

export async function GET(req: NextRequest) {
  const ticker = normalizarTicker(req.nextUrl.searchParams.get("ticker") ?? "")
  if (!ticker) return NextResponse.json({ error: "Ticker inválido" }, { status: 400, headers: SEM_CACHE })
  const acesso = await exigirPro({ ticker })
  if (!acesso.ok) return acesso.resposta
  if (!acesso.userId) return NextResponse.json({ error: "Autenticação necessária" }, { status: 401, headers: SEM_CACHE })

  const company = await prisma.company.findUnique({ where: { ticker }, select: { id: true } })
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404, headers: SEM_CACHE })

  const linhas = await prisma.dcfModelo.findMany({
    where: { userId: acesso.userId, companyId: company.id },
    orderBy: { versao: "desc" },
    take: 50,
    select: { id: true, versao: true, titulo: true, tese: true, cenarioAtivo: true, valorPorAcao: true, valorEsperado: true, precoAoGuardar: true, createdAt: true },
  })
  return NextResponse.json(
    {
      versoes: linhas.map((l) => ({
        id: l.id, versao: l.versao, titulo: l.titulo, tese: l.tese?.slice(0, 200) ?? null, cenarioAtivo: l.cenarioAtivo,
        valorPorAcao: numero(l.valorPorAcao), valorEsperado: numero(l.valorEsperado), precoAoGuardar: numero(l.precoAoGuardar),
        createdAt: l.createdAt.toISOString(),
      })),
    },
    { headers: SEM_CACHE },
  )
}

export async function POST(req: NextRequest) {
  let corpo: unknown
  try { corpo = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: SEM_CACHE }) }
  const r = guardarSchema.safeParse(corpo)
  if (!r.success) {
    return NextResponse.json({ error: "Modelo inválido", detalhe: r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400, headers: SEM_CACHE })
  }
  const d = r.data
  const ticker = normalizarTicker(d.ticker)
  if (!ticker) return NextResponse.json({ error: "Ticker inválido" }, { status: 400, headers: SEM_CACHE })

  const acesso = await exigirPro({ ticker })
  if (!acesso.ok) return acesso.resposta
  if (!acesso.userId) return NextResponse.json({ error: "Autenticação necessária" }, { status: 401, headers: SEM_CACHE })
  const userId = acesso.userId

  const company = await prisma.company.findUnique({ where: { ticker }, select: { id: true } })
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404, headers: SEM_CACHE })

  // Nova versão = última + 1. Duas gravações em simultâneo chocam na chave
  // única (userId, companyId, versao): repete-se uma vez com o número seguinte.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const ultima = await prisma.dcfModelo.findFirst({
      where: { userId, companyId: company.id }, orderBy: { versao: "desc" }, select: { versao: true },
    })
    const versao = (ultima?.versao ?? 0) + 1
    try {
      const criada = await prisma.dcfModelo.create({
        data: {
          userId, companyId: company.id, versao,
          titulo: d.titulo || null,
          tese: d.conjunto.tese?.trim() || null,
          cenarioAtivo: d.conjunto.ativo,
          conjunto: d.conjunto as unknown as Prisma.InputJsonValue,
          valorPorAcao: dec(d.valorPorAcao), valorEsperado: dec(d.valorEsperado), precoAoGuardar: dec(d.preco),
        },
        select: { id: true, versao: true },
      })
      return NextResponse.json(criada, { status: 201, headers: SEM_CACHE })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && tentativa === 0) continue
      console.error("Erro a guardar modelo DCF:", e)
      break
    }
  }
  return NextResponse.json({ error: "Não foi possível guardar o modelo" }, { status: 500, headers: SEM_CACHE })
}
