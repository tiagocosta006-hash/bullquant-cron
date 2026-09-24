/**
 * Cliente da Financial Modeling Prep.
 *
 * ── Porque é que isto existe ─────────────────────────────────────────────
 *
 * Substitui a extração própria de XBRL da SEC (`scripts/ingest_fundamentals.py`,
 * 3 044 linhas). Esse motor tinha de escolher, por empresa, qual das tags do
 * XBRL era o lucro — e quando escolhia mal ninguém dava por isso. A Interactive
 * Brokers é o caso que o expôs: sem `NetIncomeLoss`, caía no `ProfitLoss`, que
 * inclui os ~77% do grupo que não pertencem aos acionistas cotados, e o EPS
 * saía a 7,81 em vez de 1,73 — um P/E de 7x onde devia estar 30x.
 *
 * A FMP entrega os campos já resolvidos. Validado a 2026-09-24 contra as sete
 * empresas onde o motor antigo divergia da SEC: acertou nas sete.
 *
 * ── Limites do plano Premium (medidos, não assumidos) ────────────────────
 *
 *   750 pedidos/minuto           → 12,5/s; medi 12/s com 8 em paralelo
 *   uma chamada = uma empresa    → `symbol=AAPL,MSFT` devolve [] (não agrupa)
 *   uma chamada = todo o histórico → 164 trimestres da AAPL, de 1985 a 2026
 *   endpoints `-bulk`            → HTTP 402, são do plano Ultimate
 *
 * O backfill das 559 empresas são ~3 400 chamadas, ~5 minutos.
 */

const BASE = "https://financialmodelingprep.com/stable";

/**
 * Concorrência. O teto são 750/min = 12,5/s; com 8 em paralelo medi 12/s, que
 * é onde a latência de rede e o limite se encontram. Subir isto não acelera —
 * só troca throughput por 429.
 */
const CONCORRENCIA = Number(process.env.FMP_CONCORRENCIA ?? 8);

/** Intervalo mínimo entre pedidos, para não passar os 750/min mesmo em rajada. */
const INTERVALO_MS = Number(process.env.FMP_INTERVALO_MS ?? 80);

export class FmpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = "FmpError";
  }
}

function chave(): string {
  const k = process.env.FMP_API_KEY;
  if (!k) {
    throw new Error(
      "FMP_API_KEY em falta. Define-a no .env.local (dev) ou nos secrets do workflow (CI).",
    );
  }
  return k;
}

let ultimo = 0;
let emCurso = 0;
const fila: Array<() => void> = [];

function dormir(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function aguardarVez(): Promise<void> {
  if (emCurso >= CONCORRENCIA) {
    await new Promise<void>((r) => fila.push(r));
  }
  emCurso++;
  const espera = INTERVALO_MS - (Date.now() - ultimo);
  if (espera > 0) await dormir(espera);
  ultimo = Date.now();
}

function libertar(): void {
  emCurso--;
  fila.shift()?.();
}

/**
 * GET a um endpoint `/stable/`, com ritmo e tentativas.
 *
 * Só repete o que vale a pena repetir. Um 402 (endpoint fora do plano) ou um
 * 401 (chave inválida) não melhoram à segunda — repetir só gasta orçamento e
 * atrasa o erro que o operador precisa de ver.
 */
export async function fmpGet<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  tentativas = 3,
): Promise<T> {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  url.searchParams.set("apikey", chave());

  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    await aguardarVez();
    try {
      const resp = await fetch(url, { headers: { accept: "application/json" } });

      if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
        const corpo = (await resp.text()).slice(0, 200);
        throw new FmpError(corpo, resp.status, endpoint);
      }
      if (!resp.ok) {
        throw new FmpError(`HTTP ${resp.status}`, resp.status, endpoint);
      }

      const dados = (await resp.json()) as T;

      // A FMP responde 200 com `{"Error Message": "..."}` em vez de um código
      // de erro. Sem isto, um símbolo inválido passaria por resposta válida.
      if (dados && typeof dados === "object" && "Error Message" in dados) {
        throw new FmpError(
          String((dados as Record<string, unknown>)["Error Message"]).slice(0, 200),
          200,
          endpoint,
        );
      }
      return dados;
    } catch (erro) {
      ultimoErro = erro;
      if (erro instanceof FmpError && [401, 402, 403, 200].includes(erro.status)) throw erro;
      if (i < tentativas - 1) await dormir(500 * (i + 1));
    } finally {
      libertar();
    }
  }
  throw ultimoErro;
}

/** Corre `fn` sobre todos os itens, respeitando o limite de concorrência. */
export async function emParalelo<T, R>(
  itens: T[],
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.min(CONCORRENCIA, itens.length) }, async () => {
    while (true) {
      const i = proximo++;
      if (i >= itens.length) return;
      out[i] = await fn(itens[i], i);
    }
  });
  await Promise.all(trabalhadores);
  return out;
}
