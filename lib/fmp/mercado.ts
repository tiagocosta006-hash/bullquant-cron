/**
 * Preços para o site: cotações atuais e histórico — SEM FMP (decisão do Costa,
 * 2026-11-21: só APIs públicas e gratuitas).
 *
 *   cotação de uma empresa → Finnhub `/quote` (grátis, 60/min; fiável ao minuto)
 *   cotações em lote       → Nasdaq `quote/watchlist` (sem chave, 20 símbolos/pedido)
 *   histórico de 10 anos   → Nasdaq `quote/{t}/historical`, completado com o fecho
 *                            da Finnhub quando o Nasdaq ainda não tem o último dia
 *
 * Os preços não se guardam na base (o egress do Supabase não aguentava): ficam na
 * Data Cache do Next (`revalidate`), uma chamada por ticker por janela.
 * O nome do ficheiro ficou por compatibilidade com quem o importa.
 */

import { finnhubGet, simboloFinnhub } from "@/lib/finnhub";
import { nasdaqGet, num, dataUs, simboloNasdaq } from "@/lib/fontes/nasdaq";

/** Histórico diário muda uma vez por dia; uma hora de cache é folgada. */
const REVALIDATE_HISTORICO = 3600;
/** Cotações: 5 minutos chega para value investing e poupa pedidos. */
const REVALIDATE_COTACAO = 300;

/** Classes de ações com hífen (BRK-B) — formato antigo da FMP, mantido para quem o usa. */
export function simbolo(ticker: string): string {
  return ticker.toUpperCase().replace(/\./g, "-");
}

/** Limite de pedidos de uma fonte — distinto de "não há dados" (usado pelo servidor MCP). */
export class FmpLimite extends Error {
  constructor(endpoint: string) {
    super(`Limite de pedidos atingido (${endpoint}). Tenta daqui a um minuto.`);
  }
}

/**
 * No site, uma falha da fonte degrada para "sem dados" (a página abre na mesma).
 * O servidor MCP liga o modo estrito para distinguir limite de pedidos de ausência.
 */
let modoEstrito = false;
export function modoEstritoFmp(ligado: boolean) {
  modoEstrito = ligado;
}
void modoEstrito;

// ─── Histórico ─────────────────────────────────────────────────────────────

export type PontoPreco = { date: string; close: number };

type RespostaHistorico = {
  tradesTable?: { rows?: Array<{ date?: string; close?: string }> | null } | null;
};

/**
 * Fechos diários, do mais antigo para o mais recente.
 *
 * `desde` por omissão são 10 anos — a janela que o `CLAUDE.md` §1 decidiu.
 */
export async function historico(ticker: string, desde?: Date): Promise<PontoPreco[]> {
  const inicio = desde ?? new Date(Date.now() - 10 * 365.25 * 86_400_000);
  const hoje = new Date().toISOString().slice(0, 10);
  const [dados, atual] = await Promise.all([
    nasdaqGet<RespostaHistorico>(
      `quote/${encodeURIComponent(simboloNasdaq(ticker))}/historical`,
      { assetclass: "stocks", fromdate: inicio.toISOString().slice(0, 10), todate: hoje, limit: "9999" },
      REVALIDATE_HISTORICO,
    ),
    cotacaoFinnhub(ticker),
  ]);
  const serie: PontoPreco[] = [];
  for (const r of dados?.tradesTable?.rows ?? []) {
    const date = dataUs(r.date);
    const close = num(r.close);
    if (date && close !== null) serie.push({ date, close });
  }
  serie.sort((a, b) => (a.date < b.date ? -1 : 1));
  // O Nasdaq pode ainda não ter o último fecho: junta-se o da Finnhub.
  if (atual?.timestamp && atual.price > 0) {
    const dia = new Date(atual.timestamp * 1000).toISOString().slice(0, 10);
    const ultimo = serie[serie.length - 1];
    if (!ultimo || dia > ultimo.date) serie.push({ date: dia, close: atual.price });
  }
  return serie;
}

/**
 * Reduz uma série a ~`alvo` pontos, mantendo sempre o último (o valor de hoje).
 *
 * Um gráfico de 800 píxeis não desenha 2 500 pontos — o resto é peso morto na
 * resposta ao browser.
 */
export function amostrar<T>(serie: T[], alvo = 800): T[] {
  if (serie.length <= alvo) return serie;
  const passo = Math.ceil(serie.length / alvo);
  const out = serie.filter((_, i) => i % passo === 0);
  const ultimo = serie[serie.length - 1];
  if (out[out.length - 1] !== ultimo) out.push(ultimo);
  return out;
}

/** Um ponto por semana (o último dia de cada), para séries longas de múltiplos. */
export function semanal(serie: PontoPreco[]): PontoPreco[] {
  const porSemana = new Map<string, PontoPreco>();
  for (const p of serie) {
    const d = new Date(p.date + "T00:00:00Z");
    const seg = new Date(d);
    seg.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    porSemana.set(seg.toISOString().slice(0, 10), p);
  }
  return [...porSemana.values()];
}

// ─── Cotações ──────────────────────────────────────────────────────────────

export type Cotacao = {
  ticker: string;
  price: number;
  change: number | null;
  changePercentage: number | null;
  previousClose: number | null;
  marketCap: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  timestamp?: number;
};

type QuoteFinnhub = { c?: number; d?: number | null; dp?: number | null; pc?: number; o?: number; h?: number; l?: number; t?: number };

async function cotacaoFinnhub(ticker: string, revalidate = REVALIDATE_COTACAO): Promise<Cotacao | null> {
  const q = await finnhubGet<QuoteFinnhub>("quote", { symbol: simboloFinnhub(ticker) }, revalidate);
  // A Finnhub responde 200 com tudo a 0 para símbolos que não conhece.
  if (!q || typeof q.c !== "number" || q.c <= 0) return null;
  return {
    ticker: ticker.toUpperCase(),
    price: q.c,
    change: q.d ?? null,
    changePercentage: q.dp ?? null,
    previousClose: q.pc ?? null,
    marketCap: null,
    open: q.o || null,
    dayHigh: q.h || null,
    dayLow: q.l || null,
    timestamp: q.t,
  };
}

type LinhaWatchlist = {
  symbol?: string;
  lastSalePrice?: string;
  netChange?: string;
  percentageChange?: string;
  previousClosePrice?: number | string;
  openingPrice?: number | string;
  lastTradeTimestampDateTime?: string;
};

/** Até 20 símbolos por pedido (limite do Nasdaq, medido a 2026-11-21). */
const LOTE_NASDAQ = 20;
/** Até aqui as cotações vêm uma a uma da Finnhub (limite de 30 pedidos/s e 60/min). */
const LOTE_FINNHUB = 30;

/**
 * Cotação atual de vários tickers. Devolve um mapa pelo ticker tal como a base o
 * escreve (com ponto). Os que o Nasdaq não devolver tentam-se na Finnhub, se
 * forem poucos (o lote de 500 do dashboard não pode gastar 500 pedidos da Finnhub).
 */
export async function cotacoes(tickers: string[], revalidate = REVALIDATE_COTACAO): Promise<Map<string, Cotacao>> {
  const out = new Map<string, Cotacao>();
  const unicos = [...new Set(tickers.map((t) => t.toUpperCase()).filter((t) => t && !t.startsWith("^")))];
  if (unicos.length === 0) return out;

  // Lotes pequenos (watchlist, cartões do dashboard, carteira) → Finnhub, ao minuto.
  // O Nasdaq chegou a servir o fecho da véspera horas depois do fecho (20/11/2026),
  // por isso só fica com os lotes grandes, onde a Finnhub (60/min) não chega.
  if (unicos.length <= LOTE_FINNHUB) {
    const qs = await Promise.all(unicos.map((t) => cotacaoFinnhub(t, revalidate)));
    for (const c of qs) if (c) out.set(c.ticker, c);
    if (out.size === unicos.length) return out;
  }

  const pendentes = unicos.filter((t) => !out.has(t));
  const blocos: string[][] = [];
  for (let i = 0; i < pendentes.length; i += LOTE_NASDAQ) blocos.push(pendentes.slice(i, i + LOTE_NASDAQ));
  const respostas = await Promise.all(
    blocos.map((b) =>
      nasdaqGet<LinhaWatchlist[]>(
        "quote/watchlist",
        { symbol: b.map((t) => `${simboloNasdaq(t)}|stocks`) },
        revalidate,
      ),
    ),
  );
  for (const linhas of respostas) {
    for (const q of linhas ?? []) {
      const ticker = (q.symbol ?? "").toUpperCase();
      const price = num(q.lastSalePrice);
      if (!ticker || price === null || price <= 0) continue;
      const quando = q.lastTradeTimestampDateTime ? Date.parse(q.lastTradeTimestampDateTime + "Z") : NaN;
      out.set(ticker, {
        ticker,
        price,
        change: num(q.netChange),
        changePercentage: num(q.percentageChange),
        previousClose: num(q.previousClosePrice),
        marketCap: null,
        open: num(q.openingPrice),
        dayHigh: null,
        dayLow: null,
        timestamp: Number.isFinite(quando) ? Math.floor(quando / 1000) : undefined,
      });
    }
  }

  const faltam = unicos.filter((t) => !out.has(t));
  if (faltam.length > 0 && faltam.length <= 10 && unicos.length > LOTE_FINNHUB) {
    const extra = await Promise.all(faltam.map((t) => cotacaoFinnhub(t, revalidate)));
    for (const c of extra) if (c) out.set(c.ticker, c);
  }
  return out;
}

/** Uma empresa: Finnhub (ao minuto); o Nasdaq só se a Finnhub falhar. */
export async function cotacao(ticker: string): Promise<Cotacao | null> {
  return (await cotacaoFinnhub(ticker)) ?? (await cotacoes([ticker])).get(ticker.toUpperCase()) ?? null;
}

// ─── Notícias por empresa (Finnhub /company-news) ─────────────────────────

export type NoticiaEmpresa = {
  id: number;
  /** Segundos Unix, devolvidos diretamente pela Finnhub. */
  datetime: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
};

type LinhaNoticiaFinnhub = {
  id?: number;
  datetime?: number;
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  image?: string;
};

/**
 * Mapeia o payload bruto de `/company-news` da Finnhub para `NoticiaEmpresa[]`,
 * descartando entradas sem título/URL/timestamp e ordenando da mais recente
 * para a mais antiga.
 *
 * Extraído como função pura para permitir testes unitários determinísticos sem
 * chamadas de rede.
 */
export function mapearNoticiasFinnhub(linhas: unknown): NoticiaEmpresa[] {
  if (!Array.isArray(linhas)) return [];

  const out: NoticiaEmpresa[] = [];
  for (const bruto of linhas) {
    if (!bruto || typeof bruto !== "object") continue;
    const l = bruto as LinhaNoticiaFinnhub;
    const headline = typeof l.headline === "string" ? l.headline.trim() : "";
    const url = typeof l.url === "string" ? l.url.trim() : "";
    const dt = typeof l.datetime === "number" && Number.isFinite(l.datetime) ? Math.floor(l.datetime) : NaN;
    if (!headline || !url || !Number.isFinite(dt) || dt <= 0) continue;

    // A Finnhub inclui `id` numérico; se por acaso faltar, gera-se um hash
    // estável a partir do URL para manter as `key` do React determinísticas.
    const id =
      typeof l.id === "number" && Number.isFinite(l.id) && l.id >= 0
        ? Math.floor(l.id)
        : [...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0) >>> 0;

    out.push({
      id,
      datetime: dt,
      headline,
      summary: typeof l.summary === "string" ? l.summary.trim() : "",
      source: typeof l.source === "string" ? l.source.trim() : "",
      url,
      image: typeof l.image === "string" ? l.image.trim() : "",
    });
  }

  return out.sort((a, b) => b.datetime - a.datetime);
}

/**
 * Notícias de uma empresa nos últimos `dias`, mais recentes primeiro.
 *
 * Vem da Finnhub (`/company-news`, cache de 15 min) em vez da FMP; em caso de
 * falha da fonte degrada para lista vazia para não quebrar a página nem o brief.
 */
export async function noticias(ticker: string, dias: number): Promise<NoticiaEmpresa[]> {
  const sym = simboloFinnhub(ticker);
  if (!sym) return [];

  const ate = new Date();
  const de = new Date(ate.getTime() - dias * 86_400_000);
  const linhas = await finnhubGet<LinhaNoticiaFinnhub[]>(
    "company-news",
    {
      symbol: sym,
      from: de.toISOString().slice(0, 10),
      to: ate.toISOString().slice(0, 10),
    },
    900,
  );
  return mapearNoticiasFinnhub(linhas);
}
