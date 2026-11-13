import { NextResponse, type NextRequest } from "next/server"
import { sairPorToken } from "@/lib/marketing"
import { irParaEstado } from "../estado"

/**
 * Sair de "A empresa da semana" num clique, sem sessão.
 * GET = link no rodapé do e-mail. POST = cabeçalho List-Unsubscribe-Post
 * (RFC 8058), que o Gmail e o Outlook chamam sem abrir página nenhuma.
 */
const token = (request: NextRequest) => request.nextUrl.searchParams.get("t") ?? ""

export async function GET(request: NextRequest) {
  const t = token(request)
  const ok = t.length > 10 && (await sairPorToken(t).catch(() => false))
  return irParaEstado(request, ok ? "saiu" : "invalido")
}

export async function POST(request: NextRequest) {
  const t = token(request)
  const ok = t.length > 10 && (await sairPorToken(t).catch(() => false))
  return new NextResponse(null, { status: ok ? 200 : 404 })
}
