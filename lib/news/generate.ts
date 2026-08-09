import { generateObject } from "ai";
import { z } from "zod";
import { newsModel, newsModelName } from "./model";
import { SENTIMENTS } from "./types";
import { extractBodies } from "./extract";
import type { TriageResult } from "./triage";

const articleSchema = z.object({
  titulo: z.string().describe("Título em PT-PT, factual e apelativo, máx. 90 caracteres"),
  resumoCurto: z
    .string()
    .describe("Uma ou duas frases, máx. 200 caracteres. É o que aparece no Discord."),
  corpo: z
    .string()
    .describe("3 a 5 parágrafos em markdown simples, sem cabeçalhos nem título repetido"),
  impacto: z
    .string()
    .describe("Um parágrafo focado exclusivamente no impacto nos mercados"),
  tickersAfetados: z.array(z.string()),
  sentimento: z.enum(SENTIMENTS),
});

export interface GeneratedArticle {
  titulo: string;
  resumoCurto: string;
  corpo: string;
  impacto: string;
  tickers: string[];
  sentimento: (typeof SENTIMENTS)[number];
  sources: Array<{ name: string; url: string }>;
  imageUrl: string | null;
  modelVersion: string;
}

const WRITER_SYSTEM = `És o redator do terminal de notícias da Bull Value, uma plataforma portuguesa de análise fundamental de ações. Escreves mini-artigos financeiros para investidores particulares informados.

REGRAS DE LÍNGUA (inegociáveis):
- Português europeu de Portugal. Nunca português do Brasil.
- Usa "utilizador", "ações", "gestão", "equipa", "atual", "setor", "económico", "receita".
- Nunca uses gerúndio brasileiro ("está subindo"): escreve "está a subir".
- Termos financeiros consagrados em inglês (earnings, guidance, spread, hedge) podem ficar em inglês, em itálico.

REGRAS EDITORIAIS (inegociáveis):
- Escreve APENAS com base na informação fornecida. Nunca inventes números, percentagens, datas, citações ou nomes que não estejam no input.
- Se não souberes um valor concreto, descreve qualitativamente em vez de estimar.
- O campo ARTIGO é o texto original da fonte e serve para COMPREENDERES a notícia. Escreve uma peça nova em português: nunca traduzas frase a frase nem reproduzas a estrutura de parágrafos do original.
- Não copies mais do que uma expressão curta seguida do original. Citações diretas só entre aspas e atribuídas a quem as disse.
- Quando as fontes se contradizem num facto, fica pelo que é comum a várias ou diz que os relatos divergem.
- Nunca dês recomendações de investimento. Não escrevas "compre", "venda", "é uma oportunidade". Descreve o impacto, não o que o leitor deve fazer.
- Tom profissional e direto, com energia jornalística. Sem hipérbole vazia, sem clickbait, sem emojis.
- Não te refiras a ti próprio nem ao processo ("segundo as fontes fornecidas", "este artigo").
- Frases curtas. Voz ativa.

ESTRUTURA:
- O primeiro parágrafo responde ao quê e ao porquê.
- Os seguintes dão contexto e enquadramento.
- O campo "impacto" é separado e trata só de mercados: setores, classes de ativos, tickers.`;

/** Gera o mini-artigo em PT-PT para uma história aprovada na triagem. */
export async function generateArticle(triaged: TriageResult): Promise<GeneratedArticle> {
  const { cluster } = triaged;

  const sources = [...new Map(cluster.items.map((i) => [i.source, i])).values()].map((i) => ({
    name: i.source,
    url: i.sourceUrl,
  }));

  // Descarrega o corpo dos artigos das fontes mais informativas. Só acontece
  // aqui — para as ≤5 histórias já aprovadas — e o texto não é persistido:
  // serve de contexto ao LLM e é descartado no fim desta função.
  const candidatos = [...new Map(cluster.items.map((i) => [i.source, i])).values()];
  const corpos = await extractBodies(candidatos.map((i) => i.sourceUrl));
  const corpoPorUrl = new Map(corpos.map((c) => [c.url, c.text]));

  console.log(
    `[news] corpo obtido de ${corpos.length}/${Math.min(candidatos.length, 3)} fontes para "${cluster.lead.title.slice(0, 60)}"`
  );

  const material = cluster.items
    .slice(0, 6)
    .map((i) => {
      const parts = [`FONTE: ${i.source}`, `MANCHETE: ${i.title}`];
      if (i.summary) parts.push(`RESUMO: ${i.summary.slice(0, 800)}`);
      const corpo = corpoPorUrl.get(i.sourceUrl);
      if (corpo) parts.push(`ARTIGO:\n${corpo}`);
      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  // Sem corpo nenhum, o LLM só tem manchetes — vale a pena saber-se, porque é
  // aí que o risco de o artigo sair vago é maior.
  if (corpos.length === 0) {
    console.warn(
      `[news] sem corpo de artigo para "${cluster.lead.title.slice(0, 60)}" — a escrever só com manchetes e resumos`
    );
  }

  const { object } = await generateObject({
    model: newsModel(),
    schema: articleSchema,
    system: WRITER_SYSTEM,
    prompt: `Escreve o mini-artigo para esta história.

Categoria atribuída: ${triaged.category}
${triaged.tickers.length > 0 ? `Tickers envolvidos: ${triaged.tickers.join(", ")}` : ""}

MATERIAL DE ORIGEM (${sources.length} fonte(s)):

${material}`,
    temperature: 0.4,
  });

  const imageUrl = cluster.items.find((i) => i.imageUrl)?.imageUrl ?? null;

  // O LLM pode devolver tickers a mais; cruzamos com os da triagem para não
  // publicar símbolos inventados.
  const allowed = new Set(triaged.tickers);
  const tickers = object.tickersAfetados
    .map((t) => t.toUpperCase())
    .filter((t) => allowed.has(t));

  return {
    titulo: object.titulo.trim(),
    resumoCurto: object.resumoCurto.trim().slice(0, 200),
    corpo: object.corpo.trim(),
    impacto: object.impacto.trim(),
    tickers: tickers.length > 0 ? tickers : triaged.tickers,
    sentimento: object.sentimento,
    sources,
    imageUrl,
    modelVersion: newsModelName(),
  };
}
