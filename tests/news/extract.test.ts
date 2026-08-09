import { describe, it, expect } from "vitest";
import {
  extractBodyFromHtml,
  isUnusableBody,
  parseRobots,
  MAX_BODY_CHARS,
} from "@/lib/news/extract";

/** Parágrafo com mais de 60 caracteres — o mínimo que o extractor considera. */
const P = (n: number) =>
  `<p>Este é o parágrafo número ${n} do artigo e tem comprimento suficiente para não ser tratado como legenda de imagem ou crédito de fotografia.</p>`;

const corpoLongo = [1, 2, 3, 4, 5].map(P).join("");

describe("extractBodyFromHtml", () => {
  it("prefere o articleBody do JSON-LD", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@type":"NewsArticle","articleBody":"${"Texto estruturado da notícia. ".repeat(30)}"}
        </script>
      </head><body><article>${corpoLongo}</article></body></html>`;

    const r = extractBodyFromHtml(html);
    expect(r?.fromStructuredData).toBe(true);
    expect(r?.text).toContain("Texto estruturado da notícia.");
  });

  it("lê o JSON-LD embrulhado em @graph", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@graph":[{"@type":"WebPage"},{"@type":"NewsArticle","articleBody":"${"Corpo dentro do graph. ".repeat(40)}"}]}
        </script>
      </head><body></body></html>`;

    expect(extractBodyFromHtml(html)?.text).toContain("Corpo dentro do graph.");
  });

  it("ignora JSON-LD malformado e cai para o HTML", () => {
    const html = `
      <html><head><script type="application/ld+json">{isto não é json}</script></head>
      <body><article>${corpoLongo}</article></body></html>`;

    const r = extractBodyFromHtml(html);
    expect(r?.fromStructuredData).toBe(false);
    expect(r?.text).toContain("parágrafo número 1");
  });

  it("extrai do <article> quando não há dados estruturados", () => {
    const r = extractBodyFromHtml(`<html><body><article>${corpoLongo}</article></body></html>`);
    expect(r?.text).toContain("parágrafo número 5");
  });

  it("descarta navegação, rodapé e anúncios", () => {
    const html = `<html><body>
      <nav><p>Menu de navegação com bastante texto para passar o filtro de comprimento mínimo.</p></nav>
      <article>${corpoLongo}</article>
      <footer><p>Rodapé institucional com bastante texto para passar o filtro de comprimento mínimo.</p></footer>
    </body></html>`;

    const texto = extractBodyFromHtml(html)!.text;
    expect(texto).toContain("parágrafo número 1");
    expect(texto).not.toContain("Menu de navegação");
    expect(texto).not.toContain("Rodapé institucional");
  });

  it("devolve null quando só há texto curto (legendas, créditos)", () => {
    const html = `<html><body><article><p>Foto: Reuters</p><p>2 min de leitura</p></article></body></html>`;
    expect(extractBodyFromHtml(html)).toBeNull();
  });

  it("devolve null para um teaser de paywall", () => {
    const html = `<html><body><article>
      ${P(1)}${P(2)}${P(3)}${P(4)}${P(5)}
      <p>Subscribe to continue reading this article and get unlimited access to everything.</p>
    </article></body></html>`;
    expect(extractBodyFromHtml(html)).toBeNull();
  });

  // Regressão: o Bloomberg servia 437 caracteres do seu rodapé institucional,
  // que passavam o filtro de tamanho e iam parar ao prompt como se fossem a notícia.
  it("devolve null para boilerplate institucional", () => {
    const boilerplate = `<p>${"Connecting decision makers to a dynamic network of information, people and ideas, Bloomberg quickly and accurately delivers business and financial information around the world. ".repeat(4)}</p>`;
    expect(extractBodyFromHtml(`<html><body><article>${boilerplate}</article></body></html>`)).toBeNull();
  });

  it("trunca corpos acima do teto", () => {
    const enorme = `<p>${"palavra ".repeat(3000)}</p>`;
    const texto = extractBodyFromHtml(`<html><body><article>${enorme}</article></body></html>`)!.text;
    expect(texto.length).toBeLessThanOrEqual(MAX_BODY_CHARS + 1); // +1 pela reticência
    expect(texto.endsWith("…")).toBe(true);
  });

  it("aguenta HTML vazio ou lixo", () => {
    expect(extractBodyFromHtml("")).toBeNull();
    expect(extractBodyFromHtml("não é html de todo")).toBeNull();
  });
});

describe("isUnusableBody", () => {
  it("apanha marcadores de paywall", () => {
    expect(isUnusableBody("Sign in to read the full story")).toBe(true);
  });

  it("não desqualifica um artigo longo que mencione cookies de passagem", () => {
    const artigo = `${"Texto real da notícia sobre a decisão do banco central. ".repeat(60)} We use cookies to improve.`;
    expect(isUnusableBody(artigo)).toBe(false);
  });

  it("desqualifica um texto curto dominado por boilerplate", () => {
    expect(isUnusableBody("We use cookies to give you the best experience.")).toBe(true);
  });
});

describe("parseRobots", () => {
  it("lê as regras do grupo genérico", () => {
    expect(parseRobots("User-agent: *\nDisallow: /rss/\nDisallow: /private")).toEqual([
      "/rss/",
      "/private",
    ]);
  });

  it("ignora as regras de outros agentes", () => {
    const rules = parseRobots("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin");
    expect(rules).toEqual(["/admin"]);
  });

  it("aplica as regras dirigidas ao nosso bot", () => {
    expect(parseRobots("User-agent: BullValueNewsBot\nDisallow: /paid")).toEqual(["/paid"]);
  });

  it("ignora comentários e linhas vazias", () => {
    expect(parseRobots("# comentário\nUser-agent: *\n\nDisallow: /x # inline")).toEqual(["/x"]);
  });

  it("devolve lista vazia para um robots.txt permissivo", () => {
    expect(parseRobots("User-agent: *\nAllow: /")).toEqual([]);
  });
});
