/**
 * Motor de DCF (Discounted Cash Flow) de 2 fases — JS puro, sem dependências de UI.
 *
 * Modelo:
 *   - Fase 1 (anos 1-5): FCF cresce a `growthStage1`.
 *   - Fase 2 (anos 6-10): FCF cresce a `growthStage2`.
 *   - Valor Terminal (Gordon Growth) no ano 10: FCF_10·(1+gT) / (WACC − gT).
 *   - Enterprise Value = Σ PV(FCF) + PV(Valor Terminal).
 *   - Equity Value = Enterprise Value − Dívida Líquida.
 *   - Fair Value por ação = Equity Value / nº de ações.
 *
 * Nota: a fórmula do spec (CLAUDE.md §10) é o caso particular com dívida
 * líquida = 0 (Equity Value == Enterprise Value).
 *
 * Todas as taxas são DECIMAIS (0.10 = 10%). Valores monetários em unidades
 * absolutas (ex: dólares), não milhões.
 */

export interface DcfInputs {
  fcf0: number          // Free Cash Flow do último período (base)
  growthStage1: number  // crescimento anual anos 1-5 (decimal)
  growthStage2: number  // crescimento anual anos 6-10 (decimal)
  wacc: number          // taxa de desconto (decimal)
  terminalGrowth: number // crescimento perpétuo (decimal)
  shares: number        // nº de ações em circulação (absoluto)
  netDebt: number       // dívida total − caixa (pode ser negativo = net cash)
  currentPrice: number  // preço atual por ação
}

export interface DcfProjectionYear {
  year: number          // 1..10
  fcf: number           // FCF projetado nesse ano
  presentValue: number  // valor presente descontado
}

export interface DcfResult {
  valid: boolean
  /** preenchido quando valid === false */
  error?: "INVALID_WACC" | "INVALID_SHARES" | "INVALID_FCF"
  projections: DcfProjectionYear[]
  sumPvFcf: number          // Σ PV dos 10 anos de FCF
  terminalValue: number     // valor terminal nominal (ano 10)
  pvTerminalValue: number   // valor presente do valor terminal
  enterpriseValue: number   // Σ PV(FCF) + PV(TV)
  equityValue: number       // EV − dívida líquida
  fairValue: number         // por ação
  currentPrice: number
  /** (fairValue − price) / fairValue. Positivo = subavaliada. */
  marginOfSafety: number
}

const STAGE1_YEARS = 5
const STAGE2_YEARS = 5
const TOTAL_YEARS = STAGE1_YEARS + STAGE2_YEARS

const EMPTY_RESULT = (
  inputs: DcfInputs,
  error: NonNullable<DcfResult["error"]>
): DcfResult => ({
  valid: false,
  error,
  projections: [],
  sumPvFcf: 0,
  terminalValue: 0,
  pvTerminalValue: 0,
  enterpriseValue: 0,
  equityValue: 0,
  fairValue: 0,
  currentPrice: inputs.currentPrice,
  marginOfSafety: 0,
})

export function runDcf(inputs: DcfInputs): DcfResult {
  const { fcf0, growthStage1, growthStage2, wacc, terminalGrowth, shares, netDebt } = inputs

  // Guardas: WACC tem de exceder o crescimento perpétuo (senão o valor
  // terminal de Gordon diverge / fica negativo), ações > 0, FCF base válido.
  if (!Number.isFinite(fcf0)) return EMPTY_RESULT(inputs, "INVALID_FCF")
  if (!(shares > 0)) return EMPTY_RESULT(inputs, "INVALID_SHARES")
  if (!(wacc > terminalGrowth)) return EMPTY_RESULT(inputs, "INVALID_WACC")

  const projections: DcfProjectionYear[] = []
  let sumPvFcf = 0
  let fcf = fcf0

  for (let year = 1; year <= TOTAL_YEARS; year++) {
    const growth = year <= STAGE1_YEARS ? growthStage1 : growthStage2
    fcf = fcf * (1 + growth)
    const presentValue = fcf / Math.pow(1 + wacc, year)
    sumPvFcf += presentValue
    projections.push({ year, fcf, presentValue })
  }

  // Valor terminal (Gordon Growth) a partir do FCF do ano 10.
  const fcf10 = projections[TOTAL_YEARS - 1].fcf
  const terminalValue = (fcf10 * (1 + terminalGrowth)) / (wacc - terminalGrowth)
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, TOTAL_YEARS)

  const enterpriseValue = sumPvFcf + pvTerminalValue
  const equityValue = enterpriseValue - netDebt
  const fairValue = equityValue / shares
  const marginOfSafety = fairValue !== 0 ? (fairValue - inputs.currentPrice) / fairValue : 0

  return {
    valid: true,
    projections,
    sumPvFcf,
    terminalValue,
    pvTerminalValue,
    enterpriseValue,
    equityValue,
    fairValue,
    currentPrice: inputs.currentPrice,
    marginOfSafety,
  }
}

/**
 * Calcula a taxa de crescimento implícita (Reverse DCF) necessária para
 * justificar o preço atual da ação (targetPrice), assumindo que a
 * growthStage2 = growthStage1 / 2.
 * Utiliza o método da biseção (Bisection Method).
 */
export function solveReverseDcf(
  baseInputs: Omit<DcfInputs, "growthStage1" | "growthStage2">
): { impliedGrowth1: number; impliedGrowth2: number } | null {
  if (baseInputs.currentPrice <= 0 || baseInputs.fcf0 <= 0 || baseInputs.shares <= 0) {
    return null;
  }

  const target = baseInputs.currentPrice;
  let low = -0.5; // -50% crescimento
  let high = 2.0; // 200% crescimento
  const tolerance = 0.01; // precisão do preço a 1 cêntimo
  let bestGuess = 0;

  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const testInputs: DcfInputs = {
      ...baseInputs,
      growthStage1: mid,
      growthStage2: mid / 2, // A nossa Opção B!
    };

    const res = runDcf(testInputs);
    if (!res.valid) {
      // Se não for válido (ex: WACC inválido), abortamos ou limitamos
      return null;
    }

    if (Math.abs(res.fairValue - target) <= tolerance) {
      bestGuess = mid;
      break;
    }

    // Se fairValue > target, assumimos demasiado crescimento, logo baixa o 'high'.
    // Nota: O fairValue aumenta monotonamente com o crescimento.
    if (res.fairValue > target) {
      high = mid;
    } else {
      low = mid;
    }
    bestGuess = mid;
  }

  return {
    impliedGrowth1: bestGuess,
    impliedGrowth2: bestGuess / 2,
  };
}
