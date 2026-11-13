import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"

/**
 * Consentimento para e-mails de marketing ("A empresa da semana" e novidades).
 *
 * Regras (RGPD art. 7.º; Lei 41/2004, art. 13.º-A):
 *  - criar conta NÃO é consentimento: é uma caixa à parte, desmarcada;
 *  - dupla confirmação: só conta depois de a pessoa abrir um link no e-mail
 *    (no registo, o link de confirmação da conta serve para isso);
 *  - sair é um clique, sem sessão, e fica registado.
 *
 * O texto aceite muda com o tempo: `CONSENT_VERSION` vai para a base de dados
 * junto do idioma, e o texto de cada versão vive em messages/*.json
 * (`newsletter.consent`). Mudar o texto = subir a versão.
 */
export const CONSENT_VERSION = "empresa-da-semana-v1"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function emailValido(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email)
}

const novoToken = () => randomBytes(24).toString("base64url")

/** Normaliza a origem para um identificador curto e seguro. */
export function lerOrigem(v: unknown): string {
  const s = typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) : ""
  return s || "site"
}

/**
 * Regista (ou renova) um pedido de consentimento. Devolve o token e se já
 * estava confirmado, para quem chama decidir se envia o e-mail de confirmação.
 *
 * Quem tinha saído e volta a pedir fica outra vez por confirmar: um pedido
 * novo exige uma confirmação nova.
 */
export async function pedirConsentimento(opcoes: {
  email: string
  origem: string
  locale: string
  userId?: string | null
}): Promise<{ token: string; jaConfirmado: boolean }> {
  const email = opcoes.email.trim().toLowerCase()
  const consentText = `${CONSENT_VERSION}:${opcoes.locale}`
  const atual = await prisma.marketingContact.findUnique({ where: { email } })

  if (atual && atual.confirmedAt && !atual.unsubscribedAt) {
    if (opcoes.userId && !atual.userId) {
      await prisma.marketingContact.update({ where: { email }, data: { userId: opcoes.userId } })
    }
    return { token: atual.token, jaConfirmado: true }
  }

  const dados = {
    source: opcoes.origem,
    consentText,
    consentAt: new Date(),
    confirmedAt: null,
    unsubscribedAt: null,
    token: novoToken(),
    ...(opcoes.userId ? { userId: opcoes.userId } : {}),
  }
  const linha = await prisma.marketingContact.upsert({
    where: { email },
    create: { email, ...dados },
    update: dados,
  })
  return { token: linha.token, jaConfirmado: false }
}

/** Confirma pelo token do e-mail. Devolve false se o token não existir. */
export async function confirmarPorToken(token: string): Promise<boolean> {
  const r = await prisma.marketingContact.updateMany({
    where: { token, unsubscribedAt: null },
    data: { confirmedAt: new Date() },
  })
  return r.count > 0
}

/**
 * Confirmação pelo registo: abrir o link de confirmação da conta prova que o
 * e-mail é da pessoa, por isso o pedido feito na caixa do registo fica
 * confirmado nesse momento (sem um segundo e-mail).
 */
export async function confirmarPorConta(email: string): Promise<void> {
  await prisma.marketingContact.updateMany({
    where: { email: email.trim().toLowerCase(), confirmedAt: null, unsubscribedAt: null, source: "registo" },
    data: { confirmedAt: new Date() },
  })
}

/** Sair. Idempotente; devolve false se o token não existir. */
export async function sairPorToken(token: string): Promise<boolean> {
  const atual = await prisma.marketingContact.findUnique({ where: { token } })
  if (!atual) return false
  if (!atual.unsubscribedAt) {
    await prisma.marketingContact.update({ where: { token }, data: { unsubscribedAt: new Date() } })
  }
  return true
}
