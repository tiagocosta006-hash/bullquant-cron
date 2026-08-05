import { describe, it, expect, vi, afterEach } from "vitest"
import {
  normalizeNextPagePath,
  fetchTrading212Transactions,
  fetchTrading212AccountSummary,
  Trading212ApiError,
} from "@/lib/broker/trading212"

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Encadeia respostas de fetch, uma por chamada, e regista os URLs pedidos. */
function stubFetchSequence(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: string[] = []
  let index = 0
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url)
    const response = responses[Math.min(index++, responses.length - 1)]
    const status = response.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response.body,
    }
  }))
  return calls
}

describe("normalizeNextPagePath — a doc e a API discordam", () => {
  it("query string pura (o que a API devolve mesmo) ganha o caminho do endpoint", () => {
    // Documentado como caminho absoluto, mas a API real devolve só isto.
    expect(normalizeNextPagePath("limit=50&cursor=019e3377&time=2026-05-17T01:05:31.201Z"))
      .toBe("/equity/history/transactions?limit=50&cursor=019e3377&time=2026-05-17T01:05:31.201Z")
  })

  it("caminho absoluto com /api/v0 perde o prefixo (BASE_URL já o tem)", () => {
    expect(normalizeNextPagePath("/api/v0/equity/history/transactions?limit=2&cursor=176"))
      .toBe("/equity/history/transactions?limit=2&cursor=176")
  })

  it("caminho absoluto sem /api/v0 fica como está", () => {
    expect(normalizeNextPagePath("/equity/history/transactions?limit=2"))
      .toBe("/equity/history/transactions?limit=2")
  })

  it("URL completo é reduzido a caminho + query", () => {
    expect(normalizeNextPagePath("https://live.trading212.com/api/v0/equity/history/transactions?limit=5"))
      .toBe("/api/v0/equity/history/transactions?limit=5")
  })

  it("query string começada por '?'", () => {
    expect(normalizeNextPagePath("?limit=50&cursor=x"))
      .toBe("/equity/history/transactions?limit=50&cursor=x")
  })

  it("fim do histórico e valores inválidos ⇒ null", () => {
    expect(normalizeNextPagePath(null)).toBeNull()
    expect(normalizeNextPagePath(undefined)).toBeNull()
    expect(normalizeNextPagePath("")).toBeNull()
    expect(normalizeNextPagePath("   ")).toBeNull()
    expect(normalizeNextPagePath(123)).toBeNull()
  })
})

describe("fetchTrading212Transactions", () => {
  const tx = (reference: string, type: string, amount: number, dateTime: string) =>
    ({ reference, type, amount, currency: "EUR", dateTime })

  it("segue a paginação até nextPagePath ser null", async () => {
    const calls = stubFetchSequence([
      { body: { items: [tx("a", "DEPOSIT", 1000, "2024-04-28T09:00:00Z")], nextPagePath: "limit=50&cursor=1" } },
      { body: { items: [tx("b", "DEPOSIT", 500, "2024-05-20T09:00:00Z")], nextPagePath: null } },
    ])

    const result = await fetchTrading212Transactions("k", "s")
    expect(result.transactions).toHaveLength(2)
    expect(result.nextPath).toBeNull()
    expect(calls).toHaveLength(2)
    // A 2ª chamada usou o cursor normalizado, não a query string crua.
    expect(calls[1]).toContain("/equity/history/transactions?limit=50&cursor=1")
  })

  it("para ao fim de 6 páginas e devolve o cursor para retomar", async () => {
    // Histórico infinito: cada página devolve um cursor novo, para o guard
    // anti-ciclo não interferir e conseguirmos observar o limite do burst.
    const calls: string[] = []
    let page = 0
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url)
      page++
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [tx(`x${page}`, "DEPOSIT", 10, "2024-01-01T00:00:00Z")],
          nextPagePath: `limit=50&cursor=p${page}`,
        }),
      }
    }))

    const result = await fetchTrading212Transactions("k", "s")
    // Burst permitido pela API = 6 pedidos por minuto neste endpoint.
    expect(calls).toHaveLength(6)
    expect(result.transactions).toHaveLength(6)
    expect(result.nextPath).toBe("/equity/history/transactions?limit=50&cursor=p6")
  })

  it("retoma a partir de startPath em vez de recomeçar do princípio", async () => {
    const calls = stubFetchSequence([{ body: { items: [], nextPagePath: null } }])
    await fetchTrading212Transactions("k", "s", { startPath: "/equity/history/transactions?limit=50&cursor=abc" })
    expect(calls[0]).toContain("cursor=abc")
  })

  it("nunca envia `time` — a API devolve 400 nesse parâmetro, apesar de documentado", async () => {
    const calls = stubFetchSequence([{ body: { items: [], nextPagePath: null } }])
    await fetchTrading212Transactions("k", "s")
    expect(calls[0]).not.toContain("time=")
  })

  it("onPage a devolver false interrompe a paginação (sincronização incremental)", async () => {
    const calls: string[] = []
    let page = 0
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url)
      page++
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [tx(`x${page}`, "DEPOSIT", 10, "2024-01-01T00:00:00Z")],
          nextPagePath: `limit=50&cursor=p${page}`,
        }),
      }
    }))

    const seen: number[] = []
    const result = await fetchTrading212Transactions("k", "s", {
      onPage: pageTransactions => {
        seen.push(pageTransactions.length)
        return seen.length < 2 // para na 2ª página
      },
    })

    expect(calls).toHaveLength(2)
    expect(seen).toEqual([1, 1])
    expect(result.nextPath).toBeNull()
  })

  it("onPage recebe só os movimentos da página, não o acumulado", async () => {
    stubFetchSequence([
      { body: { items: [tx("a", "DEPOSIT", 1, "2024-01-01T00:00:00Z")], nextPagePath: "limit=50&cursor=1" } },
      { body: { items: [tx("b", "DEPOSIT", 2, "2024-01-02T00:00:00Z"), tx("c", "DEPOSIT", 3, "2024-01-03T00:00:00Z")], nextPagePath: null } },
    ])

    const pages: string[][] = []
    await fetchTrading212Transactions("k", "s", {
      onPage: page => { pages.push(page.map(t => t.reference)); return true },
    })

    expect(pages).toEqual([["a"], ["b", "c"]])
  })

  it("descarta itens malformados sem rebentar a sincronização", async () => {
    stubFetchSequence([{
      body: {
        items: [
          tx("ok", "DEPOSIT", 1000, "2024-04-28T09:00:00Z"),
          { reference: "sem-amount", type: "DEPOSIT", dateTime: "2024-01-01T00:00:00Z" },
          { reference: "amount-nao-numerico", type: "DEPOSIT", amount: "1000", dateTime: "2024-01-01T00:00:00Z" },
          { reference: "data-ilegivel", type: "DEPOSIT", amount: 10, dateTime: "nao-e-data" },
          { reference: "sem-tipo", amount: 10, dateTime: "2024-01-01T00:00:00Z" },
          "isto-nem-e-um-objeto",
          null,
        ],
        nextPagePath: null,
      },
    }])

    const result = await fetchTrading212Transactions("k", "s")
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].reference).toBe("ok")
  })

  it("items em falta ou não-array ⇒ zero transações, sem exceção", async () => {
    stubFetchSequence([{ body: { nextPagePath: null } }])
    await expect(fetchTrading212Transactions("k", "s")).resolves.toMatchObject({ transactions: [] })

    stubFetchSequence([{ body: { items: "nao-e-lista", nextPagePath: null } }])
    await expect(fetchTrading212Transactions("k", "s")).resolves.toMatchObject({ transactions: [] })
  })

  it("429 a meio devolve o que já leu e o caminho para retomar", async () => {
    stubFetchSequence([
      { body: { items: [tx("a", "DEPOSIT", 1000, "2024-04-28T09:00:00Z")], nextPagePath: "limit=50&cursor=1" } },
      { status: 429 },
    ])

    const result = await fetchTrading212Transactions("k", "s")
    expect(result.transactions).toHaveLength(1)
    expect(result.nextPath).toBe("/equity/history/transactions?limit=50&cursor=1")
  })

  it("nextPagePath repetido não causa ciclo infinito", async () => {
    const calls = stubFetchSequence([
      { body: { items: [], nextPagePath: "limit=50&cursor=mesmo" } },
      { body: { items: [], nextPagePath: "limit=50&cursor=mesmo" } },
    ])
    const result = await fetchTrading212Transactions("k", "s")
    expect(calls.length).toBeLessThanOrEqual(3)
    expect(result.nextPath).toBeNull()
  })

  it("401/403 lançam Trading212ApiError", async () => {
    stubFetchSequence([{ status: 401 }])
    await expect(fetchTrading212Transactions("k", "s")).rejects.toBeInstanceOf(Trading212ApiError)

    stubFetchSequence([{ status: 403 }])
    await expect(fetchTrading212Transactions("k", "s")).rejects.toBeInstanceOf(Trading212ApiError)
  })

  it("envia Basic auth, nunca a chave em claro", async () => {
    const sent: Array<{ url: string; authorization: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      sent.push({ url, authorization: init.headers.Authorization })
      return { ok: true, status: 200, json: async () => ({ items: [], nextPagePath: null }) }
    }))

    await fetchTrading212Transactions("minha-chave", "meu-segredo")

    const { url, authorization } = sent[0]
    expect(authorization).toBe(`Basic ${Buffer.from("minha-chave:meu-segredo").toString("base64")}`)
    expect(authorization).not.toContain("minha-chave")
    expect(authorization).not.toContain("meu-segredo")
    // A chave também nunca pode viajar no URL (acabaria em logs de servidor).
    expect(url).not.toContain("minha-chave")
    expect(url).not.toContain("meu-segredo")
  })
})

describe("fetchTrading212AccountSummary", () => {
  it("soma cash + posições em vez de confiar no totalValue ambíguo da doc", async () => {
    stubFetchSequence([{
      body: {
        cash: { availableToTrade: 15.03, inPies: 0, reservedForOrders: 0 },
        currency: "EUR",
        investments: { currentValue: 4648.54 },
        totalValue: 999, // valor incoerente de propósito — deve ser ignorado
      },
    }])

    const summary = await fetchTrading212AccountSummary("k", "s")
    expect(summary.totalValue).toBeCloseTo(4663.57, 2)
    expect(summary.currency).toBe("EUR")
  })

  it("campos em falta contam como 0, e a moeda cai para EUR", async () => {
    stubFetchSequence([{ body: { investments: { currentValue: 100 } } }])
    const summary = await fetchTrading212AccountSummary("k", "s")
    expect(summary.totalValue).toBe(100)
    expect(summary.currency).toBe("EUR")
  })

  it("valores não numéricos não produzem NaN", async () => {
    stubFetchSequence([{
      body: { cash: { availableToTrade: "15.03", inPies: null }, investments: { currentValue: 100 } },
    }])
    const summary = await fetchTrading212AccountSummary("k", "s")
    expect(Number.isNaN(summary.totalValue)).toBe(false)
    expect(summary.totalValue).toBe(100)
  })

  it("401 lança Trading212ApiError", async () => {
    stubFetchSequence([{ status: 401 }])
    await expect(fetchTrading212AccountSummary("k", "s")).rejects.toBeInstanceOf(Trading212ApiError)
  })
})
