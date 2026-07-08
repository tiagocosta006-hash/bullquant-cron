/**
 * Helpers de formatação financeira — JS puro, sem dependências de UI.
 * `null`/`undefined`/`NaN` devolvem "N/A" (nunca 0).
 */

const NA = "N/A"

function isInvalid(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || !Number.isFinite(value)
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
export function formatLargeNumber(value: number | null | undefined, currency = "$"): string {
  if (isInvalid(value)) return NA
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1e12) return `${sign}${currency}${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}${currency}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${currency}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}${currency}${(abs / 1e3).toFixed(2)}K`
  return `${sign}${currency}${abs.toFixed(2)}`
}

/** Preço por ação (ex: 187.42 → "$187.42"). */
export function formatPrice(value: number | null | undefined, currency = "$"): string {
  if (isInvalid(value)) return NA
  return `${currency}${value.toFixed(2)}`
}

/** Decimal → percentagem (ex: 0.1 → "10.0%"). */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (isInvalid(value)) return NA
  return `${(value * 100).toFixed(digits)}%`
}
