import { NextResponse } from "next/server"
import { getUser } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Verify ownership
    const analysis = await prisma.dcfAnalysis.findUnique({
      where: { id },
    })

    if (!analysis) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    if (analysis.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Toggle isPublic
    const updated = await prisma.dcfAnalysis.update({
      where: { id },
      data: { isPublic: !analysis.isPublic },
    })

    return NextResponse.json({ isPublic: updated.isPublic })
  } catch (error) {
    console.error("Error sharing DCF:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
