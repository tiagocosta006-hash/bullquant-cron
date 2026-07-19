import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Nome do modelo Flash lido SEMPRE do ambiente (nunca hardcoded) — regra do
// CLAUDE.md. Fallback alinhado com o GEMINI_MODEL configurado no projeto.
export const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

/** Instância do modelo Gemini para usar com generateObject / streamText. */
export function geminiModel() {
  return google(GEMINI_MODEL_NAME);
}
