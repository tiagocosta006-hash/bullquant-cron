import { NextResponse } from "next/server"
import { z } from "zod"
import { sendWithdrawalEmails } from "@/lib/resend"
import { LEGAL } from "@/lib/legal/config"

/**
 * POST /api/withdrawal — função de retratação ("resolver o contrato aqui").
 * Pública (o consumidor pode já não ter sessão); o rate limit por IP está no middleware.
 * Só responde 200 depois de a confirmação por e-mail ter sido aceite pelo fornecedor de e-mail.
 */
const corpo = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  locale: z.enum(["pt", "en"]).default("pt"),
  confirm: z.literal(true),
})

export async function POST(req: Request) {
  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }
  const r = corpo.safeParse(json)
  if (!r.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 })

  const quando = new Date().toISOString()
  const envio = await sendWithdrawalEmails({ ...r.data, supportEmail: LEGAL.email, whenIso: quando })
  if (!envio.ok) {
    console.error("[withdrawal] falha a enviar:", envio.error)
    return NextResponse.json({ error: "send_failed", fallbackEmail: LEGAL.email }, { status: 502 })
  }
  return NextResponse.json({ ok: true, receivedAt: quando }, { headers: { "Cache-Control": "no-store" } })
}
