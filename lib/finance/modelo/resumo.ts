import { projetar } from "./projecao"
import { avaliar } from "./avaliacao"
import { NOMES_CENARIOS, valorEsperado, type ConjuntoCenarios } from "./cenarios"
import type { NomeCenario } from "./sensibilidade"
import type { AnoHistorico, Mercado, MetodoTerminal } from "./tipos"

/**
 * Cada cenário corre o modelo inteiro com os SEUS pressupostos. Serve a tabela
 * de cenários da Sensitivity, o separador Summary e as exportações (PDF e
 * Excel), para que mostrem sempre os mesmos números.
 */

export type LinhaCenario = {
  nome: NomeCenario
  valor: number | null
  /** CAGR da receita do último ano real ao último projetado. */
  cagr: number | null
  margemIni: number
  margemFim: number
  wacc: number
  metodo: MetodoTerminal
  g: number
  multiplo: number
}

export function correrCenarios(
  base: AnoHistorico,
  conjunto: ConjuntoCenarios,
  mercado: Mercado,
  f: number,
  d0: number,
): { linhas: LinhaCenario[]; esperado: number | null } {
  const receitaBase = base.revenue ?? 0
  const linhas: LinhaCenario[] = NOMES_CENARIOS.map((nome) => {
    const p = conjunto.cenarios[nome]
    const proj = projetar(base, p)
    const { avaliacao } = avaliar(proj, p.avaliacao, mercado, f, d0)
    const ult = proj[proj.length - 1]
    return {
      nome,
      valor: avaliacao.valido ? avaliacao.valorPorAcao : null,
      cagr: receitaBase > 0 && ult ? Math.pow(ult.receita / receitaBase, 1 / proj.length) - 1 : null,
      margemIni: p.drivers.margemEbit[0],
      margemFim: p.drivers.margemEbit[p.drivers.margemEbit.length - 1],
      wacc: avaliacao.wacc.wacc,
      metodo: p.avaliacao.metodoTerminal,
      g: p.avaliacao.g,
      multiplo: p.avaliacao.multiploSaida,
    }
  })
  const valores = Object.fromEntries(linhas.map((x) => [x.nome, x.valor])) as Record<NomeCenario, number | null>
  return { linhas, esperado: valorEsperado(valores, conjunto.probabilidades) }
}
