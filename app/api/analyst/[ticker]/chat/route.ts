import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { streamText, stepCountIs } from "ai";
import { geminiModel } from "@/lib/ai/gemini";
import { buildCompanyContext } from "@/lib/ai/context";
import { assertCreditsAvailable, chargeCredits } from "@/lib/ai/credits";
import { createComparePeerTool, citeTool, suggestActionTool } from "@/lib/ai/tools";

export const maxDuration = 60;

// Trim do texto do 10-K injetado no chat — grounding profundo sem rebentar
// custo/latência por mensagem. O relatório já destila o essencial; isto dá
// margem para perguntas que precisem de ir ao filing.
const MAX_FILING_CHARS = 250_000;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  try {
    const { ticker } = await params;
    if (!ticker) return NextResponse.json({ error: "Ticker is required" }, { status: 400 });

    const body = await request.json().catch(() => null);
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: "No messages" }, { status: 400 });
    }

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

    const system = `És um analista de equity research sénior que cobre EXCLUSIVAMENTE a ${company.name} (${company.ticker}). Respondes em português europeu (pt-PT), de forma direta e útil para um investidor de retail.

CONTEXTO VERIFICADO (a tua única fonte de verdade):
${grounding}

REGRAS:
1. Números financeiros: usa APENAS os do contexto verificado. Nunca inventes nem estimes.
2. Qualitativo: baseia-te no relatório e no excerto do 10-K acima. Quando citares um facto do filing, indica que vem do relatório anual.
3. Se a resposta não estiver no contexto, diz claramente "Isso não está no filing/dados que tenho" — NUNCA inventes.
4. Sê conciso. Usa números concretos do contexto quando ajudarem.
5. Se o utilizador pedir para comparar com um concorrente/peer, usa a tool "comparePeer" — nunca inventes números ou qualitativo de outra empresa sem a chamar primeiro.
6. Para cada facto verificável importante que referires (número, citação do 10-K), chama a tool "cite" com o excerto exato.
7. Quando fizer sentido, sugere UMA próxima ação útil na plataforma via a tool "suggestAction" (ex: "Ver no DCF" → /dcf?ticker=${company.ticker}, "Comparar peers" → /compare?ticker=${company.ticker}). Não abuses — só quando genuinamente ajudar.`;

    const result = streamText({
      model: geminiModel(),
      system,
      messages,
      tools: {
        comparePeer: createComparePeerTool(company, user.id, dbUser.plan),
        cite: citeTool,
        suggestAction: suggestActionTool,
      },
      stopWhen: stepCountIs(6), // tool-call(s) de anotação + peer + resposta final
    });

    // Cobrar créditos — o custo real acontece ao chamar o Gemini (já commitado
    // acima), não faz sentido só cobrar se o stream terminar com sucesso.
    chargeCredits(user.id, company.ticker, "analyst_chat").catch(() => {});

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("Analyst chat stream error:", error);
        const msg = error instanceof Error ? error.message : String(error);
        // Nunca expor o erro bruto do Google ao browser — distinguir quota/
        // sobrecarga do fornecedor (externo, fora do nosso controlo) de um
        // erro genérico, para o utilizador perceber que não é um bug nosso.
        if (/RESOURCE_EXHAUSTED|429|quota/i.test(msg)) {
          return "O fornecedor de IA está temporariamente sobrecarregado (limite de pedidos atingido). Tenta novamente daqui a alguns minutos.";
        }
        return "Ocorreu um erro ao gerar a resposta. Tenta novamente.";
      },
    });
  } catch (error) {
    console.error("Analyst chat error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
