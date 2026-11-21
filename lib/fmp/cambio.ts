/**
 * Conversão para dólares das empresas que não reportam em dólares.
 *
 * ── Porque é que isto é preciso ──────────────────────────────────────────
 *
 * As demonstrações financeiras vêm na moeda de reporte (`reportedCurrency`)
 * de cada empresa. Sem conversão, uma empresa dinamarquesa entrava na base
 * com um EPS de 23,03 num campo que a plataforma lê como dólares — onde o
 * valor certo é ~3,15.
 *
 * São catorze empresas do universo, duas delas em watchlists de clientes:
 *
 *     EUR  ASML NOK RACE RYAAY SAP SNY SPOT STLA UL
 *     GBP  BCS BTI GSK
 *     SEK  ERIC
 *     DKK  NVO
 *
 * ── A taxa é a do fecho do período, não a de hoje ────────────────────────
 *
 * Converter dez anos de histórico à taxa de hoje faria o lucro de 2018 mudar
 * de valor sempre que o euro se mexesse. Usa-se o fixing do dia em que o
 * período fechou, que é a convenção contabilística e a única que deixa o
 * histórico estável.
 *
 * ── Fonte: BCE via Frankfurter ───────────────────────────────────────────
 *
 * As taxas de referência diárias do BCE (desde 1999) vêm da Frankfurter API
 * (`https://api.frankfurter.dev/v1/`), sem chave nem limites apertados, como
 * já acontece em `scripts/ingest_fundamentals.py`. Os pedidos vão por ano
 * civil:
 *   · cada resposta é pequena (~250 dias úteis) e fica abaixo do teto de
 *     cache do Next;
 *   · anos passados nunca mudam → Data Cache longa (`revalidate` de 1 ano) e
 *     cache permanente em memória para corridas em lote;
 *   · o ano corrente revalida de 6 em 6 horas (o BCE publica 1× por dia útil).
 */

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
const REVALIDATE_ANO_PASSADO = 365 * 86_400;
const REVALIDATE_ANO_ATUAL = 6 * 3600;
const MAX_RECUO_DIAS = 10;

export type RespostaFrankfurter = {
  amount?: number;
  base?: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  rates?: Record<string, number | Record<string, number>>;
};

type EntradaCache = {
  taxas: Map<string, number>;
  expiraEm: number;
};

const cache = new Map<string, EntradaCache>();
const emCurso = new Map<string, Promise<Map<string, number>>>();

/** Limpa a cache em memória (útil em testes unitários). */
export function limparCacheCambio(): void {
  cache.clear();
  emCurso.clear();
}

/**
 * Extrai um mapa `YYYY-MM-DD → taxa (moeda → USD)` de uma resposta Frankfurter.
 *
 * Garante sempre a direção `moeda → USD` (quantos dólares vale 1 unidade da
 * moeda de reporte):
 *   · se `base === moeda`, lê `rates[data].USD / amount`;
 *   · se `base === "USD"`, inverte (`amount / rates[data][moeda]`);
 *   · se vier noutro pivot (ex.: EUR por omissão), triangula `USD / moeda`.
 */
export function parsearTaxasFrankfurter(
  dados: RespostaFrankfurter,
  moeda: string,
): Map<string, number> {
  const cod = moeda.trim().toUpperCase();
  const out = new Map<string, number>();
  if (!cod || !dados?.rates || typeof dados.rates !== "object") return out;

  const amount = typeof dados.amount === "number" && dados.amount > 0 ? dados.amount : 1;
  const base = dados.base?.trim().toUpperCase();

  const extrair = (linha: Record<string, number>): number | null => {
    let taxa: number | null = null;
    if (!base || base === cod) {
      const usd = linha.USD;
      if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) {
        taxa = usd / amount;
      }
    } else if (base === "USD") {
      const alvo = linha[cod];
      if (typeof alvo === "number" && Number.isFinite(alvo) && alvo > 0) {
        taxa = amount / alvo;
      }
    } else {
      const usd = linha.USD;
      const alvo = linha[cod];
      if (
        typeof usd === "number" &&
        Number.isFinite(usd) &&
        usd > 0 &&
        typeof alvo === "number" &&
        Number.isFinite(alvo) &&
        alvo > 0
      ) {
        taxa = usd / alvo;
      }
    }
    return taxa !== null && Number.isFinite(taxa) && taxa > 0 ? taxa : null;
  };

  for (const [chave, valor] of Object.entries(dados.rates)) {
    if (typeof valor === "number") {
      if (dados.date && /^\d{4}-\d{2}-\d{2}$/.test(dados.date)) {
        const t = extrair(dados.rates as Record<string, number>);
        if (t !== null) out.set(dados.date, t);
      }
      break;
    }
    if (valor && typeof valor === "object" && /^\d{4}-\d{2}-\d{2}$/.test(chave)) {
      const t = extrair(valor as Record<string, number>);
      if (t !== null) out.set(chave, t);
    }
  }

  return out;
}

/**
 * Procura a taxa `moeda → USD` na data indicada ou no último dia útil anterior.
 *
 * O BCE não publica fixings ao fim de semana nem em feriados bancários (ex.:
 * Sexta-Feira Santa e Segunda de Páscoa podem deixar quatro dias seguidos sem
 * cotação). Recua-se até dez dias em UTC — mais do que isso seria inventar.
 */
export function taxaNaData(
  taxas: ReadonlyMap<string, number>,
  data: Date,
  maxRecuoDias = MAX_RECUO_DIAS,
): number | null {
  if (!Number.isFinite(data.getTime())) return null;
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  for (let i = 0; i < maxRecuoDias; i++) {
    const chave = d.toISOString().slice(0, 10);
    const t = taxas.get(chave);
    if (typeof t === "number" && Number.isFinite(t) && t > 0) return t;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}

/** Carrega as taxas diárias de um ano civil para `moeda → USD`. */
async function serieAno(moeda: string, ano: number): Promise<Map<string, number>> {
  const anoAtual = new Date().getUTCFullYear();
  if (ano < 1999 || ano > anoAtual + 1) return new Map();

  const chave = `${moeda}:${ano}`;
  const agora = Date.now();
  const existente = cache.get(chave);
  if (existente && existente.expiraEm > agora) return existente.taxas;

  const pendente = emCurso.get(chave);
  if (pendente) return pendente;

  const pedido = (async () => {
    const revalidate = ano < anoAtual ? REVALIDATE_ANO_PASSADO : REVALIDATE_ANO_ATUAL;
    const url = `${FRANKFURTER_BASE}/${ano}-01-01..${ano}-12-31?base=${encodeURIComponent(moeda)}&symbols=USD`;

    try {
      let resp = await fetch(url, {
        headers: { accept: "application/json" },
        next: { revalidate, tags: ["fx"] },
      });
      if (resp.status === 429 || resp.status >= 500) {
        await new Promise((r) => setTimeout(r, 500));
        resp = await fetch(url, {
          headers: { accept: "application/json" },
          next: { revalidate, tags: ["fx"] },
        });
      }

      if (resp.status === 404) {
        return new Map<string, number>();
      }
      if (!resp.ok) {
        console.error(`[cambio] Frankfurter ${moeda} ${ano} → HTTP ${resp.status}`);
        return new Map<string, number>();
      }

      const dados = (await resp.json()) as RespostaFrankfurter;
      const taxas = parsearTaxasFrankfurter(dados, moeda);
      cache.set(chave, {
        taxas,
        expiraEm: ano < anoAtual ? Infinity : Date.now() + REVALIDATE_ANO_ATUAL * 1000,
      });
      return taxas;
    } catch (erro) {
      console.error(`[cambio] Frankfurter ${moeda} ${ano}:`, erro);
      return new Map<string, number>();
    } finally {
      emCurso.delete(chave);
    }
  })();

  emCurso.set(chave, pedido);
  return pedido;
}

/**
 * Taxa para dólares (`1 moeda = X USD`) na data indicada.
 *
 * A Frankfurter inclui no arranque do ano civil o último dia útil anterior
 * (ex.: 31 de dezembro ao pedir `2025-01-01..2025-12-31`). Ainda assim, se
 * uma data nos primeiros dias de janeiro recuar até dezembro sem o encontrar no
 * mesmo mapa, consulta o ano anterior como salvaguarda.
 */
export async function taxaParaUsd(moeda: string, data: Date): Promise<number | null> {
  const cod = moeda.trim().toUpperCase();
  if (!cod || !Number.isFinite(data.getTime())) return null;
  if (cod === "USD") return 1;

  const ano = data.getUTCFullYear();
  const taxasAno = await serieAno(cod, ano);
  const taxa = taxaNaData(taxasAno, data);
  if (taxa !== null) return taxa;

  if (data.getUTCMonth() === 0 && data.getUTCDate() <= MAX_RECUO_DIAS) {
    const taxasAnterior = await serieAno(cod, ano - 1);
    return taxaNaData(taxasAnterior, data);
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
