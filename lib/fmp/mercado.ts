/**
 * Preços da FMP para o site: cotações atuais e histórico.
 *
 * ── Porque é que os preços deixam de estar na base ───────────────────────
 *
 * A tabela `prices` tinha 2 milhões de linhas copiadas de fontes antigas, e
 * uma única consulta a lê-la em lote levou o egress do Supabase a ~700 MB por
 * dia — 3,35 GB dos 5 do plano gratuito ao sétimo dia do ciclo. Os preços não
 * são nossos: a FMP devolve dez anos de uma empresa numa chamada. Guardá-los
 * era pagar em egress para servir uma cópia.
 *
 * Agora vêm da FMP e ficam na Data Cache do Next (`revalidate`), portanto a
 * FMP é chamada no máximo uma vez por ticker por janela, e o Supabase não é
 * tocado de todo para preços.
 *
 * Diferente de `lib/fmp/cliente.ts`, que é para os scripts de ingestão em lote
 * (ritmo, tentativas, concorrência). Aqui cada pedido é isolado e a cache do
 * Next é que evita repetições.
 */

const BASE = "https://financialmodelingprep.com/stable";

/** Histórico diário muda uma vez por dia; uma hora de cache é folgada. */
const REVALIDATE_HISTORICO = 3600;
/** Cotações: 5 minutos chega para value investing e poupa pedidos. */
const REVALIDATE_COTACAO = 300;

/** A FMP escreve as classes de ações com hífen (BRK-B), a base com ponto. */
export function simbolo(ticker: string): string {
  return ticker.toUpperCase().replace(/\./g, "-");
}

function chave(): string {
  const k = process.env.FMP_API_KEY;
  if (!k) throw new Error("FMP_API_KEY em falta no ambiente do site.");
  return k;
}

export async function get<T>(
  endpoint: string,
  params: Record<string, string>,
  revalidate: number,
): Promise<T | null> {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", chave());

  const resp = await fetch(url, { next: { revalidate, tags: ["fmp"] } });
  if (!resp.ok) {
    console.error(`[fmp] ${endpoint} → HTTP ${resp.status}`);
    return null;
  }
  const dados = (await resp.json()) as T;
  // A FMP responde 200 com {"Error Message": ...} em vez de um código de erro.
  if (dados && typeof dados === "object" && !Array.isArray(dados) && "Error Message" in dados) {
    console.error(`[fmp] ${endpoint}: ${(dados as Record<string, unknown>)["Error Message"]}`);
    return null;
  }
  return dados;
}

// ─── Histórico ─────────────────────────────────────────────────────────────

export type PontoPreco = { date: string; close: number };

type LinhaLight = { symbol: string; date: string; price: number; volume?: number };

/**
 * Fechos diários, do mais antigo para o mais recente.
 *
 * `desde` por omissão são 10 anos — a janela que o `CLAUDE.md` §1 decidiu.
 * O endpoint `light` traz só data e preço, que é tudo o que um gráfico usa.
 */
export async function historico(ticker: string, desde?: Date): Promise<PontoPreco[]> {
  const inicio = desde ?? new Date(Date.now() - 10 * 365.25 * 86_400_000);
  const linhas = await get<LinhaLight[]>(
    "historical-price-eod/light",
    {
      symbol: simbolo(ticker),
      from: inicio.toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
    },
    REVALIDATE_HISTORICO,
  );
  if (!Array.isArray(linhas)) return [];
  return linhas
    .filter((l) => typeof l.price === "number")
    .map((l) => ({ date: l.date, close: l.price }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
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
};

type LinhaQuote = {
  symbol: string;
  price: number;
  change?: number;
  changePercentage?: number;
  previousClose?: number;
  marketCap?: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
};

/**
 * Cotação atual de vários tickers numa só chamada.
 *
 * O `batch-quote` aceita os 559 de uma vez (testado a 2026-09-24). Devolve um
 * mapa pelo ticker tal como a base o escreve (com ponto), para quem chama não
 * ter de saber da conversão.
 */
export async function cotacoes(tickers: string[]): Promise<Map<string, Cotacao>> {
  const out = new Map<string, Cotacao>();
  if (tickers.length === 0) return out;

  const porSimbolo = new Map(tickers.map((t) => [simbolo(t), t]));
  // Em blocos, para o URL não ficar demasiado longo com centenas de tickers.
  const blocos: string[][] = [];
  const todos = [...porSimbolo.keys()];
  for (let i = 0; i < todos.length; i += 200) blocos.push(todos.slice(i, i + 200));

  const respostas = await Promise.all(
    blocos.map((b) => get<LinhaQuote[]>("batch-quote", { symbols: b.join(",") }, REVALIDATE_COTACAO)),
  );
  for (const linhas of respostas) {
    if (!Array.isArray(linhas)) continue;
    for (const q of linhas) {
      const ticker = porSimbolo.get(q.symbol) ?? q.symbol;
      out.set(ticker, {
        ticker,
        price: q.price,
        change: q.change ?? null,
        changePercentage: q.changePercentage ?? null,
        previousClose: q.previousClose ?? null,
        marketCap: q.marketCap ?? null,
        open: q.open ?? null,
        dayHigh: q.dayHigh ?? null,
        dayLow: q.dayLow ?? null,
      });
    }
  }
  return out;
}

/** Atalho para um só ticker. */
export async function cotacao(ticker: string): Promise<Cotacao | null> {
  return (await cotacoes([ticker])).get(ticker.toUpperCase()) ?? null;
}
