import { fmpGet } from "./cliente";

/**
 * Conversão para dólares das empresas que não reportam em dólares.
 *
 * ── Porque é que isto é preciso ──────────────────────────────────────────
 *
 * A FMP responde sempre na moeda de REPORTE da empresa. Não há parâmetro para
 * pedir noutra — testei `reportedCurrency=USD`, `currency=USD` e sem
 * parâmetro, e a Novo Nordisk devolve coroas dinamarquesas nas três.
 *
 * São catorze empresas do universo, duas delas em watchlists de clientes:
 *
 *     EUR  ASML NOK RACE RYAAY SAP SNY SPOT STLA UL
 *     GBP  BCS BTI GSK
 *     SEK  ERIC
 *     DKK  NVO
 *
 * Sem conversão, a Novo Nordisk entrava na base com um EPS de 23,03 num campo
 * que a plataforma lê como dólares — onde o valor certo é ~3,15.
 *
 * ── A taxa é a do fecho do período, não a de hoje ────────────────────────
 *
 * Converter dez anos de histórico à taxa de hoje faria o lucro de 2018 mudar
 * de valor sempre que o euro se mexesse. Usa-se a taxa do dia em que o período
 * fechou, que é a convenção contabilística e a única que deixa o histórico
 * estável.
 *
 * Uma chamada por moeda traz dez anos de cotações diárias, por isso isto custa
 * quatro pedidos no total.
 */

type Serie = Array<{ date: string; price: number }>;

const cache = new Map<string, Map<string, number>>();

/** Carrega, uma vez por moeda, o histórico diário contra o dólar. */
async function serie(moeda: string): Promise<Map<string, number>> {
  const par = `${moeda.toUpperCase()}USD`;
  const existente = cache.get(par);
  if (existente) return existente;

  const linhas = await fmpGet<Serie>("historical-price-eod/light", {
    symbol: par,
    from: "2010-01-01",
    to: new Date().toISOString().slice(0, 10),
  });

  const m = new Map<string, number>();
  for (const l of linhas) if (l.price) m.set(l.date, l.price);
  cache.set(par, m);
  return m;
}

/**
 * Taxa para dólares na data indicada.
 *
 * Os mercados cambiais não abrem todos os dias e muitos períodos fecham a um
 * sábado ou feriado. Recua-se até dez dias à procura da última cotação — mais
 * do que isso seria estar a inventar.
 */
export async function taxaParaUsd(moeda: string, data: Date): Promise<number | null> {
  if (moeda.toUpperCase() === "USD") return 1;

  const m = await serie(moeda);
  const d = new Date(data);
  for (let i = 0; i < 10; i++) {
    const chave = d.toISOString().slice(0, 10);
    const t = m.get(chave);
    if (t) return t;
    d.setDate(d.getDate() - 1);
  }
  return null;
}

/**
 * Converte os campos monetários de uma linha, deixando intactos os que não o
 * são.
 *
 * Os rácios (margens, ROE, ROIC) são adimensionais e não se convertem — uma
 * margem de 23% é 23% em qualquer moeda. Converter um rácio seria um erro
 * silencioso do tipo que este projeto existe para eliminar, por isso a lista
 * do que NÃO se toca é explícita e não inferida.
 */
const ADIMENSIONAIS = new Set([
  "grossMargin",
  "operatingMargin",
  "netMargin",
  "roic",
  "returnOnEquity",
  "sharesOutstanding",
]);

const NAO_MONETARIOS = new Set([
  "periodType",
  "fiscalYear",
  "fiscalQuarter",
  "periodEnd",
  "filedAt",
  "reportedCurrency",
  "fxRate",
  "source",
]);

export function converterLinha(
  linha: Record<string, unknown>,
  taxa: number,
): Record<string, unknown> {
  if (taxa === 1) return linha;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(linha)) {
    if (typeof v === "number" && !ADIMENSIONAIS.has(k) && !NAO_MONETARIOS.has(k)) {
      out[k] = v * taxa;
    } else {
      out[k] = v;
    }
  }
  return out;
}
