import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

// GET ?ticker= — o utilizador segue esta empresa?
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const ticker = request.nextUrl.searchParams.get("ticker")

    if (!ticker) {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 })
    }

    const item = await prisma.watchlistItem.findFirst({
      where: {
        userId: user.id,
        company: { ticker: ticker.toUpperCase() },
      },
    })

    return NextResponse.json({ inWatchlist: !!item })
  } catch (error) {
    console.error("Error checking watchlist state:", error)
    return NextResponse.json({ error: "Failed to check watchlist state" }, { status: 500 })
  }
}
