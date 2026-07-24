import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const commentaries = await prisma.macroCommentary.findMany({
      orderBy: { updatedAt: "desc" },
    })

    const dictionary = commentaries.reduce((acc, curr) => {
      acc[curr.type] = { content: curr.content, updatedAt: curr.updatedAt }
      return acc
    }, {} as Record<string, { content: string; updatedAt: Date }>)

    return NextResponse.json(dictionary)
  } catch (error) {
    console.error("GET /api/macro/commentary error:", error)
    return NextResponse.json({ error: "Failed to fetch commentary" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { type, content } = body

    if (!type) {
      return NextResponse.json({ error: "Type is required" }, { status: 400 })
    }

    const commentary = await prisma.macroCommentary.upsert({
      where: { type },
      update: { content, updatedBy: user.id },
      create: { type, content, updatedBy: user.id },
    })

    return NextResponse.json(commentary)
  } catch (error) {
    console.error("PATCH /api/macro/commentary error:", error)
    return NextResponse.json({ error: "Failed to update commentary" }, { status: 500 })
  }
}
