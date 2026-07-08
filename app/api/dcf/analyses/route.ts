import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

// GET /api/dcf/analyses?ticker=AAPL  → análises DCF guardadas do utilizador para essa empresa
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const ticker = request.nextUrl.searchParams.get("ticker")?.toUpperCase()
    if (!ticker) {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 })
    }

    const company = await prisma.company.findUnique({ where: { ticker } })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const rows = await prisma.dcfAnalysis.findMany({
      where: { userId: user.id, companyId: company.id },
      orderBy: { createdAt: "desc" },
    })

    const analyses = rows.map((a) => ({
      id: a.id,
      label: a.label,
      fcf0: Number(a.fcf0),
      growthStage1: Number(a.growthStage1),
      growthStage2: Number(a.growthStage2),
      wacc: Number(a.wacc),
      terminalGrowth: Number(a.terminalGrowth),
      shares: Number(a.shares),
      netDebt: Number(a.netDebt),
      fairValue: Number(a.fairValue),
      priceAtSave: a.priceAtSave != null ? Number(a.priceAtSave) : null,
      marginOfSafety: a.marginOfSafety != null ? Number(a.marginOfSafety) : null,
      createdAt: a.createdAt.toISOString(),
    }))

    return NextResponse.json({ analyses })
  } catch (error) {
    console.error("Error listing DCF analyses:", error)
    return NextResponse.json({ error: "Failed to list analyses" }, { status: 500 })
  }
}

// POST /api/dcf/analyses  → guardar um cenário DCF
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { ticker, label, inputs, result } = body ?? {}

    if (!ticker || !inputs || !result) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null

    const fcf0 = num(inputs.fcf0)
    const shares = num(inputs.shares)
    const fairValue = num(result.fairValue)

    // Campos essenciais para um cenário ser válido.
    if (fcf0 === null || shares === null || shares <= 0 || fairValue === null) {
      return NextResponse.json({ error: "Invalid analysis values" }, { status: 400 })
    }

    const company = await prisma.company.findUnique({
      where: { ticker: String(ticker).toUpperCase() },
    })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const created = await prisma.dcfAnalysis.create({
      data: {
        userId: user.id,
        companyId: company.id,
        label: typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : null,
        fcf0,
        growthStage1: num(inputs.growthStage1) ?? 0,
        growthStage2: num(inputs.growthStage2) ?? 0,
        wacc: num(inputs.wacc) ?? 0,
        terminalGrowth: num(inputs.terminalGrowth) ?? 0,
        shares,
        netDebt: num(inputs.netDebt) ?? 0,
        fairValue,
        priceAtSave: num(result.currentPrice),
        marginOfSafety: num(result.marginOfSafety),
      },
    })

    return NextResponse.json({ id: created.id }, { status: 201 })
  } catch (error) {
    console.error("Error saving DCF analysis:", error)
    return NextResponse.json({ error: "Failed to save analysis" }, { status: 500 })
  }
}
