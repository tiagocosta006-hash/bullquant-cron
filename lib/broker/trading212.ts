/**
 * Cliente da API pública da Trading212 (beta) — só chamado no servidor.
 * Docs: https://docs.trading212.com/api
 * Auth: HTTP Basic (API Key como username, API Secret como password).
 *
 * A key tem de ter TODAS as permissões de leitura ativadas ao ser criada em
 * Settings → API — uma key só com "Metadata" devolve 403 neste endpoint.
 */

const BASE_URL = "https://live.trading212.com/api/v0"

/** Resposta real de GET /equity/positions — campos vêm aninhados em `instrument`, não na raiz. */
type Trading212ApiPosition = {
  instrument: {
    ticker: string // identificador interno T212, ex: "AAPL_US_EQ", "AMZd_EQ" — nunca construir manualmente
    name: string
    isin: string
    currency: string
  }
  quantity: number
  averagePricePaid: number
  currentPrice: number
}

export type Trading212Position = {
  ticker: string
  name: string
  isin: string
  quantity: number
  averagePricePaid: number
  currentPrice: number
}

export class Trading212ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function buildAuthHeader(apiKey: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`
}

/** Valida as credenciais e devolve as posições atuais. Lança Trading212ApiError em caso de falha. */
export async function fetchTrading212Positions(apiKey: string, apiSecret: string): Promise<Trading212Position[]> {
  const res = await fetch(`${BASE_URL}/equity/positions`, {
    headers: { Authorization: buildAuthHeader(apiKey, apiSecret) },
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Trading212ApiError(res.status, "Invalid Trading212 API credentials or missing permissions")
    }
    if (res.status === 429) {
      throw new Trading212ApiError(res.status, "Trading212 API rate limit exceeded")
    }
    throw new Trading212ApiError(res.status, `Trading212 API error: ${res.status}`)
  }

  const raw: Trading212ApiPosition[] = await res.json()
  return raw.map(p => ({
    ticker: p.instrument.ticker,
    name: p.instrument.name,
    isin: p.instrument.isin,
    quantity: p.quantity,
    averagePricePaid: p.averagePricePaid,
    currentPrice: p.currentPrice,
  }))
}

/**
 * Tickers onde a Trading212 usa um símbolo diferente do que a nossa BD tem
 * (normalmente por herança histórica, ex: Meta ainda aparece como "FB" da
 * era Facebook). Mapear aqui as exceções conhecidas em vez de tentar adivinhar.
 */
const TICKER_ALIASES: Record<string, string> = {
  FB: "META",
}

/**
 * Extrai o ticker de bolsa "limpo" a partir do identificador interno da T212
 * (ex: "AAPL_US_EQ" → "AAPL", "AMZd_EQ" → "AMZ", "BRK_B_US_EQ" → "BRK.B").
 * Heurística best-effort — a T212 usa sufixos de listagem alternativa (ex:
 * "d", "a") que não seguem um padrão documentado, e instrumentos europeus/ETFs
 * podem legitimamente não corresponder a nada na nossa tabela `companies`
 * (cobertura MVP = S&P 500) — isso deve resultar em "unsupported", não num
 * mapeamento forçado. O ISIN em `Trading212Position.isin` é a chave fiável
 * para desambiguar/deduplicar — usar sempre isso antes deste ticker ao agrupar.
 */
export function extractExchangeTicker(t212Ticker: string): string {
  const segments = t212Ticker.split("_")
  // Último segmento é sempre o tipo de instrumento (ex: "EQ"); o penúltimo,
  // quando existe mais de 2 segmentos, é o país (ex: "US", "PT"). Tudo o que
  // sobra no meio é o ticker — pode ter mais de um segmento (ex: "BRK", "B").
  const middle = segments.length > 2 ? segments.slice(0, -2) : segments.slice(0, -1)
  const base = middle.length > 0 ? middle.join(".") : segments[0]
  // Remove sufixo de listagem alternativa de 1 letra minúscula colado ao ticker (ex: "AMZd" → "AMZ").
  const cleaned = /^[A-Z0-9.]+[a-z]$/.test(base) ? base.slice(0, -1) : base
  return TICKER_ALIASES[cleaned] || cleaned
}
