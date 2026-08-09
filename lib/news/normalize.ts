import { createHash } from "node:crypto";

// Imagens genéricas/placeholder que devem ser tratadas como "sem imagem".
// (Originalmente inline em app/api/news/[ticker]/route.ts — extraído para ser
// partilhado entre a rota por ticker e o pipeline do Terminal de Notícias.)
const GENERIC_IMAGE_PATTERNS = [
  "s.yimg.com/rz/stage", // Yahoo Finance generic logo
  "yahoo_finance_en-US_h_p", // Yahoo Finance generic logo variant
  "static.finnhub", // Finnhub placeholder
  "finnhub.io/static",
];

/** True apenas se o URL for uma imagem específica do artigo, não um logo genérico. */
export function isRealImage(url: string | null | undefined): boolean {
  if (!url || url.trim() === "") return false;
  return !GENERIC_IMAGE_PATTERNS.some((pattern) => url.includes(pattern));
}

// Sufixos de fonte que os agregadores colam ao título ("... - Reuters").
const SOURCE_SUFFIX = /\s+[-–|]\s+[A-Za-z0-9.&' ]{2,30}$/;

// Palavras vazias que não ajudam a distinguir uma história de outra.
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "from", "by", "as", "is", "are", "was", "were", "be", "been", "it",
  "its", "that", "this", "these", "those", "after", "amid", "over", "into",
  "says", "say", "said", "new", "up", "down", "more", "than", "how", "why",
  "what", "when", "who", "where", "which", "had", "has", "have", "will",
  "can", "could", "should", "would", "may", "might", "their", "you", "your",
  "here", "there", "about", "just", "now", "one", "two", "out", "off", "not",
]);

/**
 * Forma canónica de um título: minúsculas, sem acentos, sem pontuação nem
 * sufixo de fonte. É a base do `dedupKey` e do clustering.
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(SOURCE_SUFFIX, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stemming mínimo: só o plural, que é onde "vest"/"vests" partia o clustering. */
function stem(token: string): string {
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

/** Tokens significativos de um título, para similaridade de Jaccard. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
      .map(stem)
  );
}

/** Chave estável de deduplicação — o mesmo artigo relido não é reprocessado. */
export function dedupKeyFor(title: string): string {
  return createHash("sha1").update(normalizeTitle(title)).digest("hex");
}

/** Similaridade de Jaccard entre dois conjuntos de tokens (0..1). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/** Remove tags HTML e entidades comuns das descrições de RSS. */
export function stripHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

/** Slug ASCII a partir de um título português, com sufixo curto para unicidade. */
export function slugify(title: string, suffix: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 10)
    .join("-");
  return `${base || "noticia"}-${suffix}`;
}
