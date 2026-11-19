import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  converterLinha,
  limparCacheCambio,
  parsearTaxasFrankfurter,
  taxaNaData,
  taxaParaUsd,
} from "@/lib/fmp/cambio";

describe("câmbio BCE via Frankfurter — direção da taxa e fins de semana", () => {
  beforeEach(() => {
    limparCacheCambio();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    limparCacheCambio();
  });

  it("mantém a direção moeda → USD para EUR (1 EUR ≈ 1,0892 USD, não o inverso)", () => {
    const mapa = parsearTaxasFrankfurter(
      {
        amount: 1,
        base: "EUR",
        start_date: "2024-03-14",
        end_date: "2024-03-15",
        rates: {
          "2024-03-14": { USD: 1.0925 },
          "2024-03-15": { USD: 1.0892 },
        },
      },
      "EUR",
    );

    expect(mapa.get("2024-03-15")).toBeCloseTo(1.0892, 6);
    expect(mapa.get("2024-03-15")!).toBeGreaterThan(1);
  });

  it("mantém a direção moeda → USD para DKK (1 DKK ≈ 0,14606 USD, reduz valores em coroas)", () => {
    const mapa = parsearTaxasFrankfurter(
      {
        amount: 1,
        base: "DKK",
        rates: {
          "2024-03-15": { USD: 0.14606 },
        },
      },
      "DKK",
    );

    const taxa = mapa.get("2024-03-15")!;
    expect(taxa).toBeCloseTo(0.14606, 6);
    // Novo Nordisk: EPS ~23,03 DKK → ~3,36 USD (nunca ~157 USD)
    expect(23.03 * taxa).toBeCloseTo(3.36, 1);
  });

  it("inverte se a resposta vier com base USD ou triangula se vier em pivot EUR", () => {
    const deBaseUsd = parsearTaxasFrankfurter(
      {
        amount: 1,
        base: "USD",
        rates: {
          "2024-03-15": { EUR: 1 / 1.0892 },
        },
      },
      "EUR",
    );
    expect(deBaseUsd.get("2024-03-15")).toBeCloseTo(1.0892, 6);

    const dePivotEur = parsearTaxasFrankfurter(
      {
        amount: 1,
        base: "EUR",
        rates: {
          "2024-03-15": { USD: 1.0892, DKK: 7.4572 },
        },
      },
      "DKK",
    );
    expect(dePivotEur.get("2024-03-15")).toBeCloseTo(1.0892 / 7.4572, 6);
  });

  it("aceita resposta de data única da Frankfurter", () => {
    const mapa = parsearTaxasFrankfurter(
      {
        amount: 1,
        base: "GBP",
        date: "2024-03-15",
        rates: { USD: 1.2753 },
      },
      "GBP",
    );

    expect(mapa.get("2024-03-15")).toBeCloseTo(1.2753, 6);
  });

  it("fim de semana e feriados prolongados usam o último dia útil anterior", () => {
    const mapa = new Map<string, number>([
      ["2024-03-15", 1.0892], // sexta-feira
      ["2024-03-28", 1.0811], // quinta-feira antes da Páscoa (Sexta Santa e Segunda sem fixing)
    ]);

    expect(taxaNaData(mapa, new Date("2024-03-15T00:00:00Z"))).toBe(1.0892);
    expect(taxaNaData(mapa, new Date("2024-03-16T00:00:00Z"))).toBe(1.0892); // sábado
    expect(taxaNaData(mapa, new Date("2024-03-17T00:00:00Z"))).toBe(1.0892); // domingo
    expect(taxaNaData(mapa, new Date("2024-03-31T00:00:00Z"))).toBe(1.0811); // domingo de Páscoa
    expect(taxaNaData(mapa, new Date("2024-04-01T00:00:00Z"))).toBe(1.0811); // segunda-feira de Páscoa
  });

  it("recua no máximo 10 dias e devolve null quando não há cotações recentes", () => {
    const mapa = new Map<string, number>([["2024-03-01", 1.0813]]);
    expect(taxaNaData(mapa, new Date("2024-03-10T00:00:00Z"))).toBe(1.0813); // 9 dias atrás
    expect(taxaNaData(mapa, new Date("2024-03-11T00:00:00Z"))).toBeNull(); // 10 dias atrás (fora da janela 0..9)
  });

  it("taxaParaUsd devolve 1 para USD sem fazer pedidos de rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(taxaParaUsd("usd", new Date("2024-03-15T00:00:00Z"))).resolves.toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("taxaParaUsd usa a Frankfurter com next.revalidate, faz cache e recua no fim de semana", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          amount: 1,
          base: "EUR",
          start_date: "2024-01-02",
          end_date: "2024-12-31",
          rates: {
            "2024-03-15": { USD: 1.0892 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Sábado 2024-03-16 → deve devolver o fixing de sexta 2024-03-15
    const sabado = await taxaParaUsd("EUR", new Date("2024-03-16T00:00:00Z"));
    expect(sabado).toBeCloseTo(1.0892, 6);

    // Segunda chamada no mesmo ano → cache em memória evita novo fetch
    const sexta = await taxaParaUsd("eur", new Date("2024-03-15T00:00:00Z"));
    expect(sexta).toBeCloseTo(1.0892, 6);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { next?: { revalidate?: number } }];
    expect(url).toBe("https://api.frankfurter.dev/v1/2024-01-01..2024-12-31?base=EUR&symbols=USD");
    expect(init?.next?.revalidate).toBeGreaterThan(0);
  });

  it("taxaParaUsd recua para o ano anterior em feriado de 1 de janeiro se necessário", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("2025-01-01")) {
        return new Response(
          JSON.stringify({
            amount: 1,
            base: "EUR",
            rates: { "2025-01-02": { USD: 1.0321 } },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          amount: 1,
          base: "EUR",
          rates: { "2024-12-31": { USD: 1.0389 } },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const anoNovo = await taxaParaUsd("EUR", new Date("2025-01-01T00:00:00Z"));
    expect(anoNovo).toBeCloseTo(1.0389, 6);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("taxaParaUsd devolve null para moeda desconhecida (HTTP 404)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "not found" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(taxaParaUsd("XYZ", new Date("2024-03-15T00:00:00Z"))).resolves.toBeNull();
  });

  it("converterLinha multiplica valores monetários e preserva rácios adimensionais", () => {
    const linha = {
      revenue: 1000,
      netIncome: 200,
      grossMargin: 0.45,
      operatingMargin: 0.25,
      netMargin: 0.2,
      roic: 0.18,
      returnOnEquity: 0.22,
      sharesOutstanding: 500,
      fiscalYear: 2024,
      reportedCurrency: "EUR",
    };

    const convertida = converterLinha(linha, 1.1);
    expect(convertida.revenue).toBeCloseTo(1100, 6);
    expect(convertida.netIncome).toBeCloseTo(220, 6);
    expect(convertida.grossMargin).toBe(0.45);
    expect(convertida.operatingMargin).toBe(0.25);
    expect(convertida.netMargin).toBe(0.2);
    expect(convertida.roic).toBe(0.18);
    expect(convertida.returnOnEquity).toBe(0.22);
    expect(convertida.sharesOutstanding).toBe(500);
    expect(convertida.fiscalYear).toBe(2024);
    expect(convertida.reportedCurrency).toBe("EUR");
  });
});
