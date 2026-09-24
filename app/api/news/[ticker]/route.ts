import { NextRequest, NextResponse } from "next/server";
// Partilhado com o pipeline do Terminal de Notícias (lib/news/*).
import { isRealImage } from "@/lib/news/normalize";
import { normalizarTicker } from "@/lib/ticker";
import { noticias } from "@/lib/fmp/mercado";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const bruto = await params;
  // Validado antes de chamar a FMP: sem isto, cada ticker inventado era uma
  // chave de cache nova e uma chamada nova. Ver lib/ticker.ts.
  const ticker = normalizarTicker(bruto.ticker);
  if (!ticker) {
    return NextResponse.json({ error: "Ticker inválido" }, { status: 400 });
  }

  try {
    // 60 dias para um feed mais cheio; cache de 15 min (lib/fmp/mercado.ts).
    const raw = await noticias(ticker, 60);

    // Deduplicate by headline prefix
    const seen = new Set<string>();
    const deduped = raw.filter((a) => {
      if (!a.headline || !a.url) return false;
      const key = a.headline.slice(0, 70).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Normalise: replace generic images with null
    const normalised = deduped.map((a) => ({
      id: a.id,
      datetime: a.datetime,
      headline: a.headline,
      summary: a.summary || null,
      source: a.source,
      url: a.url,
      // Only expose image if it's a real article-specific image
      image: isRealImage(a.image) ? a.image : null,
    }));

    // Sort: articles with a real image first, then by recency
    normalised.sort((a, b) => {
      if (a.image && !b.image) return -1;
      if (!a.image && b.image) return 1;
      return b.datetime - a.datetime;
    });

    return NextResponse.json({ articles: normalised.slice(0, 50) });
  } catch (err) {
    console.error("[news] fetch error:", err);
    return NextResponse.json({ articles: [] }, { status: 200 });
  }
}
