import { tipoFinanceira } from "@/lib/fmp/mapear"

/**
 * O modelo FCFF serve para esta empresa?
 *
 * Não serve onde o balanço É o negócio: num banco a dívida é matéria-prima
 * (depósitos), numa seguradora o "capex" são reservas técnicas. Aí o FCFF
 * não mede nada. A MSCI, a S&P Global, a Visa ou as bolsas, apesar do setor
 * financeiro, têm negócios leves em capital onde o FCFF funciona bem.
 * A classificação vive em lib/fmp/mapear.ts (tipoFinanceira), a mesma que
 * decide a receita e a caixa na ingestão.
 */
export function modeloFcffAplicavel(setor: string | null, industria: string | null, ticker: string): boolean {
  return tipoFinanceira(setor, industria, ticker) === null
}
