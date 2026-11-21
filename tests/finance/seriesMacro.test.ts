import { afterEach, describe, expect, it, vi } from "vitest"
import {
  carregarSeriesReduzidas,
  homologa,
  parsearCsvFred,
  resolverSerieFred,
} from "@/lib/finance/seriesMacro"

describe("séries macro — variação homóloga", () => {
  it("compara com o mesmo mês do ano anterior", () => {
    const r = homologa([
      { date: "2025-08-01", value: 323.291 },
      { date: "2026-08-01", value: 334.131 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].value).toBeCloseTo(3.353, 2)
  })

  it("um mês em falta na série (CPI de outubro de 2025) não desloca a comparação", () => {
    // Jul/25, Ago/25, Set/25, (Out/25 em falta), Nov/25 … Jul/26, Ago/26
    const meses = ["2025-07", "2025-08", "2025-09", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]
    const valores = [322.169, 323.291, 324.245, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334.131]
    const r = homologa(meses.map((m, i) => ({ date: `${m}-01`, value: valores[i] })))
    // Só Jul/26 e Ago/26 têm o ponto de há um ano
    expect(r.map((p) => p.date)).toEqual(["2026-07-01", "2026-08-01"])
    expect(r[1].value).toBeCloseTo((334.131 / 323.291 - 1) * 100, 6)
  })

  it("sem ponto de há um ano não inventa variação", () => {
    expect(homologa([{ date: "2026-08-01", value: 334 }])).toEqual([])
  })
})

describe("séries macro — parsing de CSV da FRED e carregamento", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('converte "." e células vazias para null (nunca 0), mantendo zeros reais e negativos', () => {
    const csv = [
      "observation_date,T10Y2Y",
      "2026-11-09,0.25",
      "2026-11-10,0.00",
      "2026-11-11,.",
      "2026-11-12,",
      "2026-11-13,-0.38\r",
      "",
    ].join("\n")

    expect(parsearCsvFred(csv)).toEqual([
      { date: "2026-11-09", value: 0.25 },
      { date: "2026-11-10", value: 0 },
      { date: "2026-11-11", value: null },
      { date: "2026-11-12", value: null },
      { date: "2026-11-13", value: -0.38 },
    ])
  })

  it("mapeia tickers do site, taxas do Tesouro e nomes legados para as séries FRED corretas", () => {
    expect(resolverSerieFred("^DGS10")).toEqual({ id: "DGS10", calcularHomologa: false })
    expect(resolverSerieFred("year10")).toEqual({ id: "DGS10", calcularHomologa: false })
    expect(resolverSerieFred("^DGS1MO")?.id).toBe("DGS1MO")
    expect(resolverSerieFred("DGS3MO")?.id).toBe("DGS3MO")
    expect(resolverSerieFred("DGS2")?.id).toBe("DGS2")
    expect(resolverSerieFred("DGS5")?.id).toBe("DGS5")
    expect(resolverSerieFred("^DGS30")?.id).toBe("DGS30")
    expect(resolverSerieFred("^T10Y2Y")?.id).toBe("T10Y2Y")
    expect(resolverSerieFred("^FEDFUNDS")?.id).toBe("FEDFUNDS")
    expect(resolverSerieFred("federalFunds")?.id).toBe("FEDFUNDS")
    expect(resolverSerieFred("^UNRATE")?.id).toBe("UNRATE")
    expect(resolverSerieFred("unemploymentRate")?.id).toBe("UNRATE")
    expect(resolverSerieFred("CPI")).toEqual({ id: "CPIAUCSL", calcularHomologa: false })
    expect(resolverSerieFred("^CPI_YOY")).toEqual({ id: "CPIAUCSL", calcularHomologa: true })
    expect(resolverSerieFred("realGDP")).toEqual({ id: "GDPC1", calcularHomologa: false })
    expect(resolverSerieFred("^GDP_YOY")).toEqual({ id: "GDPC1", calcularHomologa: true })
    expect(resolverSerieFred("GDP")).toEqual({ id: "GDP", calcularHomologa: false })
    expect(resolverSerieFred("^VIX")).toEqual({ id: "VIXCLS", calcularHomologa: false })
  })

  it("carregarSeriesReduzidas lê CSVs da FRED com Data Cache, descarta '.' e calcula YoY", async () => {
    const csvPorId: Record<string, string> = {
      DGS10: [
        "observation_date,DGS10",
        "2026-11-10,4.98",
        "2026-11-11,.",
        "2026-11-12,5.10",
        "2026-11-13,5.15",
      ].join("\n"),
      CPIAUCSL: [
        "observation_date,CPIAUCSL",
        "2025-08-01,323.291",
        "2025-09-01,324.245",
        "2025-10-01,.",
        "2025-11-01,325.063",
        "2026-08-01,334.131",
        "2026-09-01,336.298",
        "2026-10-01,337.476",
      ].join("\n"),
      GDPC1: [
        "observation_date,GDPC1",
        "2025-07-01,24000.0",
        "2026-07-01,24600.0",
      ].join("\n"),
    }

    const fetchMock = vi.fn(async (url: string) => {
      const id = new URL(url).searchParams.get("id") ?? ""
      const corpo = csvPorId[id]
      if (!corpo) return new Response("Not found", { status: 404 })
      return new Response(corpo, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const res = await carregarSeriesReduzidas(
      ["^DGS10", "^CPI_YOY", "CPI", "^GDP_YOY", "^DESCONHECIDO"],
      { desde: new Date("2026-01-01T00:00:00Z") },
    )

    // "." em 2026-11-11 não entra como 0
    expect(res["^DGS10"]).toEqual([
      { date: "2026-11-10", value: 4.98 },
      { date: "2026-11-12", value: 5.1 },
      { date: "2026-11-13", value: 5.15 },
    ])

    // Outubro de 2025 em falta (".") → Out/2026 não tem comparação e não vira -100%
    expect(res["^CPI_YOY"].map((p) => p.date)).toEqual(["2026-08-01", "2026-09-01"])
    expect(res["^CPI_YOY"][0].value).toBeCloseTo((334.131 / 323.291 - 1) * 100, 6)

    // Série CPI bruta (nível) filtrada desde 2026-01-01, sem "."
    expect(res["CPI"]).toEqual([
      { date: "2026-08-01", value: 334.131 },
      { date: "2026-09-01", value: 336.298 },
      { date: "2026-10-01", value: 337.476 },
    ])

    // PIB real homólogo
    expect(res["^GDP_YOY"]).toHaveLength(1)
    expect(res["^GDP_YOY"][0].value).toBeCloseTo(2.5, 6)

    // Ticker desconhecido devolve array vazio sem rebentar
    expect(res["^DESCONHECIDO"]).toEqual([])

    // CPIAUCSL foi pedido uma única vez para ^CPI_YOY e CPI, com next.revalidate
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { next?: { revalidate?: number } }]
    expect(init?.next?.revalidate).toBeGreaterThan(0)
  })
})
