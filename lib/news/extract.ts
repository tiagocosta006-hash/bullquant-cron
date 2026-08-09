import * as cheerio from "cheerio";

/**
 * Extração do corpo dos artigos noticiosos.
 *
 * Só é chamada para as histórias que passaram a triagem (≤5 por execução), e o
 * texto NUNCA é persistido: serve apenas de contexto para o LLM escrever o
 * mini-artigo em português, e é descartado logo a seguir. O que fica na base
 * de dados é o artigo original da Bull Value, com atribuição e link à fonte.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2_000_000;
/** Teto do texto entregue ao LLM. Acima disto o retorno é marginal e caro. */
export const MAX_BODY_CHARS = 6_000;
/**
 * Abaixo disto o que extraímos é um teaser de paywall ou boilerplate, não um
 * artigo. Subido de 400 depois de o Bloomberg passar o filtro com 437
 * caracteres do seu rodapé institucional.
 */
const MIN_BODY_CHARS = 600;

const USER_AGENT =
  "BullValueNewsBot/1.0 (+https://thebullvalue.com; resumos noticiosos com atribuição)";

/** Elementos que nunca fazem parte do corpo de uma notícia. */
const CHROME_SELECTORS = [
  "script", "style", "noscript", "iframe", "svg", "form",
  "nav", "aside", "header", "footer", "figure", "figcaption",
  "[role=navigation]", "[role=banner]", "[role=complementary]",
  ".advertisement", ".ad", ".ads", ".newsletter", ".related",
  ".social", ".share", ".comments", ".paywall", ".subscription",
].join(",");

/** Contentores prováveis do corpo, do mais ao menos específico. */
const BODY_SELECTORS = [
  "article",
  "[itemprop=articleBody]",
  ".article-body",
  ".articleBody",
  ".story-body",
  ".entry-content",
  ".post-content",
  "main",
];

/** Frases que denunciam que só apanhámos o teaser de um artigo pago. */
const PAYWALL_MARKERS = [
  "subscribe to continue",
  "subscribe to read",
  "this article is for subscribers",
  "sign in to read",
  "become a subscriber",
  "already a subscriber",
  "to continue reading",
  "unlock this article",
];

/**
 * Boilerplate institucional que alguns sites servem no lugar do corpo quando
 * não nos deixam entrar. Passava o filtro de tamanho e ia parar ao prompt como
 * se fosse a notícia — pior do que não ter corpo nenhum.
 */
const BOILERPLATE_MARKERS = [
  "connecting decision makers to a dynamic network",
  "we use cookies to",
  "enable javascript and cookies to continue",
  "your browser is not supported",
  "verify you are a human",
  "checking your browser",
];

export interface ExtractedBody {
  url: string;
  text: string;
  /** true quando o corpo veio do JSON-LD (a via mais fiável). */
  fromStructuredData: boolean;
}

// ── robots.txt ──────────────────────────────────────────────────────────────
// Cache por host, válido durante a execução do script (que dura segundos).
const robotsCache = new Map<string, string[]>();

/**
 * Regras de Disallow para o nosso agente. Parser deliberadamente simples: lê o
 * grupo `User-agent: *` e o grupo específico do nosso bot, se existir.
 * Em caso de dúvida ou erro de rede, permite — um robots.txt inacessível não
 * é uma proibição.
 */
async function disallowedPaths(origin: string): Promise<string[]> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  let rules: string[] = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const text = (await res.text()).slice(0, 100_000);
      rules = parseRobots(text);
    }
  } catch {
    // Sem robots.txt acessível — segue em frente.
  }

  robotsCache.set(origin, rules);
  return rules;
}

export function parseRobots(text: string): string[] {
  const disallow: string[] = [];
  let aplicavel = false;

  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;

    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const key = field.trim().toLowerCase();

    if (key === "user-agent") {
      const agent = value.toLowerCase();
      aplicavel = agent === "*" || agent.includes("bullvalue");
    } else if (key === "disallow" && aplicavel && value) {
      disallow.push(value);
    }
  }

  return disallow;
}

async function isAllowed(url: URL): Promise<boolean> {
  const rules = await disallowedPaths(url.origin);
  const path = url.pathname + url.search;
  return !rules.some((rule) => rule === "/" || path.startsWith(rule));
}

// ── Extração ────────────────────────────────────────────────────────────────

/** `articleBody` do JSON-LD schema.org — quando existe, é a via mais limpa. */
function fromJsonLd($: cheerio.CheerioAPI): string | null {
  const nodes: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    try {
      nodes.push(JSON.parse(raw));
    } catch {
      // JSON-LD malformado é comum; ignorar em silêncio.
    }
  });

  // O JSON-LD pode vir como objeto, array, ou embrulhado em @graph.
  const flatten = (node: unknown): unknown[] => {
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (node && typeof node === "object") {
      const graph = (node as Record<string, unknown>)["@graph"];
      return graph ? [node, ...flatten(graph)] : [node];
    }
    return [];
  };

  for (const node of nodes.flatMap(flatten)) {
    const body = (node as Record<string, unknown>)?.articleBody;
    if (typeof body === "string" && body.trim().length >= MIN_BODY_CHARS) {
      return clean(body);
    }
  }

  return null;
}

/** Contentor com mais texto em parágrafos. */
function fromHtml($: cheerio.CheerioAPI): string | null {
  $(CHROME_SELECTORS).remove();

  let melhor = "";

  for (const selector of BODY_SELECTORS) {
    $(selector).each((_, el) => {
      const paragrafos = $(el)
        .find("p")
        .map((_i, p) => $(p).text().trim())
        .get()
        // Linhas curtas são legendas, créditos e avisos de cookies.
        .filter((t) => t.length > 60);

      const texto = paragrafos.join("\n\n");
      if (texto.length > melhor.length) melhor = texto;
    });

    // Um selector específico que já deu texto suficiente basta.
    if (melhor.length >= MIN_BODY_CHARS && selector !== "main") break;
  }

  // Último recurso: todos os <p> da página.
  if (melhor.length < MIN_BODY_CHARS) {
    const todos = $("p")
      .map((_i, p) => $(p).text().trim())
      .get()
      .filter((t) => t.length > 60)
      .join("\n\n");
    if (todos.length > melhor.length) melhor = todos;
  }

  return melhor.length >= MIN_BODY_CHARS ? clean(melhor) : null;
}

function clean(text: string): string {
  const limpo = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return limpo.length > MAX_BODY_CHARS ? `${limpo.slice(0, MAX_BODY_CHARS)}…` : limpo;
}

/** True quando o que extraímos é teaser de paywall ou boilerplate do site. */
export function isUnusableBody(text: string): boolean {
  const lower = text.toLowerCase();
  if (PAYWALL_MARKERS.some((marker) => lower.includes(marker))) return true;
  // O boilerplate só desqualifica se dominar o texto — um artigo longo que
  // mencione cookies de passagem continua a ser um artigo.
  return BOILERPLATE_MARKERS.some(
    (marker) => lower.includes(marker) && text.length < MIN_BODY_CHARS * 3
  );
}

/**
 * Parte pura da extração: HTML → corpo do artigo. Separada do fetch para ser
 * testável com fixtures, sem rede.
 *
 * Tenta o JSON-LD primeiro porque não sofre com a maquilhagem do HTML, e cai
 * para a heurística dos parágrafos quando o site não o publica.
 */
export function extractBodyFromHtml(
  html: string
): { text: string; fromStructuredData: boolean } | null {
  const $ = cheerio.load(html);

  const estruturado = fromJsonLd($);
  if (estruturado && !isUnusableBody(estruturado)) {
    return { text: estruturado, fromStructuredData: true };
  }

  const texto = fromHtml($);
  if (!texto || isUnusableBody(texto)) return null;

  return { text: texto, fromStructuredData: false };
}

/**
 * Descarrega e extrai o corpo de um artigo. Devolve `null` em qualquer
 * situação adversa — robots.txt a proibir, paywall, HTML sem corpo utilizável,
 * erro de rede. O chamador continua com o resumo do feed.
 */
export async function extractArticleBody(rawUrl: string): Promise<ExtractedBody | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!(await isAllowed(url))) {
    console.log(`[news] robots.txt proíbe ${url.host}${url.pathname} — a saltar`);
    return null;
  }

  try {
    const res = await fetch(url, {
      headers: {
        // Sem header `Accept`: o Yahoo Finance responde com uma versão
        // reduzida da página (111 kB sem corpo) a quem o envia, e com o
        // artigo completo (850 kB) a quem o omite. Medido, não suposto.
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;

    const tamanho = Number(res.headers.get("content-length") ?? 0);
    if (tamanho > MAX_HTML_BYTES) return null;

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const extraido = extractBodyFromHtml(html);
    return extraido ? { url: rawUrl, ...extraido } : null;
  } catch (err) {
    console.error(`[news] extração falhou (${url.host}):`, (err as Error).message);
    return null;
  }
}

/**
 * Extrai vários artigos em paralelo. Nunca lança — cada falha vira ausência.
 *
 * O robots.txt é verificado ANTES de escolher os alvos, e não durante o fetch.
 * Sem isso, os slots eram gastos com URLs que já sabíamos estar proibidos — na
 * prática os redirects do Google News, que são mais de metade dos itens
 * recolhidos — e as fontes que dão texto ficavam de fora.
 *
 * `limit` mantém o número de pedidos baixo: 2-3 fontes chegam para o LLM
 * perceber a história e cruzar versões.
 */
export async function extractBodies(urls: string[], limit = 3): Promise<ExtractedBody[]> {
  const permitidos: string[] = [];

  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (await isAllowed(url)) permitidos.push(raw);
    if (permitidos.length >= limit) break;
  }

  const resultados = await Promise.all(permitidos.map((u) => extractArticleBody(u)));
  return resultados.filter((r): r is ExtractedBody => r !== null);
}
