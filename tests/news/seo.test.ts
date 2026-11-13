import { describe, it, expect } from "vitest";
import {
  dataNoticia,
  imagemNoticia,
  jsonLdNoticia,
  jsonParaScript,
  urlNoticia,
  xmlSitemapNoticias,
  type NoticiaSeo,
} from "@/lib/news/seo";

const noticia: NoticiaSeo = {
  slug: "binance-sofre-ataque-c119dbec",
  titulo: "Binance sofre ataque cibernético recorde",
  resumoCurto: "A corretora comprometeu-se a cobrir todas as perdas.",
  categoria: "CRYPTO",
  tickers: ["COIN", "HOOD"],
  publishedAt: new Date("2026-10-30T04:40:17Z"),
  updatedAt: new Date("2026-10-30T06:00:00Z"),
  sources: [{ name: "CNBC", url: "https://www.cnbc.com/x" }],
};

describe("URLs das notícias", () => {
  // Regressão: os links eram /pt/news/..., que responde 307. O canónico é sem prefixo.
  it("canónico sem /pt/", () => {
    expect(urlNoticia("abc")).toBe("https://thebullvalue.com/news/abc");
  });

  it("imagem de partilha é o cartão gerado por /api/og/news", () => {
    expect(imagemNoticia("abc")).toBe("https://thebullvalue.com/api/og/news/abc");
  });
});

describe("dataNoticia", () => {
  // O servidor corre em UTC; a data mostrada é a de Lisboa (WET, +0 no inverno; WEST, +1 no verão).
  it("mostra a hora de Lisboa", () => {
    expect(dataNoticia("2026-07-01T10:00:00Z")).toContain("11:00");
    expect(dataNoticia("2026-12-01T10:00:00Z")).toContain("10:00");
  });
});

describe("jsonLdNoticia", () => {
  const [artigo, migalhas] = jsonLdNoticia(noticia)["@graph"] as Record<string, unknown>[];

  it("é um NewsArticle com os campos que o Google pede", () => {
    expect(artigo["@type"]).toBe("NewsArticle");
    expect(artigo.headline).toBe(noticia.titulo);
    expect(artigo.datePublished).toBe("2026-10-30T04:40:17.000Z");
    expect(artigo.dateModified).toBe("2026-10-30T06:00:00.000Z");
    expect(artigo.image).toEqual([imagemNoticia(noticia.slug)]);
    expect(artigo.mainEntityOfPage).toBe(urlNoticia(noticia.slug));
    expect(artigo.inLanguage).toBe("pt-PT");
    expect(artigo.articleSection).toBe("Cripto");
    expect(artigo.keywords).toBe("COIN, HOOD");
  });

  it("atribui as fontes originais", () => {
    expect(artigo.isBasedOn).toEqual([{ "@type": "CreativeWork", name: "CNBC", url: "https://www.cnbc.com/x" }]);
  });

  it("sem tickers nem fontes, não inventa campos vazios", () => {
    const [vazio] = jsonLdNoticia({ ...noticia, tickers: [], sources: [] })["@graph"] as Record<string, unknown>[];
    expect(vazio).not.toHaveProperty("keywords");
    expect(vazio).not.toHaveProperty("isBasedOn");
  });

  it("migalhas: BullValue › Notícias › artigo", () => {
    expect(migalhas["@type"]).toBe("BreadcrumbList");
    expect((migalhas.itemListElement as { item: string }[]).map((i) => i.item)).toEqual([
      "https://thebullvalue.com",
      "https://thebullvalue.com/news",
      urlNoticia(noticia.slug),
    ]);
  });
});

describe("jsonParaScript", () => {
  // O título vem de um LLM: um "</script>" não pode fechar a tag do JSON-LD.
  it("escapa o < e continua a ser o mesmo JSON", () => {
    const dados = { headline: "a </script><script>alert(1)</script>" };
    const texto = jsonParaScript(dados);
    expect(texto).not.toContain("<");
    expect(JSON.parse(texto)).toEqual(dados);
  });
});

describe("xmlSitemapNoticias", () => {
  it("segue o formato do Google News", () => {
    const xml = xmlSitemapNoticias([noticia]);
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain(`<loc>${urlNoticia(noticia.slug)}</loc>`);
    expect(xml).toContain("<news:name>The BullValue</news:name>");
    expect(xml).toContain("<news:language>pt</news:language>");
    expect(xml).toContain("<news:publication_date>2026-10-30T04:40:17.000Z</news:publication_date>");
  });

  it("escapa caracteres especiais do título", () => {
    const xml = xmlSitemapNoticias([{ ...noticia, titulo: 'S&P 500 <sobe> "forte"' }]);
    expect(xml).toContain("<news:title>S&amp;P 500 &lt;sobe&gt; &quot;forte&quot;</news:title>");
  });

  it("sem notícias recentes continua a ser um sitemap válido", () => {
    const xml = xmlSitemapNoticias([]);
    expect(xml).toContain("<urlset");
    expect(xml).not.toContain("<url>");
  });
});
