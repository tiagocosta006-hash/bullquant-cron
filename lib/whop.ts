import { PLANOS, type PlanoId } from "@/lib/planos"
import { prisma } from "@/lib/prisma"

/**
 * Estados do Whop que dão acesso.
 *
 * `past_due` entra de propósito: é o período de graça, com o pagamento
 * falhado mas tentativas por fazer. Cortar aí expulsava alguém por um cartão
 * que expirou na véspera.
 */
export const ESTADOS_COM_ACESSO = new Set(["active", "trialing", "completed", "past_due"])

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

    // Uma linha JÁ RESGATADA não volta a dar acesso.
    //
    // O `claimedAt` era escrito e nunca lido, e isso abria o caminho de volta
    // ao PRO a quem cancelou:
    //
    //   1. paga sem ter conta        → fica pendente, status "active"
    //   2. regista-se / entra        → PRO, `claimedAt` marcado, LINHA FICA
    //   3. cancela                   → o webhook põe FREE e apaga o pendente
    //                                  PELO EMAIL — mas se o evento de
    //                                  cancelamento vier sem email (que é o
    //                                  que acontece sem a permissão
    //                                  `member:email:read`), a linha sobrevive
    //                                  com o status antigo
    //   4. volta a fazer login       → o resgate encontra-a e devolve o PRO
    //
    // Ou seja: cancelar e voltar a entrar era um PRO gratuito e permanente.
    // A partir do momento em que a conta existe, quem manda no acesso é o
    // webhook, que a encontra por email ou por `whopUserId` e escreve o plano
    // directamente. O resgate serve só para o pagamento que chegou ANTES da
    // conta — uma vez só, que é o que o `claimedAt` sempre quis dizer.
    if (pendente.claimedAt) return false

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

// ── Checkout ligado à conta ─────────────────────────────────────────────────
//
// O pagamento era feito ANTES de haver conta, numa loja da Whop que não falava
// da BullValue, e só se ligava à conta se a pessoa se registasse depois com o
// MESMO email. Quem usasse outro email pagava e ficava sem acesso.
//
// Agora a conta existe primeiro e o checkout é criado pela API com o id dela
// em `metadata.bv_user_id`. A Whop copia a metadata para a membership, e o
// webhook liga o pagamento à conta por esse id — o email deixa de importar.
// O email vai pré-preenchido e bloqueado no checkout só para a pessoa não ter
// de o escrever duas vezes.

const WHOP_API = "https://api.whop.com/api/v1"

/**
 * Cria um checkout da Whop para uma conta e devolve o URL para onde mandar a
 * pessoa.
 *
 * Sem WHOP_API_KEY, ou se a API falhar, cai para o link direto do plano com o
 * email da conta pré-preenchido e BLOQUEADO: perde-se a metadata e o regresso
 * a /bem-vindo, mas o email da Whop fica igual ao da conta e o webhook liga o
 * pagamento por aí (o caminho antigo). Ninguém fica sem conseguir pagar.
 *
 * `consentimento` é guardado na metadata da membership: fica registado, junto
 * do pagamento, que a pessoa pediu o início imediato e em que versão dos
 * Termos (prova do pedido expresso do DL 24/2014, art. 15.º).
 */
export async function criarCheckoutWhop(opcoes: {
  plano: PlanoId
  userId: string
  email: string
  siteUrl: string
  consentimento: string
  /** Prefixo do idioma no regresso ("" em PT, que é o padrão; "/en" em inglês). */
  prefixo?: string
}): Promise<string> {
  const chave = process.env.WHOP_API_KEY
  const plano = PLANOS[opcoes.plano].whopPlano
  const comEmail = (base: string) => {
    const url = new URL(base, "https://whop.com")
    url.searchParams.set("email", opcoes.email)
    url.searchParams.set("email.disabled", "1")
    return url.toString()
  }
  const linkDireto = comEmail(`https://whop.com/checkout/${plano}/`)
  if (!chave) {
    console.error("[whop] WHOP_API_KEY em falta — checkout pelo link direto do plano")
    return linkDireto
  }
  try {
    const r = await fetch(`${WHOP_API}/checkout_configurations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: plano,
        mode: "payment",
        metadata: { bv_user_id: opcoes.userId, bv_consent: opcoes.consentimento },
        // O email vai no regresso para a página dizer para onde foi a confirmação
        // (quem acabou de se registar ainda não tem sessão).
        redirect_url: `${opcoes.siteUrl}${opcoes.prefixo ?? ""}/bem-vindo?email=${encodeURIComponent(opcoes.email)}`,
        // As cores do site: sem isto o checkout abre no azul da Whop e parece
        // outra loja.
        checkout_styling: { button_color: "#B98532", background_color: "#F7F3EA", border_style: "rounded", font_family: "system" },
      }),
      cache: "no-store",
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const d = (await r.json()) as { purchase_url?: string }
    if (!d.purchase_url) throw new Error("resposta sem purchase_url")
    return comEmail(d.purchase_url)
  } catch (erro) {
    console.error(`[whop] falha ao criar checkout para ${opcoes.userId}; link direto:`, erro)
    return linkDireto
  }
}

/**
 * A pessoa da Whop tem, NESTE momento, alguma subscrição válida de um dos
 * produtos que dão PRO? `null` se não foi possível perguntar.
 *
 * O webhook decidia o acesso pelo TIPO do evento que chegava. Isso falha em
 * dois casos: quem tem duas subscrições (a da comunidade e a da BullValue)
 * perdia o PRO ao cancelar uma delas, e uma retentativa atrasada de um
 * "activated" antigo devolvia o PRO a quem já tinha cancelado. Perguntar o
 * estado atual resolve os dois.
 */
export async function whopTemSubscricaoValida(whopUserId: string, produtos: string[]): Promise<boolean | null> {
  const chave = process.env.WHOP_API_KEY
  const empresa = process.env.WHOP_COMPANY_ID ?? "biz_P91huSkGPjZVhU"
  if (!chave) return null
  try {
    const url = `${WHOP_API}/memberships?company_id=${encodeURIComponent(empresa)}&user_id=${encodeURIComponent(whopUserId)}&first=50`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${chave}` }, cache: "no-store" })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = (await r.json()) as { data?: { status?: string; user_id?: string; product_id?: string; product?: { id?: string } }[] }
    return (d.data ?? []).some((m) => {
      if (m.user_id && m.user_id !== whopUserId) return false
      const produto = m.product_id ?? m.product?.id
      return ESTADOS_COM_ACESSO.has(m.status ?? "") && (produtos.length === 0 || (produto != null && produtos.includes(produto)))
    })
  } catch (erro) {
    console.error(`[whop] não foi possível ler as subscrições de ${whopUserId}:`, erro)
    return null
  }
}
