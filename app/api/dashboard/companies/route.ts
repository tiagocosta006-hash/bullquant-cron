import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCategoryCompaniesPage, isValidCategory, DEFAULT_CATEGORY } from "@/lib/finance/screener"

const PAGE_SIZE = 24

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const tabParam = searchParams.get("tab") ?? undefined
  const category = isValidCategory(tabParam) ? tabParam : DEFAULT_CATEGORY
  const sector = searchParams.get("sector") || undefined
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0)

  const page = await getCategoryCompaniesPage(category, PAGE_SIZE, offset, sector)

  return NextResponse.json(page)
}
