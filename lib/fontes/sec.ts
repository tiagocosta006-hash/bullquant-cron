/**
 * Pedidos pontuais à API pública da SEC (data.sec.gov) a partir do site.
 * Sem chave; a SEC pede um User-Agent com contacto e no máximo 10 pedidos/s.
 */

const UA = process.env.SEC_USER_AGENT || process.env.SEC_IDENTITY || "BullValue admin@bullocracy.com"

type Facto = { end: string; val: number; form?: string; filed?: string; start?: string }
type Conceito = { units?: Record<string, Facto[]> }

async function conceito(cik: string, tag: string): Promise<Facto[]> {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik.padStart(10, "0")}/us-gaap/${tag}.json`
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 86_400, tags: ["sec"] },
      signal: AbortSignal.timeout(15_000),
    })
    if (!resp.ok) return []
    const d = (await resp.json()) as Conceito
    return d.units?.USD ?? []
  } catch {
    return []
  }
}

/**
 * Receita diferida corrente (passivo de contratos com clientes) por data de balanço,
 * dos 10-K: a mesma definição que a FMP usava no DCF. Tenta a tag ASC 606 e cai para
 * a antiga `DeferredRevenueCurrent`. O valor de cada data é o do filing mais recente.
 */
export async function receitaDiferida(cik: string | null | undefined): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!cik) return out
  for (const tag of ["ContractWithCustomerLiabilityCurrent", "DeferredRevenueCurrent"]) {
    const fs = (await conceito(cik, tag)).filter((f) => !f.start && (f.form ?? "").startsWith("10-K"))
    fs.sort((a, b) => ((a.filed ?? "") < (b.filed ?? "") ? -1 : 1))
    for (const f of fs) if (!out.has(f.end) || tag === "ContractWithCustomerLiabilityCurrent") out.set(f.end, f.val)
    if (out.size > 0) break
  }
  return out
}
