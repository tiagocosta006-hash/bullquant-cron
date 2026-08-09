import { describe, it, expect } from "vitest";
import { clusterItems, matchTickers, rankClusters } from "@/lib/news/cluster";
import { dedupKeyFor } from "@/lib/news/normalize";
import type { RawNewsItem } from "@/lib/news/types";

function item(title: string, source: string, minutosAtras = 10): RawNewsItem {
  return {
    dedupKey: dedupKeyFor(`${title}::${source}`),
    source,
    sourceUrl: `https://example.com/${encodeURIComponent(title)}`,
    title,
    summary: null,
    imageUrl: null,
    publishedAt: new Date(Date.now() - minutosAtras * 60_000),
  };
}

describe("clusterItems", () => {
  it("junta a mesma história publicada por fontes diferentes", () => {
    const clusters = clusterItems([
      item("Fed holds interest rates steady as inflation cools", "Reuters"),
      item("Federal Reserve holds interest rates steady, inflation cools", "CNBC"),
      item("Nvidia beats earnings estimates on data centre demand", "Bloomberg"),
    ]);

    expect(clusters).toHaveLength(2);
    const fed = clusters.find((c) => c.items.length === 2);
    expect(fed?.sourceCount).toBe(2);
    expect(clusters.find((c) => c.items.length === 1)?.sourceCount).toBe(1);
  });

  it("não junta histórias distintas que partilham vocabulário", () => {
    const clusters = clusterItems([
      item("Fed holds interest rates steady", "Reuters"),
      item("ECB cuts interest rates by 25 basis points", "CNBC"),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("conta uma só fonte quando o mesmo meio republica a história", () => {
    const clusters = clusterItems([
      item("Oil prices surge on Hormuz tensions", "Reuters"),
      item("Oil prices surge amid Hormuz tensions", "Reuters"),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].sourceCount).toBe(1);
    expect(clusters[0].items).toHaveLength(2);
  });

  it("aguenta uma lista vazia", () => {
    expect(clusterItems([])).toEqual([]);
  });
});

describe("matchTickers", () => {
  const companies = [
    { ticker: "AAPL", name: "Apple Inc." },
    { ticker: "TGT", name: "Target Corporation" },
    { ticker: "BALL", name: "Ball Corporation" },
    { ticker: "CSCO", name: "Cisco Systems, Inc." },
    { ticker: "T", name: "AT&T Inc." },
  ];

  const tickersDe = (titulo: string) =>
    matchTickers(clusterItems([item(titulo, "Reuters")]), companies)[0].matchedTickers;

  it("deteta o ticker escrito entre parênteses", () => {
    expect(tickersDe("Apple (AAPL) unveils new chip")).toContain("AAPL");
  });

  it("deteta a empresa pelo nome", () => {
    expect(tickersDe("Cisco unveils new switch line")).toContain("CSCO");
  });

  // Estes eram falsos positivos reais observados na primeira execução do
  // ingestor sobre feeds a sério.
  it("não confunde 'price target' com a Target", () => {
    expect(tickersDe("Shares vest on a price target")).not.toContain("TGT");
  });

  it("não confunde 'ballot' com a Ball Corporation", () => {
    expect(tickersDe("Candidate stays in race as ballot deadline passes")).not.toContain("BALL");
  });

  it("não confunde 'Francisco' com a Cisco", () => {
    expect(tickersDe("Francisco Loureiro joins the board")).not.toContain("CSCO");
  });

  it("ignora tickers de 1-2 letras sem a forma explícita", () => {
    expect(tickersDe("Here is what to know about the deal")).not.toContain("T");
    expect(tickersDe("Deal closes for (T) shareholders")).toContain("T");
  });
});

describe("rankClusters", () => {
  it("põe a história com cobertura multi-fonte à frente da mais recente", () => {
    const clusters = matchTickers(
      clusterItems([
        item("Fed holds interest rates steady as inflation cools", "Reuters", 120),
        item("Federal Reserve holds interest rates steady, inflation cools", "CNBC", 120),
        item("Some minor corporate update nobody else covered", "Yahoo Finance", 1),
      ]),
      []
    );

    const ranked = rankClusters(clusters);
    expect(ranked[0].sourceCount).toBe(2);
  });

  it("não altera o array recebido", () => {
    const clusters = clusterItems([item("A story", "Reuters"), item("B story", "CNBC")]);
    const antes = [...clusters];
    rankClusters(clusters);
    expect(clusters).toEqual(antes);
  });
});
