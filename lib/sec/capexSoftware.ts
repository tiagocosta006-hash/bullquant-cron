/**
 * Capex com o software capitalizado, a partir do XBRL da SEC.
 *
 * ── O problema ───────────────────────────────────────────────────────────
 *
 * Muitas empresas de software, dados e pagamentos (MSCI, Mastercard, FIS, ICE,
 * Datadog, DoorDash…) reportam duas linhas no cash-flow: "compras de ativos
 * fixos" e "software capitalizado". A FMP devolve no `capitalExpenditure` ora o
 * total, ora só a primeira, e na mesma empresa muda de ano para ano (MSCI: 2023
 * total, 2024 e 2025 só PP&E). Quando falta o software o capex sai baixo e o FCF
 * alto: na MSCI, 90 M$ por ano (6% do FCF).
 *
 * ── A regra ──────────────────────────────────────────────────────────────
 *
 * Por ano fiscal, compara-se o capex da FMP com o que a SEC diz:
 *   ppe   = PaymentsToAcquirePropertyPlantAndEquipment (ou ProductiveAssets)
 *   soft  = PaymentsForSoftware + PaymentsToDevelopSoftware + PaymentsToAcquireSoftware
 * e conforme o capex da FMP seja ≈ ppe + soft ("incluido"), ≈ ppe ("somar"), entre
 * os dois ("completar", só parte do software) ou outra coisa ("incerto"), só se
 * mexe nos dois do meio. Nos casos incertos não se toca: um número que não
 * sabemos explicar fica como veio.
 * O software só conta se for material (≥ 5% do capex e ≥ 0,3% da receita).
 *
 * Os trimestres herdam a decisão do ano fiscal. No XBRL os trimestres do
 * cash-flow são acumulados desde o início do ano (3, 6, 9 meses), por isso o
 * valor de um trimestre é a diferença entre dois acumulados.
 */

export type FatoSec = { start: string; end: string; val: number }
export type SeriesSec = { ppe: FatoSec[]; software: FatoSec[] }

export const TAGS_PPE = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"] as const
export const TAGS_SOFTWARE = ["PaymentsForSoftware", "PaymentsToDevelopSoftware", "PaymentsToAcquireSoftware"] as const

const DIA = 86_400_000
const dias = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DIA)

type FatoBruto = { start?: string; end: string; val: number; form?: string }

function fatosDe(gaap: Record<string, { units?: Record<string, FatoBruto[]> }>, tag: string): FatoSec[] {
  const out = new Map<string, FatoSec>()
  for (const f of gaap[tag]?.units?.USD ?? []) {
    if (!f.start || !["10-K", "10-K/A", "10-Q"].includes(f.form ?? "")) continue
    // O mesmo facto repete-se em todos os documentos que o citam: uma entrada por (início, fim).
    out.set(`${f.start}|${f.end}`, { start: f.start, end: f.end, val: f.val })
  }
  return [...out.values()]
}

/** Extrai as séries de capex e de software do JSON `companyfacts` da SEC. */
export function extrairSeries(companyFacts: unknown): SeriesSec {
  const gaap = ((companyFacts as { facts?: { "us-gaap"?: Record<string, { units?: Record<string, FatoBruto[]> }> } })?.facts?.["us-gaap"]) ?? {}
  // PP&E: a primeira etiqueta que tenha o período. Software: soma das linhas distintas.
  const ppe = new Map<string, FatoSec>()
  for (const tag of TAGS_PPE) for (const f of fatosDe(gaap, tag)) if (!ppe.has(`${f.start}|${f.end}`)) ppe.set(`${f.start}|${f.end}`, f)
  const sw = new Map<string, FatoSec>()
  for (const tag of TAGS_SOFTWARE) {
    for (const f of fatosDe(gaap, tag)) {
      const k = `${f.start}|${f.end}`
      const ant = sw.get(k)
      sw.set(k, { ...f, val: (ant?.val ?? 0) + f.val })
    }
  }
  return { ppe: [...ppe.values()], software: [...sw.values()] }
}

/** Valor do ano fiscal que termina perto de `fim` (duração de ~1 ano). */
export function valorAnual(fatos: FatoSec[], fim: string): number | null {
  const f = fatos.find((x) => Math.abs(dias(x.end, fim)) <= 10 && dias(x.start, x.end) >= 350 && dias(x.start, x.end) <= 380)
  return f ? f.val : null
}

/**
 * Valor do trimestre que termina perto de `fim`. Se há um facto de ~3 meses usa-se;
 * senão o facto é um acumulado desde o início do ano e subtrai-se o acumulado anterior
 * (o do mesmo início, que acaba um trimestre antes). O 1.º trimestre é o próprio acumulado.
 */
export function valorTrimestral(fatos: FatoSec[], fim: string): number | null {
  const perto = fatos.filter((x) => Math.abs(dias(x.end, fim)) <= 10)
  const direto = perto.find((x) => dias(x.start, x.end) >= 80 && dias(x.start, x.end) <= 100)
  if (direto) return direto.val
  const acum = perto.filter((x) => dias(x.start, x.end) > 100 && dias(x.start, x.end) <= 380).sort((a, b) => dias(a.start, a.end) - dias(b.start, b.end))[0]
  if (!acum) return null
  const anterior = fatos
    .filter((x) => x.start === acum.start && dias(x.end, acum.end) >= 60 && dias(x.end, acum.end) <= 120)
    .sort((a, b) => (a.end < b.end ? 1 : -1))[0]
  return anterior ? acum.val - anterior.val : null
}

export type Decisao = "somar" | "completar" | "incluido" | "imaterial" | "incerto" | "sem_dado"

const perto = (a: number, b: number) => Math.abs(a - b) <= 0.03 * Math.max(Math.abs(a), Math.abs(b), 1)

/** O capex da FMP já inclui o software, não inclui, ou não sabemos? (anual) */
export function decidir(o: { capexFmp: number | null; ppe: number | null; software: number | null; receita: number | null }): Decisao {
  const { capexFmp, ppe, software, receita } = o
  if (capexFmp === null || ppe === null || software === null || software <= 0) return "sem_dado"
  const material = software >= 0.05 * Math.max(capexFmp, 1) && receita !== null && receita > 0 && software >= 0.003 * receita
  if (!material) return "imaterial"
  if (perto(capexFmp, ppe + software)) return "incluido"
  if (perto(capexFmp, ppe)) return "somar"
  // A FMP incluiu só parte do software (a MSCI, no 2.º trimestre de 2026: 15 M$ contra
  // PP&E 11 + software 33): completa-se até ao total que a SEC dá.
  if (capexFmp >= 0.9 * ppe && capexFmp < ppe + software) return "completar"
  return "incerto"
}

/** Quanto somar ao capex da FMP, conforme a decisão. */
export function acrescimo(decisao: Decisao, o: { capexFmp: number; ppe: number; software: number }): number {
  if (decisao === "somar") return o.software
  if (decisao === "completar") return o.ppe + o.software - o.capexFmp
  return 0
}
