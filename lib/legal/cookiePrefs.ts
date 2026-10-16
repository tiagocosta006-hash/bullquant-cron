/** Formato do cookie de preferências (partilhado pelo servidor e pelo banner). Puro: sem React. */
export type PrefsCookies = { analytics: boolean; marketing: boolean }

export const NOME_COOKIE_PREFS = "cookie_prefs"
export const EVENTO_DEFINICOES_COOKIES = "bv:cookie-settings"

/** `v1.a1m0` → { analytics: true, marketing: false }. Qualquer outra coisa (inclui o antigo "true") não vale. */
export function lerPrefs(valor: string | undefined): PrefsCookies | null {
  if (!valor) return null
  const m = /^v1\.a([01])m([01])$/.exec(valor)
  return m ? { analytics: m[1] === "1", marketing: m[2] === "1" } : null
}

export const serializarPrefs = (p: PrefsCookies) => `v1.a${p.analytics ? 1 : 0}m${p.marketing ? 1 : 0}`
