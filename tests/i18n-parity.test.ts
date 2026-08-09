import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

/* NOTA: não importamos `@/i18n/routing` — esse módulo chama `createNavigation()`,
   que puxa `next/navigation` e não resolve fora do runtime do Next. Lemos a lista
   de locales do próprio source, que é a mesma fonte de verdade. */

/**
 * Guarda de paridade de i18n.
 *
 * Porquê: a 2026-08-05 a produção servia 33 chaves em cru como texto visível
 * (`marketing.pricing.free.f1`, `marketing.faq.q1`, …) em 7 dos 9 locales — a
 * secção de preços e o FAQ INTEIROS. O `messages/pt.json` ganhou o namespace
 * `marketing` e os outros ficheiros nunca acompanharam; o next-intl, sem
 * `getMessageFallback`, imprime o caminho da chave. Ninguém deu por isso porque
 * nada falhava — nem build, nem tipos, nem testes.
 *
 * Este teste torna essa classe de bug impossível de voltar a fazer deploy:
 * qualquer chave presente no locale de referência (pt) tem de existir em todos
 * os outros locales anunciados em `routing.locales`.
 */

const MESSAGES_DIR = path.resolve(import.meta.dirname, "..", "messages")
const ROUTING_SRC = path.resolve(import.meta.dirname, "..", "i18n", "routing.ts")

/** Lê `locales: [...]` de i18n/routing.ts sem executar o módulo. */
function declaredLocales(): string[] {
  const src = readFileSync(ROUTING_SRC, "utf8")
  const match = src.match(/locales:\s*\[([^\]]*)\]/)
  if (!match) throw new Error("não consegui ler `locales` de i18n/routing.ts")
  return [...match[1].matchAll(/['"]([a-z-]+)['"]/g)].map((m) => m[1])
}

const LOCALES = declaredLocales()

/** Locale de referência: o PT é o primário do produto (CLAUDE.md §2). */
const REFERENCE_LOCALE = "pt"

type Json = Record<string, unknown>

function readLocale(locale: string): Json {
  return JSON.parse(readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8")) as Json
}

/** Achata para caminhos com ponto: { a: { b: "x" } } -> ["a.b"]. */
function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix]
  // Arrays contam como uma folha só — a ordem/​comprimento é problema da tradução,
  // não da paridade de chaves (ex: pricing.features.free é um array de strings).
  if (Array.isArray(value)) return [prefix]
  return Object.entries(value as Json).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  )
}

describe("paridade de i18n entre locales", () => {
  const reference = flatten(readLocale(REFERENCE_LOCALE)).sort()

  it("o locale de referência tem chaves", () => {
    expect(reference.length).toBeGreaterThan(100)
  })

  it("não há ficheiros de mensagens órfãos (locale não anunciado em routing)", () => {
    const onDisk = readdirSync(MESSAGES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
    expect(onDisk).toEqual([...LOCALES].sort())
  })

  for (const locale of LOCALES) {
    if (locale === REFERENCE_LOCALE) continue

    it(`"${locale}" não tem chaves em falta face a "${REFERENCE_LOCALE}"`, () => {
      const localeKeys = new Set(flatten(readLocale(locale)))
      const missing = reference.filter((k) => !localeKeys.has(k))

      // Mensagem de falha útil: em produção, cada uma destas chaves renderiza
      // o próprio caminho como texto visível ao utilizador.
      expect(
        missing,
        `${missing.length} chave(s) em falta em messages/${locale}.json — ` +
          `cada uma renderiza o caminho literal na UI:\n  ${missing.join("\n  ")}`,
      ).toEqual([])
    })

    it(`"${locale}" não tem chaves a mais (copy morta)`, () => {
      const referenceKeys = new Set(reference)
      const extra = flatten(readLocale(locale)).filter((k) => !referenceKeys.has(k))
      expect(
        extra,
        `${extra.length} chave(s) em messages/${locale}.json que não existem em ` +
          `${REFERENCE_LOCALE}.json — copy morta ou renomeada:\n  ${extra.join("\n  ")}`,
      ).toEqual([])
    })
  }
})
