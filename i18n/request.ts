import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

/** Locale de recurso quando uma chave falta no locale pedido. */
const FALLBACK_LOCALE = 'pt'

type Messages = Record<string, unknown>

/** Navega um caminho com pontos ("marketing.pricing.title") num objeto. */
function lookup(messages: Messages, keyPath: string): unknown {
  return keyPath
    .split('.')
    .reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object' && part in (acc as Messages)) {
        return (acc as Messages)[part]
      }
      return undefined
    }, messages)
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale
  }

  const messages = (await import(`../messages/${locale}.json`)).default as Messages
  const fallbackMessages =
    locale === FALLBACK_LOCALE
      ? messages
      : ((await import(`../messages/${FALLBACK_LOCALE}.json`)).default as Messages)

  return {
    locale,
    messages,
    /**
     * Rede de segurança para chaves em falta.
     *
     * Por defeito o next-intl imprime o CAMINHO DA CHAVE como texto visível.
     * A 2026-08-05 isso pôs `marketing.pricing.free.f1` e o FAQ inteiro à vista
     * em produção, em 7 locales. A prevenção real é o teste de paridade
     * (tests/i18n-parity.test.ts), que falha o build; isto é a segunda linha:
     * mesmo que algo escape, o utilizador vê PT — nunca um caminho de chave.
     */
    getMessageFallback({ key, namespace }) {
      const fullKey = namespace ? `${namespace}.${key}` : key
      const fromFallback = lookup(fallbackMessages, fullKey)
      if (typeof fromFallback === 'string') return fromFallback

      // Sem tradução em lado nenhum: string vazia degrada melhor do que
      // "marketing.pricing.free.f1" no meio de uma tabela de preços.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[i18n] chave sem tradução: ${fullKey} (locale: ${locale})`)
      }
      return ''
    },
  }
})
