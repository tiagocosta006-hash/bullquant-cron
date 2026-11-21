import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: <T,>(fn: T) => fn,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import {
  betaFinnhub,
  extrairBetaFinnhub,
  extrairLogoFinnhub,
  limparCacheFinnhub,
  logoFinnhub,
  resolverLogoEmpresa,
  simboloFinnhub,
} from "@/lib/finnhub";
import { mapearNoticiasFinnhub, noticias } from "@/lib/fmp/mercado";
import {
  calendarioCorporativo,
  calendarioResultados,
  formatarSplitRatio,
  insiders,
  mapearInsidersFinnhub,
  mapearResultadosFinnhub,
  mapearSplitsLocais,
  resultadosDe,
} from "@/lib/fmp/calendario";

describe("cliente Finnhub — símbolos, logos e beta", () => {
  beforeEach(() => {
    limparCacheFinnhub();
    vi.stubEnv("FINNHUB_API_KEY", "test-finnhub-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    limparCacheFinnhub();
  });

  it("preserva o ponto nas classes de ações (ao contrário da FMP)", () => {
    expect(simboloFinnhub(" brk.b ")).toBe("BRK.B");
    expect(simboloFinnhub("aapl")).toBe("AAPL");
  });

  it("extrai beta de /stock/metric?metric=all e degrada para null quando inválido", () => {
    expect(extrairBetaFinnhub({ metric: { beta: 1.0760599 } })).toBeCloseTo(1.0760599, 6);
    expect(extrairBetaFinnhub({ metric: { beta: null } })).toBeNull();
    expect(extrairBetaFinnhub({ metric: {} })).toBeNull();
    expect(extrairBetaFinnhub(null)).toBeNull();
  });

  it("betaFinnhub pede /stock/metric com cache de 24h e degrada em falha", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ symbol: "AAPL", metric: { beta: 1.08 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(betaFinnhub("AAPL")).resolves.toBe(1.08);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, { next?: { revalidate?: number } }];
    expect(url.toString()).toContain("https://finnhub.io/api/v1/stock/metric");
    expect(url.searchParams.get("symbol")).toBe("AAPL");
    expect(url.searchParams.get("metric")).toBe("all");
    expect(init?.next?.revalidate).toBe(86_400);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    await expect(betaFinnhub("AAPL")).resolves.toBeNull();
  });

  it("logoFinnhub usa /stock/profile2 com cache de 30 dias, faz cache em memória e não guarda erros", async () => {
    expect(extrairLogoFinnhub({ logo: "https://static2.finnhub.io/file/aapl.png" })).toBe(
      "https://static2.finnhub.io/file/aapl.png",
    );
    expect(extrairLogoFinnhub({ logo: "" })).toBeNull();
    expect(extrairLogoFinnhub({ logo: "http://insecure.example/x.png" })).toBeNull();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ticker: "AAPL", logo: "https://static2.finnhub.io/file/AAPL.png" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    // 1.ª tentativa falha (com 1 retry) → devolve null e NÃO guarda em cache
    await expect(logoFinnhub("AAPL")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 2.ª tentativa recupera e guarda em cache
    await expect(logoFinnhub("AAPL")).resolves.toBe("https://static2.finnhub.io/file/AAPL.png");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [url, init] = fetchMock.mock.calls[2] as unknown as [URL, { next?: { revalidate?: number } }];
    expect(url.pathname).toBe("/api/v1/stock/profile2");
    expect(init?.next?.revalidate).toBe(30 * 86_400);

    // 3.ª tentativa vem da cache em memória sem novo fetch
    await expect(logoFinnhub("aapl")).resolves.toBe("https://static2.finnhub.io/file/AAPL.png");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("resolverLogoEmpresa substitui URL legado da FMP ou null via Finnhub", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ logo: "https://static2.finnhub.io/file/NVO.png" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // URL válido já na BD não gasta chamada à Finnhub
    await expect(
      resolverLogoEmpresa("AAPL", "https://static2.finnhub.io/file/AAPL.png"),
    ).resolves.toBe("https://static2.finnhub.io/file/AAPL.png");
    expect(fetchMock).not.toHaveBeenCalled();

    // URL legado da FMP ou null resolve pela Finnhub
    await expect(
      resolverLogoEmpresa("NVO", "https://images.financialmodelingprep.com/symbol/NVO.png"),
    ).resolves.toBe("https://static2.finnhub.io/file/NVO.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("degrada para null sem chamar rede quando FINNHUB_API_KEY falta", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(betaFinnhub("AAPL")).resolves.toBeNull();
    await expect(logoFinnhub("AAPL")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("notícias por empresa — Finnhub /company-news", () => {
  beforeEach(() => {
    vi.stubEnv("FINNHUB_API_KEY", "test-finnhub-key");
    vi.stubEnv("FMP_API_KEY", "test-fmp-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("mapeia campos da Finnhub, descarta inválidos e ordena do mais recente para o mais antigo", () => {
    const exemplo = [
      {
        category: "company",
        datetime: 1795000000,
        headline: "Notícia mais antiga",
        id: 101,
        image: "",
        source: "Reuters",
        summary: "Resumo antigo",
        url: "https://example.com/old",
      },
      {
        category: "company",
        datetime: 1795023449,
        headline: "  Apple lança novo chip  ",
        // sem id numérico → deve gerar id determinístico pelo URL
        image: "https://s.yimg.com/rz/apple.png",
        source: "Yahoo",
        summary: "  Resumo recente  ",
        url: "https://example.com/new",
      },
      {
        // sem url → descartada
        datetime: 1795099999,
        headline: "Sem URL",
        url: "",
      },
      {
        // timestamp inválido → descartada
        datetime: 0,
        headline: "Sem data",
        url: "https://example.com/bad",
      },
    ];

    const out = mapearNoticiasFinnhub(exemplo);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      datetime: 1795023449,
      headline: "Apple lança novo chip",
      summary: "Resumo recente",
      source: "Yahoo",
      url: "https://example.com/new",
      image: "https://s.yimg.com/rz/apple.png",
    });
    expect(out[0].id).toBeGreaterThan(0);
    expect(out[1]).toEqual({
      id: 101,
      datetime: 1795000000,
      headline: "Notícia mais antiga",
      summary: "Resumo antigo",
      source: "Reuters",
      url: "https://example.com/old",
      image: "",
    });
  });

  it("noticias() chama /company-news com símbolo Finnhub e degrada para [] em falha", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: 55,
            datetime: 1795018033,
            headline: "Berkshire publica carta",
            summary: "Detalhes",
            source: "CNBC",
            url: "https://example.com/brk",
            image: "",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await noticias("brk.b", 15);
    expect(res).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, { next?: { revalidate?: number } }];
    expect(url.pathname).toBe("/api/v1/company-news");
    expect(url.searchParams.get("symbol")).toBe("BRK.B");
    expect(init?.next?.revalidate).toBe(900);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(noticias("AAPL", 15)).resolves.toEqual([]);
  });
});

describe("calendário de resultados, splits locais e insiders — Finnhub", () => {
  beforeEach(() => {
    vi.stubEnv("FINNHUB_API_KEY", "test-finnhub-key");
    vi.stubEnv("FMP_API_KEY", "test-fmp-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("mapeia /calendar/earnings, preserva zeros e deduplica linhas repetidas", () => {
    const payload = {
      earningsCalendar: [
        {
          symbol: "AAPL",
          date: "2026-11-02",
          epsEstimate: 2.0263,
          epsActual: null,
          revenueEstimate: 115_661_591_921,
          revenueActual: null,
        },
        // Linha duplicada da Finnhub que traz os valores Actual em falta na anterior
        {
          symbol: "AAPL",
          date: "2026-11-02",
          epsEstimate: null,
          epsActual: 2.1,
          revenueEstimate: null,
          revenueActual: 114_477_000_000,
        },
        {
          symbol: "XYZ",
          date: "2026-11-03",
          epsEstimate: 0,
          epsActual: 0,
          revenueEstimate: 1000,
          revenueActual: null,
        },
      ],
    };

    const res = mapearResultadosFinnhub(payload);
    expect(res).toEqual([
      {
        ticker: "AAPL",
        date: "2026-11-02",
        epsEstimate: 2.0263,
        epsActual: 2.1,
        revenueEstimate: 115_661_591_921,
        revenueActual: 114_477_000_000,
      },
      {
        ticker: "XYZ",
        date: "2026-11-03",
        epsEstimate: 0,
        epsActual: 0,
        revenueEstimate: 1000,
        revenueActual: null,
      },
    ]);
  });

  it("resultadosDe preserva ticker pedido (ex.: BRK.B quando Finnhub devolve BRK.A) e ordena recente primeiro", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          earningsCalendar: [
            { symbol: "BRK.A", date: "2026-11-07", epsEstimate: 9253.77, epsActual: 8909.54, revenueEstimate: 100, revenueActual: 105 },
            { symbol: "BRK.A", date: "2027-02-26", epsEstimate: 8336.81, epsActual: null, revenueEstimate: 101, revenueActual: null },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await resultadosDe("BRK.B");
    expect(res.map((r) => [r.ticker, r.date, r.epsActual])).toEqual([
      ["BRK.B", "2027-02-26", null],
      ["BRK.B", "2026-11-07", 8909.54],
    ]);
  });

  it("calendarioResultados pede por semanas e filtra pelas empresas da carteira", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          earningsCalendar: [
            { symbol: "AAPL", date: "2026-11-02", epsEstimate: 2.0, epsActual: 2.1, revenueEstimate: 10, revenueActual: 11 },
            { symbol: "IGNORED", date: "2026-11-02", epsEstimate: 1.0, epsActual: 1.1, revenueEstimate: 5, revenueActual: 6 },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await calendarioResultados(
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-14T00:00:00Z"),
      new Set(["AAPL"]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // 2 semanas
    expect(res).toHaveLength(1);
    expect(res[0].ticker).toBe("AAPL");
  });

  it("mapeia splits locais a partir do formato {ticker: [{data, fator}]} e formata rácios", () => {
    expect(formatarSplitRatio(4)).toBe("4:1");
    expect(formatarSplitRatio(1.5)).toBe("3:2");
    expect(formatarSplitRatio(0.5)).toBe("1:2");
    expect(formatarSplitRatio(0.1)).toBe("1:10");
    expect(formatarSplitRatio(1.398)).toBe("1.398:1");

    const catalogo = {
      AAPL: [
        { data: "2014-06-09", fator: 7.0 },
        { data: "2020-08-31", fator: 4.0 },
      ],
      NVDA: [{ data: "2024-06-10", fator: 10.0 }],
      OUTRA: [{ data: "2020-08-31", fator: 2.0 }],
    };

    const eventos = mapearSplitsLocais(
      catalogo,
      new Date("2020-01-01T00:00:00Z"),
      new Date("2020-12-31T00:00:00Z"),
      new Set(["AAPL", "NVDA"]),
    );
    expect(eventos).toEqual([
      {
        ticker: "AAPL",
        type: "SPLIT",
        date: "2020-08-31",
        payDate: null,
        amount: null,
        splitRatio: "4:1",
      },
    ]);
  });

  it("calendarioCorporativo lê scripts/splits_eventos.json e devolve [] para splits quando o ficheiro não existe", async () => {
    const fetchMock = vi.fn(async () => new Response("err", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await calendarioCorporativo(
      new Date("2020-08-29T00:00:00Z"),
      new Date("2020-09-02T00:00:00Z"),
      new Set(["AAPL"]),
    );
    expect(res).toContainEqual({
      ticker: "AAPL",
      type: "SPLIT",
      date: "2020-08-31",
      payDate: null,
      amount: null,
      splitRatio: "4:1",
    });
    // Confirma que nenhuma chamada FMP foi para `splits-calendar`
    for (const [url] of fetchMock.mock.calls as unknown as Array<[URL]>) {
      expect(String(url)).not.toContain("splits-calendar");
    }

    // Sem ficheiro `scripts/splits_eventos.json`, degrada silenciosamente para []
    vi.spyOn(process, "cwd").mockReturnValue("/caminho/inexistente/para/splits");
    const semFicheiro = await calendarioCorporativo(
      new Date("2020-08-29T00:00:00Z"),
      new Date("2020-09-02T00:00:00Z"),
      new Set(["AAPL"]),
    );
    expect(semFicheiro).toEqual([]);
  });

  it("mapeia /stock/insider-transactions com sinais, códigos SEC, preços zero e ordenação", () => {
    const payload = {
      symbol: "AAPL",
      data: [
        {
          id: "0001140361-26-038674",
          name: "COOK TIMOTHY D",
          share: 3237843,
          change: -26325,
          filingDate: "2026-10-05",
          transactionDate: "2026-10-02",
          transactionCode: "G",
          transactionPrice: 0,
        },
        {
          id: "0001140361-26-043484",
          name: "Newstead Jennifer",
          share: 27598,
          change: -2399,
          filingDate: "2026-11-12",
          transactionDate: "2026-11-10",
          transactionCode: "S",
          transactionPrice: 351.36,
        },
        {
          id: "0001140361-26-044000",
          name: "Director Buyer",
          share: 10500,
          change: 500,
          filingDate: "2026-11-15",
          transactionDate: "2026-11-14",
          transactionCode: "p",
          transactionPrice: 340,
        },
        {
          // Linha sem data válida → ignorada
          name: "Inválido",
          change: 10,
          transactionDate: "",
        },
      ],
    };

    const res = mapearInsidersFinnhub(payload, 2);
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual({
      id: "0001140361-26-044000#2",
      insiderName: "Director Buyer",
      title: null,
      type: "BUY",
      transactionCode: "P",
      shares: 500,
      sharesChange: 500,
      price: 340,
      value: 170_000,
      sharesOwnedAfter: 10500,
      transactionDate: "2026-11-14",
      filedAt: "2026-11-15",
    });
    expect(res[1]).toEqual({
      id: "0001140361-26-043484#1",
      insiderName: "Newstead Jennifer",
      title: null,
      type: "SELL",
      transactionCode: "S",
      shares: 2399,
      sharesChange: -2399,
      price: 351.36,
      value: 2399 * 351.36,
      sharesOwnedAfter: 27598,
      transactionDate: "2026-11-10",
      filedAt: "2026-11-12",
    });

    // Verifica também o tratamento de G (doação) e transactionPrice: 0 quando limite permite
    const todos = mapearInsidersFinnhub(payload, 10);
    expect(todos[2]).toMatchObject({
      type: "OTHER",
      transactionCode: "G",
      shares: 26325,
      sharesChange: -26325,
      price: null,
      value: null,
    });
  });

  it("insiders() chama Finnhub /stock/insider-transactions e degrada para [] em falha", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          symbol: "AAPL",
          data: [
            {
              id: "f1",
              name: "Cook",
              share: 1000,
              change: -100,
              filingDate: "2026-11-12",
              transactionDate: "2026-11-10",
              transactionCode: "S",
              transactionPrice: 350,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const txns = await insiders("AAPL", 50);
    expect(txns).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, { next?: { revalidate?: number } }];
    expect(url.pathname).toBe("/api/v1/stock/insider-transactions");
    expect(url.searchParams.get("symbol")).toBe("AAPL");
    expect(init?.next?.revalidate).toBe(6 * 3600);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 429 })));
    await expect(insiders("AAPL")).resolves.toEqual([]);
  });
});
