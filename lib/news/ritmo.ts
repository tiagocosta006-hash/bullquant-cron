/**
 * Ritmo das chamadas ao Gemini no ingestor de notícias.
 *
 * ── O que estava a acontecer ──────────────────────────────────────────────
 *
 * O nível gratuito do Gemini permite 5 pedidos POR MINUTO ao gemini-2.5-flash.
 * O ingestor disparava-os em rajada — uma triagem seguida de até cinco
 * artigos, todos em poucos segundos. Corrida real de 20 de Setembro de 2026:
 *
 *     16:45:02  triagem termina, 10 histórias passam o limiar
 *     16:45:37  1º artigo — "Failed after 3 attempts"
 *     16:45:44  2º artigo — "Failed after 3 attempts"
 *     16:45:52  3º artigo — "Failed after 3 attempts"
 *     16:45:52  [news] 0/5 artigos processados
 *
 * O erro do Google era explícito: `limit: 5` e `Please retry in 22.1s`. Não
 * era a quota diária esgotada — era ritmo a mais.
 *
 * E as tentativas automáticas do AI SDK (3 por chamada, por omissão) pioravam
 * o próprio problema: cada artigo falhado gastava três pedidos do minuto
 * seguinte, que é exactamente o recurso que faltava.
 *
 * ── A correcção ───────────────────────────────────────────────────────────
 *
 * Uma fila com espaçamento mínimo entre chamadas, tal como o
 * `SLEEP_BETWEEN = 13` que o `scripts/ingest_prices.py` já usava para os 5
 * pedidos/minuto da Polygon. As tentativas passam pela mesma fila, por isso
 * uma repetição nunca fura o ritmo.
 */

/** 5 pedidos/minuto = um a cada 12s. 13s dá a folga do relógio do servidor. */
const INTERVALO_MS = Number(process.env.NEWS_GEMINI_INTERVALO_MS ?? 13_000);

let ultimaChamada = 0;
let fila: Promise<unknown> = Promise.resolve();

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Corre `fn` respeitando o espaçamento mínimo desde a chamada anterior.
 *
 * As chamadas são serializadas: encadeiam-se numa fila única, por isso duas
 * invocações concorrentes não partilham a mesma janela. Uma falha de `fn` não
 * parte a fila — a seguinte continua a ser espaçada na mesma.
 */
export async function comRitmo<T>(fn: () => Promise<T>): Promise<T> {
  const executar = async (): Promise<T> => {
    const espera = INTERVALO_MS - (Date.now() - ultimaChamada);
    if (espera > 0) await dormir(espera);
    ultimaChamada = Date.now();
    return fn();
  };

  const resultado = fila.then(executar, executar);
  // A fila guarda só o "quando acabou", nunca o valor nem o erro: sem este
  // catch, uma chamada falhada rejeitava a fila e derrubava todas as
  // seguintes.
  fila = resultado.then(
    () => undefined,
    () => undefined,
  );
  return resultado;
}

/** O erro do Google quando se fura a quota (por minuto ou por dia). */
export function eQuotaExcedida(erro: unknown): boolean {
  const texto = erro instanceof Error ? `${erro.message}` : String(erro);
  return (
    texto.includes("exceeded your current quota") ||
    texto.includes("RESOURCE_EXHAUSTED") ||
    texto.includes("generate_content_free_tier_requests")
  );
}
