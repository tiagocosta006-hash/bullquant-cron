import type { NextRequest } from "next/server"
import { confirmarPorToken } from "@/lib/marketing"
import { irParaEstado } from "../estado"

/** GET /api/newsletter/confirmar?t=… — o clique da dupla confirmação. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? ""
  const ok = token.length > 10 && (await confirmarPorToken(token).catch(() => false))
  return irParaEstado(request, ok ? "confirmado" : "invalido")
}
