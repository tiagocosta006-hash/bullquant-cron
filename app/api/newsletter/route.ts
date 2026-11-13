import { NextResponse, type NextRequest } from "next/server"
import { emailValido, lerOrigem, pedirConsentimento } from "@/lib/marketing"
import { sendNewsletterConfirmEmail } from "@/lib/resend"

/**
 * POST /api/newsletter — pedido de inscrição em "A empresa da semana".
 * Público, rate-limited no middleware (bucket `newsletter`).
 *
 * Responde sempre { ok: true } a um pedido bem formado, quer o e-mail já
 * exista quer não: a resposta não pode servir para descobrir quem está na
 * lista. O consentimento só conta depois do clique no e-mail (ver lib/marketing.ts).
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 })
  }

  // Armadilha para bots: campo escondido que uma pessoa nunca preenche.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true })
  }
  if (!emailValido(body.email)) {
    return NextResponse.json({ ok: false, error: "email" }, { status: 400 })
  }
  // O consentimento tem de vir marcado do formulário (caixa ou botão com o texto ao lado).
  if (body.consent !== true) {
    return NextResponse.json({ ok: false, error: "consent" }, { status: 400 })
  }

  const locale = body.locale === "en" ? "en" : "pt"
  try {
    const { token, jaConfirmado } = await pedirConsentimento({
      email: body.email,
      origem: lerOrigem(body.origem),
      locale,
    })
    if (!jaConfirmado) {
      const site = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "")
      await sendNewsletterConfirmEmail(
        body.email.trim().toLowerCase(),
        `${site}/api/newsletter/confirmar?t=${encodeURIComponent(token)}&l=${locale}`,
        locale,
      )
    }
  } catch (e) {
    console.error("[newsletter] falha ao registar pedido:", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
