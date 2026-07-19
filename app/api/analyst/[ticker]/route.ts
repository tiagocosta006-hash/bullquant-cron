import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { assertCreditsAvailable, chargeCredits } from "@/lib/ai/credits";
import { generateAndCacheReport } from "@/lib/ai/generateAnalystReport";

export const maxDuration = 120; // geração pesada (contexto do 10-K)

// GET — serve apenas da cache (barato, não gera nem consome quota).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  try {
    const { ticker } = await params;
    if (!ticker) return NextResponse.json({ error: "Ticker is required" }, { status: 400 });

    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() },
      select: { id: true },
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const cached = await prisma.analystReport.findUnique({
      where: { companyId: company.id },
    });

    if (!cached || cached.expiresAt <= new Date()) {
      return NextResponse.json({ report: null });
    }

    return NextResponse.json({
      report: cached.reportData,
      secUrl: cached.secUrl,
      filingLabel: cached.filingLabel,
      generatedAt: cached.generatedAt,
      cached: true,
    });
  } catch (error) {
    console.error("Analyst report GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST — gera o relatório (auth + créditos + Gemini) e cacheia.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  try {
    const { ticker } = await params;
    if (!ticker) return NextResponse.json({ error: "Ticker is required" }, { status: 400 });

    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() },
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // Auth — consome créditos.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Cache fresca? devolve sem gastar créditos (evita corrida de duplo clique).
    const existing = await prisma.analystReport.findUnique({
      where: { companyId: company.id },
    });
    if (existing && existing.expiresAt > new Date()) {
      return NextResponse.json({
        report: existing.reportData,
        secUrl: existing.secUrl,
        filingLabel: existing.filingLabel,
        generatedAt: existing.generatedAt,
        cached: true,
      });
    }

    // Créditos
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    });
    const rateLimitError = await assertCreditsAvailable(user.id, dbUser?.plan ?? "FREE", "analyst_report");
    if (rateLimitError) {
      return NextResponse.json(rateLimitError, { status: 429 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const { report, secUrl, filingLabel, generatedAt } = await generateAndCacheReport(company);

    await chargeCredits(user.id, company.ticker, "analyst_report");

    return NextResponse.json({ report, secUrl, filingLabel, generatedAt, cached: false });
  } catch (error) {
    console.error("Analyst report POST error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
