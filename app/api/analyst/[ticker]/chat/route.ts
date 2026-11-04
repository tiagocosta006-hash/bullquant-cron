import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { streamText, stepCountIs, Output, createUIMessageStreamResponse } from "ai";
import { geminiModel } from "@/lib/ai/gemini";
import { buildCompanyContext } from "@/lib/ai/context";
import { assertCreditsAvailable, chargeCredits } from "@/lib/ai/credits";
import { createComparePeerTool } from "@/lib/ai/tools";
import { analystReplySchema, analystReplyStream } from "@/lib/ai/chat-response";
import { z } from "zod";

export const maxDuration = 60;

// Trim do texto do 10-K injetado no chat — grounding profundo sem rebentar
// custo/latência por mensagem. O relatório já destila o essencial; isto dá
// margem para perguntas que precisem de ir ao filing.
const MAX_FILING_CHARS = 250_000;

const chatRequest = z.object({
  locale: z.enum(["pt", "en"]).default("pt"),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(24_000),
  })).min(1).max(40),
}).refine(({ messages }) => messages.at(-1)?.role === "user")
  .refine(({ messages }) => messages.reduce((total, m) => total + m.content.length, 0) <= 120_000);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  try {
    const { ticker } = await params;
    if (!ticker) return NextResponse.json({ error: "Ticker is required" }, { status: 400 });

    const body = await request.json().catch(() => null);
    const parsed = chatRequest.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_messages" }, { status: 400 });
    }
    const { messages, locale } = parsed.data;

    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() },
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // Auth + gating: o chat é uma feature Pro.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    });
    if (dbUser?.plan !== "PRO") {
      return NextResponse.json(
        { error: "pro_required", message: "O chat com o Analista é exclusivo Pro." },
        { status: 403 },
      );
    }

    // Créditos — cada mensagem reenvia até 250K chars de contexto; sem isto,
    // um utilizador Pro podia mandar mensagens ilimitadas de graça.
    const rateLimitError = await assertCreditsAvailable(user.id, dbUser.plan, "analyst_chat");
    if (rateLimitError) {
      return NextResponse.json(rateLimitError, { status: 429 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    // Grounding: números da BD + relatório já gerado + slice do 10-K cacheado.
    const [context, report, filing] = await Promise.all([
      buildCompanyContext(company),
      prisma.analystReport.findUnique({ where: { companyId: company.id } }),
      prisma.filingCache.findFirst({
        where: { companyId: company.id },
        orderBy: { fetchedAt: "desc" },
      }),
    ]);

    const parts: string[] = [context.text];
    if (report?.reportData) {
      parts.push(`\n=== RELATÓRIO DO ANALISTA (já gerado, com citações) ===\n${JSON.stringify(report.reportData)}`);
    }
    if (filing?.text) {
      parts.push(
        `\n=== EXCERTO DO RELATÓRIO ANUAL (${filing.form}) ===\n${filing.text.slice(0, MAX_FILING_CHARS)}`,
      );
    }
    const grounding = parts.join("\n");

    const system = `És um assistente de IA de análise de empresas que cobre EXCLUSIVAMENTE a ${company.name} (${company.ticker}). ${locale === "en" ? "Respondes em inglês" : "Respondes em português europeu (pt-PT)"}, de forma direta e útil, de modo informativo e geral. És um sistema de IA, não uma pessoa, e não prestas aconselhamento de investimento.

CONTEXTO VERIFICADO (a tua única fonte de verdade):
${grounding}

REGRAS:
1. Números financeiros: usa APENAS os do contexto verificado. Nunca inventes nem estimes.
2. Qualitativo: baseia-te no relatório e no excerto do 10-K acima. Quando citares um facto do filing, indica que vem do relatório anual.
3. Se a resposta não estiver no contexto, diz claramente "Isso não está no filing/dados que tenho" — NUNCA inventes.
4. Sê conciso. Usa números concretos do contexto quando ajudarem.
5. Se o utilizador pedir para comparar com um concorrente/peer, usa a tool "comparePeer" — nunca inventes números ou qualitativo de outra empresa sem a chamar primeiro.
6. NUNCA digas se o utilizador deve comprar, vender ou manter um ativo, nunca indiques preços-alvo nem "valor justo", e nunca adaptes a resposta à situação financeira, aos objetivos ou ao perfil de risco do utilizador. Se pedirem uma recomendação ("devo comprar?", "vale a pena?"), explica em uma frase que és uma ferramenta informativa e que não dás recomendações, e responde só com os factos, os números e os riscos que constam do contexto. Se o utilizador partilhar dados pessoais ou financeiros sensíveis, não os repitas e lembra-o de não os partilhar.
7. No campo citations, inclui até cinco excertos LITERAIS do contexto que sustentem os factos importantes da resposta. Não inventes citações nem repitas o mesmo excerto. Se não houver excerto que comprove um facto, não lhe atribuas uma citação.
8. No campo action, sugere no máximo UMA próxima ação útil na plataforma (destination: "dcf" ou "compare"), ou null se não ajudar a responder à pergunta. Não são ferramentas: estes campos são metadados da tua resposta.
9. Consulta comparePeer apenas se precisares de comparar empresas, antes de redigir a resposta. Se forem vários peers, consulta-os na mesma etapa, em paralelo. Não repitas consultas. Para perguntas sobre a empresa atual, responde diretamente a partir do contexto, sem chamar ferramentas.
10. Escreve UMA única resposta final no campo answer, tendo em conta o histórico. Não escrevas preâmbulos como "vou verificar", não repitas a resposta e não exponhas chamadas ou erros técnicos das ferramentas. Usa parágrafos curtos e listas simples; não uses tabelas Markdown, títulos com # nem asteriscos de formatação.`;

    const result = streamText({
      model: geminiModel(),
      system,
      messages,
      abortSignal: request.signal,
      timeout: { totalMs: 45_000 },
      maxRetries: 0,
      maxOutputTokens: 4096,
      output: Output.object({ schema: analystReplySchema }),
      tools: {
        comparePeer: createComparePeerTool(company, user.id, dbUser.plan),
      },
      // Only a genuine peer lookup can add turns. Reserve the last for text.
      stopWhen: stepCountIs(2),
      prepareStep: ({ stepNumber }) => stepNumber >= 1 ? { toolChoice: "none" as const } : {},
    });

    // Cobrar créditos — o custo real acontece ao chamar o Gemini (já commitado
    // acima), não faz sentido só cobrar se o stream terminar com sucesso.
    chargeCredits(user.id, company.ticker, "analyst_chat").catch(() => {});

    return createUIMessageStreamResponse({ stream: analystReplyStream(result, {
      ticker: company.ticker,
      grounding,
      onError: (error) => {
        console.error("Analyst chat stream error:", error);
        const msg = error instanceof Error ? error.message : String(error);
        // Nunca expor o erro bruto do Google ao browser — distinguir quota/
        // sobrecarga do fornecedor (externo, fora do nosso controlo) de um
        // erro genérico, para o utilizador perceber que não é um bug nosso.
        if (/per.day|per day|daily|requests per day/i.test(msg) && /quota|429|limit/i.test(msg)) {
          return locale === "en"
            ? "The AI provider's daily limit has been reached. Please try again tomorrow."
            : "O serviço de IA atingiu o limite diário do fornecedor. Tenta novamente amanhã.";
        }
        if (/RESOURCE_EXHAUSTED|429|quota|503|UNAVAILABLE|high demand|overloaded/i.test(msg)) {
          return locale === "en"
            ? "The AI service is temporarily busy. Please try again in a few minutes."
            : "O serviço de IA está temporariamente sobrecarregado. Tenta novamente daqui a alguns minutos.";
        }
        return locale === "en"
          ? "The response could not be completed. Please try again."
          : "Não foi possível concluir a resposta. Tenta novamente.";
      },
    }) });
  } catch (error) {
    console.error("Analyst chat error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
