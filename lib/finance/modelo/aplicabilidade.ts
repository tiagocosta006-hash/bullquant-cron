/**
 * O modelo FCFF serve para esta empresa?
 *
 * Não serve onde o balanço É o negócio: num banco a dívida é matéria-prima
 * (depósitos), numa seguradora o "capex" são reservas técnicas. Aí o FCFF
 * não mede nada. Mas "setor financeiro" é demasiado largo: a MSCI, a S&P
 * Global, a Visa ou as bolsas têm negócios leves em capital onde o FCFF
 * funciona bem. Decide-se pela INDÚSTRIA.
 */
const INDUSTRIAS_BALANCO = [
  /bank/i, // Diversified / Regional Banks
  /insurance/i, // P&C, Life & Health, Multi-line (os corretores de seguros ficam de fora pela exceção abaixo)
  /reinsurance/i,
  /investment banking|brokerage/i, // GS, MS, SCHW, IBKR, HOOD
  /consumer finance/i, // AXP, COF, SYF
  /multi-sector holdings/i, // BRK.B: o float da seguradora está no centro
  /thrift|mortgage/i,
]
/** Bancos de custódia vêm misturados com gestoras em "Asset Management & Custody Banks". */
const CUSTODIA = new Set(["BNY", "STT", "NTRS"])

export function modeloFcffAplicavel(setor: string | null, industria: string | null, ticker: string): boolean {
  if (CUSTODIA.has(ticker)) return false
  const financeiro = !!setor && /financ/i.test(setor)
  if (!financeiro) return true
  // Financeiras sem indústria na base (HSBC, UBS, Barclays) são bancos.
  if (!industria) return false
  if (/insurance brokers/i.test(industria)) return true
  if (/asset management/i.test(industria)) return true
  return !INDUSTRIAS_BALANCO.some((re) => re.test(industria))
}
