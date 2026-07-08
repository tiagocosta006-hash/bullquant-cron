import { NextRequest, NextResponse } from "next/server";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY!;

// Generic/placeholder images that should be treated as "no image"
const GENERIC_IMAGE_PATTERNS = [
  "s.yimg.com/rz/stage",           // Yahoo Finance generic logo
  "yahoo_finance_en-US_h_p",       // Yahoo Finance generic logo variant
  "static.finnhub",                 // Finnhub placeholder
  "finnhub.io/static",
];

function isRealImage(url: string | undefined): boolean {
  if (!url || url.trim() === "") return false;
  return !GENERIC_IMAGE_PATTERNS.some((pattern) => url.includes(pattern));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  // Fetch last 60 days for a fuller feed
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 60);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${fmt(from)}&to=${fmt(to)}&token=${FINNHUB_KEY}`;

  try {
    const res = await fetch(url, { next: { revalidate: 900 } }); // cache 15 min
    if (!res.ok) throw new Error(`Finnhub error: ${res.status}`);

    const raw: Array<{
      id: number;
      datetime: number;
      headline: string;
      summary: string;
      source: string;
      url: string;
      image: string;
    }> = await res.json();

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
