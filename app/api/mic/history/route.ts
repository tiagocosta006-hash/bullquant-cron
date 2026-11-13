import { getUser } from "@/lib/supabase/server"
import { readMicHistory } from "@/lib/mic/portfolio"

export async function GET() {
  if (!await getUser()) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    return Response.json(await readMicHistory(), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[MIC] History unavailable", error instanceof Error ? error.name : "Unknown error")
    return Response.json({ error: "Unavailable" }, { status: 503 })
  }
}
