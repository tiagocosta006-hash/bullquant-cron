/**
 * Notas por valor dos fundamentais — o "mini aviso" junto a um número.
 *
 * Decisão do produto (2026-11-18): mostramos sempre o valor correto. Quando
 * esse valor não é o publicado tal e qual, o número leva uma nota:
 *   - "reexpressao": a empresa voltou a publicar o número (automático, do XBRL);
 *   - "correcao": a fonte estava errada e corrigimos (só correções revistas,
 *     com citação do relatório — scripts/correcoes.json).
 * As notas são gravadas pelo scripts/ingest_fundamentals.py (notas_valores.py).
 */

export type TipoNota = "correcao" | "reexpressao" | "definicao"

export type NotaValor = {
  kind: TipoNota | string
  reasonPt: string
  reasonEn: string
  sourceUrl: string | null
}

/** Notas de um período, por nome de coluna (ex.: { revenue: {...} }). */
export type NotasPeriodo = Record<string, NotaValor>

export function chaveNota(periodType: string, fiscalYear: number, fiscalQuarter: number | null | undefined): string {
  return `${periodType}|${fiscalYear}|${fiscalQuarter ?? ""}`
}

export function agruparNotas(
  notas: Array<NotaValor & { periodType: string; fiscalYear: number; fiscalQuarter: number | null; field: string }>,
): Map<string, NotasPeriodo> {
  const out = new Map<string, NotasPeriodo>()
  for (const n of notas) {
    const k = chaveNota(n.periodType, n.fiscalYear, n.fiscalQuarter)
    const doPeriodo = out.get(k) ?? {}
    doPeriodo[n.field] = { kind: n.kind, reasonPt: n.reasonPt, reasonEn: n.reasonEn, sourceUrl: n.sourceUrl }
    out.set(k, doPeriodo)
  }
  return out
}
