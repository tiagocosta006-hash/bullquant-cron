import { describe, it, expect } from "vitest";
import {
  dedupKeyFor,
  isRealImage,
  jaccard,
  normalizeTitle,
  slugify,
  stripHtml,
  titleTokens,
} from "@/lib/news/normalize";

describe("normalizeTitle", () => {
  it("remove o sufixo de fonte que os agregadores colam ao título", () => {
    expect(normalizeTitle("Fed holds rates steady - Reuters")).toBe("fed holds rates steady");
    expect(normalizeTitle("Fed holds rates steady | Bloomberg")).toBe("fed holds rates steady");
  });

  it("ignora acentos, maiúsculas e pontuação", () => {
    expect(normalizeTitle("BCE Mantém Taxas!")).toBe("bce mantem taxas");
  });

  it("trata o possessivo como ruído", () => {
    expect(normalizeTitle("Apple's revenue")).toBe("apple revenue");
  });
});

describe("dedupKeyFor", () => {
  it("dá a mesma chave a variantes do mesmo título", () => {
    expect(dedupKeyFor("Fed Holds Rates Steady - Reuters")).toBe(
      dedupKeyFor("fed holds rates steady")
    );
  });

  it("dá chaves diferentes a histórias diferentes", () => {
    expect(dedupKeyFor("Fed holds rates")).not.toBe(dedupKeyFor("ECB holds rates"));
  });
});

describe("titleTokens", () => {
  it("descarta stop words e normaliza plurais", () => {
    const tokens = titleTokens("The Fed Says It Will Hold Rates");
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("say")).toBe(false); // "says" é stop word
    expect(tokens.has("rate")).toBe(true); // "rates" -> "rate"
    expect(tokens.has("fed")).toBe(true);
  });

  it("não estraga palavras terminadas em ss", () => {
    expect(titleTokens("Business press").has("business")).toBe(true);
  });
});

describe("jaccard", () => {
  it("é 1 para conjuntos iguais e 0 para disjuntos", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("é 0 quando um dos conjuntos é vazio", () => {
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
  });
});

describe("isRealImage", () => {
  it("rejeita placeholders conhecidos e valores vazios", () => {
    expect(isRealImage("https://s.yimg.com/rz/stage/logo.png")).toBe(false);
    expect(isRealImage("https://static.finnhub.io/x.png")).toBe(false);
    expect(isRealImage("")).toBe(false);
    expect(isRealImage(null)).toBe(false);
  });

  it("aceita uma imagem específica do artigo", () => {
    expect(isRealImage("https://cdn.cnbc.com/article-123.jpg")).toBe(true);
  });
});

describe("stripHtml", () => {
  it("remove tags e resolve entidades", () => {
    expect(stripHtml("<p>Fed &amp; ECB</p>")).toBe("Fed & ECB");
  });

  it("devolve null quando não sobra texto", () => {
    expect(stripHtml("<p></p>")).toBeNull();
    expect(stripHtml(null)).toBeNull();
  });
});

describe("slugify", () => {
  it("produz ASCII com o sufixo de unicidade", () => {
    expect(slugify("Fed mantém taxas e adia cortes", "abc123")).toBe(
      "fed-mantem-taxas-e-adia-cortes-abc123"
    );
  });

  it("limita o comprimento a 10 palavras", () => {
    const slug = slugify("um dois tres quatro cinco seis sete oito nove dez onze doze", "x");
    expect(slug).toBe("um-dois-tres-quatro-cinco-seis-sete-oito-nove-dez-x");
  });

  it("nunca devolve um slug vazio", () => {
    expect(slugify("!!!", "abc")).toBe("noticia-abc");
  });
});
