import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { geminiModel, GEMINI_MODEL_NAME } from "@/lib/ai/gemini";

/**
 * Modelo do Terminal de Notícias.
 *
 * Usa uma conta Gemini própria (`NEWS_GEMINI_API_KEY`), separada da do resto da
 * app, por duas razões:
 *  - o ingestor corre de hora a hora em cron e consumiria a quota gratuita que
 *    o analista e os briefs precisam para servir utilizadores em tempo real;
 *  - um 429 no cron é adiável, um 429 no analista é uma falha visível.
 *
 * Sem `NEWS_GEMINI_API_KEY` definida, cai para o acessor global de
 * `lib/ai/gemini.ts` — o pipeline continua a funcionar com a conta partilhada.
 *
 * O nome do modelo vem SEMPRE do ambiente, nunca hardcoded (regra do CLAUDE.md).
 *
 * ⚠️ Tudo é lido DENTRO das funções, nunca no topo do módulo. Em ESM os imports
 * são avaliados antes do corpo do módulo que importa, por isso um
 * `const key = process.env.X` aqui correria antes do `dotenv.config()` do
 * `scripts/ingest_news.ts` e a chave apareceria sempre vazia.
 */

/** Nome do modelo em uso. Só é fiável depois do ambiente estar carregado. */
export function newsModelName(): string {
  return process.env.NEWS_GEMINI_MODEL || GEMINI_MODEL_NAME;
}

/**
 * Modelo alternativo, para quando o principal responde "experiencing high
 * demand".
 *
 * Esse erro não é quota nossa — é capacidade do Google no nível gratuito, e
 * chega a durar minutos. A 21 de Setembro de 2026 derrubou a corrida das
 * 00:41 depois de três tentativas espaçadas em 31 segundos, e o terminal ficou
 * sem artigo novo desde 13 de Setembro.
 *
 * O flash-lite tem fila própria e orçamento diário próprio (RPM 10, RPD 20,
 * contra RPM 5 e RPD 20 do flash), por isso não é só uma segunda tentativa:
 * é uma segunda porta. Escreve pior do que o flash, mas um artigo escrito por
 * um modelo mais fraco vale mais do que um terminal parado.
 */
export function newsModelFallbackName(): string {
  return process.env.NEWS_GEMINI_MODEL_FALLBACK || "gemini-2.5-flash-lite";
}

/**
 * Instância a usar em triage.ts e generate.ts.
 *
 * `tentativa` é o número da tentativa em curso (0 = primeira). As primeiras
 * insistem no modelo principal, porque a sobrecarga costuma passar sozinha; a
 * partir da terceira troca-se de modelo, que é quando já não está a passar.
 */
export function newsModel(tentativa = 0) {
  const apiKey = process.env.NEWS_GEMINI_API_KEY;
  const nome = tentativa >= 2 ? newsModelFallbackName() : newsModelName();
  if (!apiKey) return geminiModel(nome);
  return createGoogleGenerativeAI({ apiKey })(nome);
}
