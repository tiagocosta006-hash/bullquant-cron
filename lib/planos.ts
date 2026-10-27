/**
 * Os planos à venda no site — fonte ÚNICA do preço e do plano da Whop.
 *
 * Os preços (e os dias grátis) têm de ser iguais aos dos planos na Whop (impostos INCLUÍDOS,
 * tax_type "inclusive"): é o que o checkout cobra, e o preço anunciado a
 * consumidores é o preço final. Mudar um preço é mudar aqui E na Whop.
 *
 * Sem segredos: os ids dos planos e dos produtos aparecem nos próprios links
 * de checkout, por isso isto pode ir para o browser.
 */
export type PlanoId = "pro" | "comunidade"

export const PLANOS: Record<PlanoId, { whopPlano: string; whopProduto: string; preco: number; diasGratis?: number }> = {
  /** Só a plataforma. Produto "BullValue PRO" (oculto na loja da Whop). */
  pro: { whopPlano: "plan_5qUb5vb35EzYM", whopProduto: "prod_IqTFWobXaDpeN", preco: 7 },
  /**
   * Plataforma + comunidade TCValue Group. Produto "TCosta Group" (o da comunidade, que também dá PRO).
   * Primeiros 7 dias grátis: tem de ser igual ao trial_period_days do plano na Whop.
   */
  comunidade: { whopPlano: "plan_pN9S9ki0o3vhI", whopProduto: "prod_48E2j9tWRNacG", preco: 9.97, diasGratis: 7 },
}

export const PLANO_IDS = Object.keys(PLANOS) as PlanoId[]

/** Valor vindo de um formulário ou de um URL → plano conhecido (o PRO por omissão). */
export function lerPlano(v: unknown): PlanoId {
  return v === "comunidade" ? "comunidade" : "pro"
}

/** "7" ou "9,97" (pt) / "9.97" (en): sem casas decimais quando o preço é redondo. */
export function precoTexto(preco: number, locale = "pt"): string {
  if (Number.isInteger(preco)) return String(preco)
  const s = preco.toFixed(2)
  return locale === "pt" ? s.replace(".", ",") : s
}
