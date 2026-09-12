import { prisma } from "@/lib/prisma"

/**
 * Estados do Whop que dão acesso.
 *
 * `past_due` entra de propósito: é o período de graça, com o pagamento
 * falhado mas tentativas por fazer. Cortar aí expulsava alguém por um cartão
 * que expirou na véspera.
 */
const ESTADOS_COM_ACESSO = new Set(["active", "trialing", "completed", "past_due"])

/**
 * Resgata um pagamento do Whop feito ANTES de a conta existir.
 *
 * A conta nunca nasce do webhook — cada site tem o seu login, e a password é
 * sempre a que a pessoa define aqui. Quando o Whop avisa de uma membership
 * válida sem conta local, o pagamento fica em `whop_pending_memberships` à
 * espera. É aqui que se cruza com o registo.
 *
 * Silencioso por desenho: chamado no fim do registo, e uma falha não pode
 * impedir alguém de criar conta. Quem pagou e não ficou PRO resolve-se com um
 * evento repetido do Whop ou à mão; quem não consegue registar-se não tem
 * volta nenhuma.
 */
export async function resgatarPagamentoWhop(userId: string, email: string) {
  const normalizado = email.toLowerCase().trim()
  if (!normalizado) return false

  try {
    const pendente = await prisma.whopPendingMembership.findUnique({
      where: { email: normalizado },
    })
    if (!pendente || !ESTADOS_COM_ACESSO.has(pendente.status)) return false

    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: "PRO",
        whopUserId: pendente.whopUserId,
        whopMembershipId: pendente.membershipId,
        whopStatus: pendente.status,
        whopProductId: pendente.productId,
      },
    })

    // A linha fica, marcada. Serve de rasto para perceber porque é que uma
    // conta nasceu PRO sem ter passado por checkout nenhum.
    await prisma.whopPendingMembership.update({
      where: { email: normalizado },
      data: { claimedAt: new Date() },
    })

    console.log(`[whop] pagamento resgatado no registo: ${normalizado} → PRO`)
    return true
  } catch (erro) {
    console.error(`[whop] falha ao resgatar pagamento de ${normalizado}:`, erro)
    return false
  }
}
