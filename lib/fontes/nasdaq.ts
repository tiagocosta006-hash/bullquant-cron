/**
 * API pública do Nasdaq.com (a que o próprio site deles usa): sem chave.
 *
 * Decisão do Costa (2026-11-21): usar as APIs públicas e gratuitas em vez da FMP.
 * Cobre cotações, histórico de 10 anos, estimativas de EPS dos analistas (4 anos),
 * preço-alvo, calendários de dividendos e macro.
 *
 * ── Armadilhas medidas a 2026-11-21 ───────────────────────────────────────
 * 1. Sem cabeçalhos de browser (User-Agent, Origin, Referer) a resposta fica pendurada.
 * 2. Os números vêm como texto: "$342.56", "-1.90%", "40,906,860", "N/A".
 * 3. Datas em formato americano: "11/19/2026".
 * 4. O lote de cotações (`quote/watchlist`) aceita no máximo 20 símbolos por pedido.
 * 5. Em fim de semana há nós que servem o fecho do dia anterior: a cotação de uma
 *    empresa vem da Finnhub (lib/fmp/mercado.ts) e o histórico é completado com ela.
 * 6. Classes de ações com ponto ("brk.b") funcionam tal como estão na nossa base.
 */

const BASE = "https://api.nasdaq.com/api"

const CABECALHOS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
}

/** O `data` da resposta, ou null (erro de rede, HTTP ≠ 200, ou `data: null`). */
export async function nasdaqGet<T>(
  caminho: string,
  params: Record<string, string | string[]>,
  revalidate: number,
): Promise<T | null> {
  const url = new URL(`${BASE}/${caminho}`)
  for (const [k, v] of Object.entries(params)) {
    for (const x of Array.isArray(v) ? v : [v]) url.searchParams.append(k, x)
  }
  try {
    const resp = await fetch(url, {
      headers: CABECALHOS,
      next: { revalidate, tags: ["nasdaq"] },
      signal: AbortSignal.timeout(15_000),
    })
    if (!resp.ok) {
      console.error(`[nasdaq] ${caminho} → HTTP ${resp.status}`)
      return null
    }
    const corpo = (await resp.json()) as { data?: T | null }
    return corpo?.data ?? null
  } catch (e) {
    console.error(`[nasdaq] ${caminho}: ${(e as Error).message}`)
    return null
  }
}

/** "$1,234.5" · "-1.90%" · "40,906,860" · 12.3 → número; "N/A", "", "--" → null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string") return null
  const s = v.replace(/[$,%\s]/g, "")
  if (!s || /^(N\/?A|NA|--|-)$/i.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** "11/19/2026" → "2026-11-19"; outra coisa → null. */
export function dataUs(v: unknown): string | null {
  if (typeof v !== "string") return null
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null
}

/** "Sep 2027" → "2027-09-30" (fim do mês). */
export function fimDoMes(v: unknown): string | null {
  if (typeof v !== "string") return null
  const m = v.trim().match(/^([A-Za-z]{3})\w*\s+(\d{4})$/)
  if (!m) return null
  const mes = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase())
  if (mes < 0) return null
  const fim = new Date(Date.UTC(Number(m[2]), mes + 1, 0))
  return fim.toISOString().slice(0, 10)
}

/** Ticker da base → símbolo do Nasdaq (minúsculas; o ponto das classes fica). */
export function simboloNasdaq(ticker: string): string {
  return ticker.trim().toLowerCase()
}
