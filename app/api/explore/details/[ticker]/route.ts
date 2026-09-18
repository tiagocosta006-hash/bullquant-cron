import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exigirPro } from "@/lib/api/acessoPro"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const acesso = await exigirPro()
    if (!acesso.ok) return acesso.resposta

    const { ticker } = await params
    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() },
      select: { bullCase: true, bearCase: true, swot: true, extraInfo: true }
    })
    
    if (!company) {
      return NextResponse.json({}, { status: 404 })
    }

    return NextResponse.json(company, {
      headers: { "Cache-Control": "private, max-age=3600" },
    })
  } catch (error) {
    console.error("Error fetching company details:", error)
    return NextResponse.json({}, { status: 500 })
  }
}
