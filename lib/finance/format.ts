/**
 * Helpers de formatação financeira — JS puro, sem dependências de UI.
 * `null`/`undefined`/`NaN` devolvem "N/A" (nunca 0).
 *
 * Aceitam `string` porque campos `Decimal` do Prisma chegam ao cliente como
 * string após serialização JSON (ex: fundamental.roic = "0.954015") — usar
 * `Number.isFinite` diretamente numa string rejeita-a sempre (devolve false),
 * mesmo quando o valor é numericamente válido.
 */

const NA = "N/A"

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const num = typeof value === "string" ? Number(value) : value
  return Number.isFinite(num) ? num : null
}

export function getCurrencySymbol(currency: string | null | undefined): string {
  if (!currency) return "$"
  switch (currency.toUpperCase()) {
    case "EUR": return "€"
    case "GBP": return "£"
    case "DKK": return "kr."
    case "CHF": return "CHF"
    case "CAD": return "CA$"
    case "JPY": return "¥"
    default: return "$"
  }
}

/** Formata valores grandes em B / M / K (ex: 1_500_000_000 → "1.50B"). */
export function formatLargeNumber(value: number | string | null | undefined, currency = "$"): string {
  const num = toFiniteNumber(value)
  if (num === null) return NA
  const abs = Math.abs(num)
  const sign = num < 0 ? "-" : ""
  if (abs >= 1e12) return `${sign}${currency}${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}${currency}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${currency}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}${currency}${(abs / 1e3).toFixed(2)}K`
  return `${sign}${currency}${abs.toFixed(2)}`
}

/** Preço por ação (ex: 187.42 → "$187.42"). */
export function formatPrice(value: number | string | null | undefined, currency = "$"): string {
  const num = toFiniteNumber(value)
  if (num === null) return NA
  return `${currency}${num.toFixed(2)}`
}

/** Decimal → percentagem (ex: 0.1 → "10.0%"). */
export function formatPercent(value: number | string | null | undefined, digits = 1): string {
  const num = toFiniteNumber(value)
  if (num === null) return NA
  return `${(num * 100).toFixed(digits)}%`
}
