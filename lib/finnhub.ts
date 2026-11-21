/**
 * Cliente leve da Finnhub para o site (Data Cache do Next) e para o MCP local.
 *
 * ── Porque existe separado de `lib/fmp/mercado.ts` ─────────────────────────
 *
 * A plataforma está a sair da FMP aos poucos: notícias por empresa,
 * calendário de resultados, transações de insiders, beta e logos passam para
 * a Finnhub (`FINNHUB_API_KEY`, plano gratuito de 60 pedidos/minuto).
 *
 * Regras transversais deste cliente:
 *   · A chave nunca vai para o browser — vive só no servidor e nunca aparece
 *     em logs de erro (os URLs com `?token=...` nunca são impressos).
 *   · Usa a Data Cache do Next (`fetch` com `next.revalidate`) para partilhar
 *     respostas entre pedidos e poupar a quota de 60/min.
 *   · Se a chave faltar ou a Finnhub falhar, degrada sempre para `null` (ou
 *     lista vazia em quem chama): nenhuma página rebenta por culpa da fonte.
 */

const FINNHUB_BASE = "https://finnhub.io/api/v1";

/** Logos mudam raramente; 30 dias de cache evitam gastar quota com perfis. */
export const REVALIDATE_LOGO_FINNHUB = 30 * 86_400;
/** O beta é uma regressão histórica de longo prazo; 24 horas chega. */
export const REVALIDATE_BETA_FINNHUB = 86_400;

const LOGO_CACHE_TTL_MS = REVALIDATE_LOGO_FINNHUB * 1000;

type EntradaLogo = {
  url: string | null;
  expiraEm: number;
};

const logoCache = new Map<string, EntradaLogo>();
const logoEmCurso = new Map<string, Promise<string | null>>();

/** Limpa a cache em memória dos logos (útil em testes unitários). */
export function limparCacheFinnhub(): void {
  logoCache.clear();
  logoEmCurso.clear();
}

/**
 * Normaliza o ticker para a Finnhub.
 *
 * Ao contrário da FMP (que exige hífen `BRK-B`), a Finnhub espera classes de
 * ações com ponto (`BRK.B`), tal como estão guardadas na nossa base de dados.
 */
export function simboloFinnhub(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function chaveFinnhub(): string | null {
  const k = process.env.FINNHUB_API_KEY?.trim();
  return k ? k : null;
}

/**
 * Pedido GET à Finnhub com Data Cache do Next e degradação graciosa.
 *
 * Repete uma vez em 429 ou erro transitório 5xx após 500 ms. Em qualquer falha
 * (sem chave, rede, HTTP não-OK, ou JSON com `{ error: ... }`), regista apenas
 * o endpoint e o estado — nunca o URL completo com a chave — e devolve `null`.
 */
export async function finnhubGet<T>(
  endpoint: string,
  params: Record<string, string>,
  revalidate: number,
): Promise<T | null> {
  const token = chaveFinnhub();
  if (!token) {
    console.warn(`[finnhub] FINNHUB_API_KEY em falta — a saltar ${endpoint}`);
    return null;
  }

  const url = new URL(`${FINNHUB_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("token", token);

  try {
    let resp = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate, tags: ["finnhub"] },
    });
    if (resp.status === 429 || resp.status >= 500) {
      await new Promise((r) => setTimeout(r, 500));
      resp = await fetch(url, {
        headers: { accept: "application/json" },
        next: { revalidate, tags: ["finnhub"] },
      });
    }
    if (!resp.ok) {
      console.error(`[finnhub] ${endpoint} → HTTP ${resp.status}`);
      return null;
    }

    const dados = (await resp.json()) as T;
    if (dados && typeof dados === "object" && !Array.isArray(dados) && "error" in dados) {
      const msg = (dados as Record<string, unknown>).error;
      if (msg) {
        console.error(`[finnhub] ${endpoint}: ${String(msg)}`);
        return null;
      }
    }
    return dados;
  } catch (erro) {
    console.error(`[finnhub] ${endpoint}:`, erro instanceof Error ? erro.message : String(erro));
    return null;
  }
}

// ─── Beta (/stock/metric) ──────────────────────────────────────────────────

type RespostaMetricasFinnhub = {
  metric?: {
    beta?: unknown;
  } | null;
};

/** Extrai o `beta` da resposta de `/stock/metric?metric=all` da Finnhub. */
export function extrairBetaFinnhub(dados: unknown): number | null {
  if (!dados || typeof dados !== "object") return null;
  const beta = (dados as RespostaMetricasFinnhub).metric?.beta;
  return typeof beta === "number" && Number.isFinite(beta) ? beta : null;
}

/**
 * Beta de uma empresa via Finnhub (`/stock/metric?metric=all`), em cache de
 * 24 horas. Devolve `null` em caso de falha ou dado ausente.
 */
export async function betaFinnhub(ticker: string): Promise<number | null> {
  const sym = simboloFinnhub(ticker);
  if (!sym) return null;
  const dados = await finnhubGet<RespostaMetricasFinnhub>(
    "stock/metric",
    { symbol: sym, metric: "all" },
    REVALIDATE_BETA_FINNHUB,
  );
  return extrairBetaFinnhub(dados);
}

// ─── Logos (/stock/profile2) ───────────────────────────────────────────────

type RespostaPerfil2Finnhub = {
  logo?: unknown;
};

/** Extrai e valida o URL `logo` de `/stock/profile2` da Finnhub. */
export function extrairLogoFinnhub(dados: unknown): string | null {
  if (!dados || typeof dados !== "object") return null;
  const bruto = (dados as RespostaPerfil2Finnhub).logo;
  if (typeof bruto !== "string") return null;
  const url = bruto.trim();
  return url.startsWith("https://") ? url : null;
}

/**
 * URL do logótipo oficial via Finnhub (`/stock/profile2`), com cache longa de
 * 30 dias (Data Cache do Next + cache em memória para scripts/MCP fora do Next).
 *
 * Falhas de rede não ficam em cache para permitir recuperar no pedido seguinte;
 * devolve `null` quando a Finnhub não tem logótipo ou está indisponível.
 */
export async function logoFinnhub(ticker: string): Promise<string | null> {
  const sym = simboloFinnhub(ticker);
  if (!sym) return null;

  const agora = Date.now();
  const existente = logoCache.get(sym);
  if (existente && existente.expiraEm > agora) {
    return existente.url;
  }

  const pendente = logoEmCurso.get(sym);
  if (pendente) return pendente;

  const pedido = (async () => {
    try {
      const dados = await finnhubGet<RespostaPerfil2Finnhub>(
        "stock/profile2",
        { symbol: sym },
        REVALIDATE_LOGO_FINNHUB,
      );
      if (dados === null) return null;
      const url = extrairLogoFinnhub(dados);
      logoCache.set(sym, { url, expiraEm: Date.now() + LOGO_CACHE_TTL_MS });
      return url;
    } finally {
      logoEmCurso.delete(sym);
    }
  })();

  logoEmCurso.set(sym, pedido);
  return pedido;
}

/**
 * Devolve o `logoUrl` já guardado na base (se não for o URL legado da FMP)
 * ou resolve o logótipo via Finnhub (`/stock/profile2`) com cache de 30 dias.
 */
export async function resolverLogoEmpresa(
  ticker: string,
  logoUrlDb?: string | null,
): Promise<string | null> {
  const limpo = logoUrlDb?.trim();
  if (limpo && limpo.startsWith("https://") && !limpo.includes("images.financialmodelingprep.com")) {
    return limpo;
  }
  return logoFinnhub(ticker);
}
