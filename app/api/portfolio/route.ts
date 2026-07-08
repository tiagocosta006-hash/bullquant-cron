import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find or create the user's portfolio with upsert to prevent race conditions
    const portfolio = await prisma.portfolio.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        name: "O Meu Portfólio",
      },
      include: {
        items: {
          include: {
            company: {
              select: {
                id: true,
                ticker: true,
                name: true,
                logoUrl: true,
                exchange: true,
                sector: true,
                industry: true,
                fundamentals: {
                  where: { periodType: 'ANNUAL' },
                  orderBy: { periodEnd: 'desc' },
                  take: 1,
                  select: {
                    roic: true,
                    grossMargin: true,
                  }
                }
              }
            }
          },
          orderBy: {
            addedAt: 'desc'
          }
        }
      }
    })

    return NextResponse.json(portfolio)
  } catch (error) {
    console.error("Error fetching portfolio:", error)
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 }
    )
  }
}
