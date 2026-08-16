/**
 * Guard de fiabilidade das partições de receita por segmento.
 *
 * Alguns emitentes publicam segmentos HIERÁRQUICOS e sobrepostos (a Google
 * reportava "Google Services" ⊃ "Google advertising" ⊃ "YouTube ads"). Somados,
 * duplicam ou triplicam a receita. O extrator (scripts/ingest_segments_xbrl.py)
 * já valida a reconciliação contra o total consolidado do XBRL antes de gravar,
 * mas linhas ingeridas pelo parser antigo podem não ter passado por essa
 * validação — daí este guard continuar a fazer sentido do lado da leitura.
 */

export type SegmentMap = Record<string, number>;

/** Partições disponíveis por eixo XBRL, como gravadas em revenueSegmentsByAxis. */
export interface SegmentsByAxis {
  segment?: SegmentMap | null;
  product?: SegmentMap | null;
  geography?: SegmentMap | null;
}

export const AXIS_LABELS: Record<keyof SegmentsByAxis, string> = {
  segment: "Segmento operacional",
  product: "Produto e serviço",
  geography: "Geografia",
};

/** Soma dos valores de uma partição (ignora entradas não numéricas). */
export function sumSegments(segs: SegmentMap | null | undefined): number {
  if (!segs) return 0;
  return Object.values(segs).reduce<number>((s, v) => s + (Number(v) || 0), 0);
}

interface PeriodLike {
  revenue?: unknown;
  revenueSegments?: SegmentMap | null;
}

/**
 * Uma série de períodos é fiável se a soma dos segmentos NÃO exceder
 * materialmente (>10%) a receita real na maioria dos anos com dados.
 */
export function isSegmentSumReliable(periods: PeriodLike[]): boolean {
  const withSegs = periods.filter(
    (p) => p.revenueSegments && Object.keys(p.revenueSegments).length > 0,
  );
  if (withSegs.length === 0) return false;

  const overlapping = withSegs.filter((p) => {
    const rev = Number(p.revenue);
    if (!Number.isFinite(rev) || rev <= 0) return false;
    return sumSegments(p.revenueSegments) > rev * 1.1;
  });

  return overlapping.length < Math.ceil(withSegs.length / 2);
}

/** Igual ao anterior, para um único período. */
export function isPeriodSegmentReliable(period: PeriodLike): boolean {
  const rev = Number(period.revenue);
  if (!period.revenueSegments || Object.keys(period.revenueSegments).length === 0) return false;
  if (!Number.isFinite(rev) || rev <= 0) return true; // sem receita não dá para julgar
  return sumSegments(period.revenueSegments) <= rev * 1.1;
}
