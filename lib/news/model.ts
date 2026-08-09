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

/** Instância a usar em triage.ts e generate.ts. */
export function newsModel() {
  const apiKey = process.env.NEWS_GEMINI_API_KEY;
  if (!apiKey) return geminiModel();
  return createGoogleGenerativeAI({ apiKey })(newsModelName());
}
