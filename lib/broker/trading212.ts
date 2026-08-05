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

// ── Valor da conta ─────────────────────────────────────────────────────────

export type Trading212AccountSummary = {
  /** Cash + posições, na moeda principal da conta. */
  totalValue: number
  /** ISO 4217, ex: "EUR". */
  currency: string
}

/**
 * Valor atual total da conta (cash + investimentos).
 * GET /equity/account/summary — rate limit 1 req / 5s.
 *
 * O campo `totalValue` da API está documentado de forma ambígua ("Investments
 * value..."), por isso somamos explicitamente cash + posições. Se a API mudar
 * e passar a incluir tudo em `totalValue`, esta soma continua correta.
 */
export async function fetchTrading212AccountSummary(
  apiKey: string,
  apiSecret: string,
): Promise<Trading212AccountSummary> {
  const res = await fetch(`${BASE_URL}/equity/account/summary`, {
    headers: { Authorization: buildAuthHeader(apiKey, apiSecret) },
    cache: "no-store",
  })

  if (!res.ok) throw errorForStatus(res.status)

  const raw = await res.json()
  const cash = raw?.cash ?? {}
  const investments = raw?.investments ?? {}

  const totalValue =
    num(cash.availableToTrade) +
    num(cash.inPies) +
    num(cash.reservedForOrders) +
    num(investments.currentValue)

  return {
    totalValue,
    currency: typeof raw?.currency === "string" && raw.currency ? raw.currency : "EUR",
  }
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

// ── Histórico de movimentos de dinheiro ────────────────────────────────────

/** Movimento de caixa tal como vem de GET /equity/history/transactions. */
export type Trading212Transaction = {
  reference: string
  type: string
  amount: number
  currency: string
  dateTime: Date
}

export type Trading212TransactionPage = {
  transactions: Trading212Transaction[]
  /**
   * Caminho da próxima página, para retomar numa chamada posterior.
   * `null` = chegámos ao fim do histórico.
   */
  nextPath: string | null
}

const TRANSACTIONS_PATH = "/equity/history/transactions"
const TRANSACTIONS_PAGE_SIZE = 50
/**
 * A API permite *bursts*: 6 pedidos podem sair de seguida dentro da mesma
 * janela de 1 minuto, sem esperar entre eles (ver "Rate Limiting" nas docs).
 * 6 × 50 = 300 movimentos por chamada, o que cabe folgadamente no timeout de
 * uma serverless function. Quem tiver mais histórico recebe `hasMore: true` e
 * a sincronização continua na chamada seguinte, a partir do último cursor.
 */
const MAX_PAGES_PER_CALL = 6

/**
 * A doc diz que `nextPagePath` vem como caminho absoluto ("/api/v0/..."), mas
 * a API devolve só a query string ("limit=50&cursor=...&time=..."). Aceitamos
 * as várias formas para isto não partir quando eles corrigirem.
 */
export function normalizeNextPagePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const value = raw.trim()

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value)
      return `${url.pathname}${url.search}`
    } catch {
      return null
    }
  }
  // Caminho absoluto da API — devolvemos só a parte a seguir a /api/v0,
  // porque BASE_URL já inclui esse prefixo.
  if (value.startsWith("/api/v0")) return value.slice("/api/v0".length)
  if (value.startsWith("/")) return value
  if (value.startsWith("?")) return `${TRANSACTIONS_PATH}${value}`
  return `${TRANSACTIONS_PATH}?${value}`
}

function parseTransaction(raw: unknown): Trading212Transaction | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>

  if (typeof item.type !== "string") return null
  if (typeof item.amount !== "number" || !Number.isFinite(item.amount)) return null
  if (typeof item.dateTime !== "string") return null

  const dateTime = new Date(item.dateTime)
  if (Number.isNaN(dateTime.getTime())) return null

  return {
    reference: typeof item.reference === "string" ? item.reference : `${item.type}-${item.dateTime}`,
    type: item.type,
    amount: item.amount,
    currency: typeof item.currency === "string" ? item.currency : "",
    dateTime,
  }
}

/**
 * Histórico de depósitos/levantamentos, paginado (do mais recente para o mais antigo).
 * GET /equity/history/transactions — rate limit 6 req / 1m0s.
 *
 * ⚠️ O parâmetro `time` NÃO é usado, apesar de documentado. Na API live devolve
 * sempre HTTP 400 ("Bad filtering arguments"), em todos os formatos testados:
 * ISO com e sem milissegundos, ISO com offset, só data, epoch em segundos e em
 * milissegundos. A API está em beta — se vier a funcionar, é a via natural para
 * a sincronização incremental. Até lá, o incremental faz-se com `onPage`: quem
 * chama compara com o que já tem em BD e manda parar assim que reconhece tudo.
 *
 * `onPage` é invocado após cada página; devolver `false` interrompe a paginação.
 *
 * Itens malformados são descartados em silêncio em vez de rebentar a
 * sincronização inteira: um movimento estranho não deve impedir o utilizador
 * de ver o retorno dos outros.
 */
export async function fetchTrading212Transactions(
  apiKey: string,
  apiSecret: string,
  options: {
    startPath?: string
    onPage?: (pageTransactions: Trading212Transaction[]) => Promise<boolean> | boolean
  } = {},
): Promise<Trading212TransactionPage> {
  const authorization = buildAuthHeader(apiKey, apiSecret)
  const transactions: Trading212Transaction[] = []
  const seenPaths = new Set<string>()

  let path = options.startPath || `${TRANSACTIONS_PATH}?limit=${TRANSACTIONS_PAGE_SIZE}`

  for (let page = 0; page < MAX_PAGES_PER_CALL; page++) {
    // A API já devolveu este caminho antes — protege contra ciclo infinito.
    if (seenPaths.has(path)) return { transactions, nextPath: null }
    seenPaths.add(path)

    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: authorization },
      cache: "no-store",
    })

    if (res.status === 429) {
      // Rate limit a meio do burst: devolvemos o que já temos e guardamos o
      // caminho atual para retomar daqui, em vez de falhar a sincronização toda.
      return { transactions, nextPath: path }
    }
    if (!res.ok) throw errorForStatus(res.status)

    const payload = await res.json()
    const items = Array.isArray(payload?.items) ? payload.items : []

    const pageTransactions: Trading212Transaction[] = []
    for (const item of items) {
      const parsed = parseTransaction(item)
      if (parsed) pageTransactions.push(parsed)
    }
    transactions.push(...pageTransactions)

    const next = normalizeNextPagePath(payload?.nextPagePath)

    // Quem chama pode interromper aqui (ex: já reconheceu todos os movimentos
    // desta página, logo o resto do histórico também já está em BD).
    if (options.onPage && !(await options.onPage(pageTransactions))) {
      return { transactions, nextPath: null }
    }

    if (!next) return { transactions, nextPath: null }
    path = next
  }

  // Esgotámos o burst permitido e ainda havia `nextPagePath`.
  return { transactions, nextPath: path }
}

function errorForStatus(status: number): Trading212ApiError {
  if (status === 401 || status === 403) {
    return new Trading212ApiError(status, "Invalid Trading212 API credentials or missing permissions")
  }
  if (status === 429) {
    return new Trading212ApiError(status, "Trading212 API rate limit exceeded")
  }
  return new Trading212ApiError(status, `Trading212 API error: ${status}`)
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
