import { NextResponse, type NextRequest } from "next/server"

/** Redireciona para a página /newsletter com o estado, no idioma certo. */
export function irParaEstado(request: NextRequest, estado: "confirmado" | "saiu" | "invalido") {
  const url = new URL(request.url)
  const prefixo = url.searchParams.get("l") === "en" ? "/en" : ""
  return NextResponse.redirect(new URL(`${prefixo}/newsletter?estado=${estado}`, url.origin), 303)
}
