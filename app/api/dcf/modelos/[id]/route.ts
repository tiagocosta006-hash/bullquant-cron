import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exigirPro } from "@/lib/api/acessoPro"
import { conjuntoSchema } from "@/lib/finance/modelo/validar"

/** GET devolve o modelo inteiro de uma versão; DELETE apaga uma versão do próprio utilizador. */

const SEM_CACHE = { "Cache-Control": "no-store" }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirPro()
  if (!acesso.ok) return acesso.resposta
  if (!acesso.userId) return NextResponse.json({ error: "Autenticação necessária" }, { status: 401, headers: SEM_CACHE })
  const { id } = await params
  const l = await prisma.dcfModelo.findFirst({
    where: { id, userId: acesso.userId },
    select: { id: true, versao: true, titulo: true, createdAt: true, conjunto: true, company: { select: { ticker: true } } },
  })
  if (!l) return NextResponse.json({ error: "Not found" }, { status: 404, headers: SEM_CACHE })
  // O que está na base também passa pela validação: um registo antigo ou editado à mão não chega ao modelo.
  const c = conjuntoSchema.safeParse(l.conjunto)
  if (!c.success) return NextResponse.json({ error: "Modelo guardado inválido" }, { status: 422, headers: SEM_CACHE })
  return NextResponse.json(
    { id: l.id, versao: l.versao, titulo: l.titulo, ticker: l.company.ticker, createdAt: l.createdAt.toISOString(), conjunto: c.data },
    { headers: SEM_CACHE },
  )
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirPro()
  if (!acesso.ok) return acesso.resposta
  if (!acesso.userId) return NextResponse.json({ error: "Autenticação necessária" }, { status: 401, headers: SEM_CACHE })
  const { id } = await params
  // deleteMany com userId: só apaga se for do próprio utilizador.
  const r = await prisma.dcfModelo.deleteMany({ where: { id, userId: acesso.userId } })
  if (r.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404, headers: SEM_CACHE })
  return NextResponse.json({ ok: true }, { headers: SEM_CACHE })
}
