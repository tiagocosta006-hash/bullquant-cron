import { aplicarAjuste, type NomeCenario } from "./sensibilidade"
import { mudarHorizonte } from "./pressupostos"
import type { Pressupostos } from "./tipos"

/**
 * Scenario analysis à FMVA: três conjuntos COMPLETOS de pressupostos (Bear,
 * Base, Bull) e um seletor que diz qual está ativo — o CHOOSE() do Excel.
 * O analista edita cada cenário nos Schedules e na Valuation como edita o Base.
 *
 * Diferente da sensibilidade, que desloca um ou dois pressupostos de cada vez:
 * aqui cada cenário é uma história coerente que o analista escreve.
 */

export const NOMES_CENARIOS: NomeCenario[] = ["bear", "base", "bull"]

export type ConjuntoCenarios = {
  ativo: NomeCenario
  cenarios: Record<NomeCenario, Pressupostos>
  /** Probabilidades escritas pelo analista (decimal). */
  probabilidades: Record<NomeCenario, number>
}

export const PROBABILIDADES_POR_OMISSAO: Record<NomeCenario, number> = { bear: 0.25, base: 0.5, bull: 0.25 }

/**
 * Ponto de partida do Bear e do Bull: o Base com crescimento e margem EBIT
 * ±3 pp em todos os anos, exit multiple ±2x e crescimento perpétuo ±0,5 pp.
 * A WACC fica igual: mede o risco, não a história do cenário. São só o ponto
 * de partida; o analista reescreve-os.
 */
export function derivarCenario(base: Pressupostos, nome: NomeCenario): Pressupostos {
  if (nome === "base") return base
  const s = nome === "bear" ? -1 : 1
  return aplicarAjuste(base, {
    crescimento: 0.03 * s,
    margemEbit: 0.03 * s,
    multiplo: 2 * s,
    g: Math.max(0, base.avaliacao.g + 0.005 * s),
  }, 0)
}

export function cenariosIniciais(base: Pressupostos): ConjuntoCenarios {
  return {
    ativo: "base",
    cenarios: { bear: derivarCenario(base, "bear"), base, bull: derivarCenario(base, "bull") },
    probabilidades: { ...PROBABILIDADES_POR_OMISSAO },
  }
}

/** O horizonte é do modelo, não de um cenário: muda nos três. */
export function mudarHorizonteCenarios(c: ConjuntoCenarios, anos: number): ConjuntoCenarios {
  return {
    ...c,
    cenarios: {
      bear: mudarHorizonte(c.cenarios.bear, anos),
      base: mudarHorizonte(c.cenarios.base, anos),
      bull: mudarHorizonte(c.cenarios.bull, anos),
    },
  }
}

/** Valor esperado com as probabilidades normalizadas aos cenários com valor. */
export function valorEsperado(
  valores: Record<NomeCenario, number | null>,
  probabilidades: Record<NomeCenario, number>,
): number | null {
  let soma = 0, peso = 0
  for (const n of NOMES_CENARIOS) {
    const v = valores[n], p = probabilidades[n]
    if (v !== null && Number.isFinite(v) && p > 0) { soma += v * p; peso += p }
  }
  return peso > 0 ? soma / peso : null
}
