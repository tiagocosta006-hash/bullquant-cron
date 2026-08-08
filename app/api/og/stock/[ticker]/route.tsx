import { NextRequest } from "next/server"
import { ImageResponse } from "next/og"
import { prisma } from "@/lib/prisma"
import { formatPrice, formatLargeNumber } from "@/lib/finance/format"
import fs from "fs"
import path from "path"

// Load brand logo once
const brandLogoSvg = fs.readFileSync(path.join(process.cwd(), "public", "brand", "logo.svg"), "utf8")
const brandLogoSrc = `data:image/svg+xml;base64,${Buffer.from(brandLogoSvg).toString("base64")}`

// Load fonts for Satori
const sfHeavy = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "sf-ui-text", "SFUIText-Heavy.woff"))
const sfRegular = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "sf-ui-text", "SFUIText-Regular.woff"))

function num(val: unknown): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === "number") return val
  if (typeof val === "bigint") return Number(val)
  if (typeof val === "object" && "toNumber" in val) {
    return (val as { toNumber(): number }).toNumber()
  }
  return null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params
    const upper = ticker.toUpperCase()

    const company = await prisma.company.findUnique({
      where: { ticker: upper },
    })

    if (!company) {
      return new Response("Not found", { status: 404 })
    }

    // Fetch real-time price using the internal API endpoint to match the page header
    // We pass a dummy URL to the request to simulate a local API call
    const priceUrl = new URL(`/api/price/${upper}`, request.url)
    const priceReq = new Request(priceUrl)
    
    // We have to dynamically import the GET handler to call it directly 
    // since we're in the same Next.js server environment
    const { GET: getPrice } = await import('@/app/api/price/[ticker]/route')
    
    const [priceResponse, ttmFundamentals, latestAnnual] = await Promise.all([
      getPrice(priceReq, { params: Promise.resolve({ ticker: upper }) }),
      prisma.fundamental.findMany({
        where: { companyId: company.id, periodType: "QUARTERLY" },
        orderBy: { periodEnd: "desc" },
        take: 4,
      }),
      prisma.fundamental.findFirst({
        where: { companyId: company.id, periodType: "ANNUAL" },
        orderBy: { periodEnd: "desc" },
      }),
    ])

    let price = null
    if (priceResponse.ok) {
      const priceData = await priceResponse.json()
      price = priceData.currentPrice
    } else {
      // Fallback to database if API fails
      const latestPrice = await prisma.price.findFirst({
        where: { ticker: upper },
        orderBy: { date: "desc" },
      })
      price = latestPrice ? Number(latestPrice.close) : null
    }

    const currency = company.currency === "EUR" ? "€" : "$"

    // Helper for TTM sum
    const sumTtm = (key: keyof typeof ttmFundamentals[0]) => {
      if (ttmFundamentals.length < 4) return null
      let sum = 0
      for (const q of ttmFundamentals) {
        const val = num(q[key])
        if (val === null) return null
        sum += val
      }
      return sum
    }

    const shares = num(ttmFundamentals[0]?.sharesOutstanding) ?? num(latestAnnual?.sharesOutstanding) ?? 0
    const marketCap = price && shares ? price * shares : null
    
    const netIncome = sumTtm("netIncome") ?? num(latestAnnual?.netIncome)
    const peRatio = marketCap && netIncome && netIncome > 0 ? marketCap / netIncome : null

    const dateString = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())

    const backgroundLines = []
    const W = 1200
    const H = 630
    const lines = 12
    for (let l = 0; l < lines; l++) {
      const base = (H / (lines - 1)) * l
      const amp = 15 + (l % 6) * 5
      let d = `M 0 ${base}`
      for (let x = 0; x <= W; x += 20) {
        const y = base + Math.sin(x * 0.005 + l * 0.5) * amp
        d += ` L ${x} ${y}`
      }
      const strokeOpacity = (0.045 + (l % 6) * 0.004).toFixed(3)
      backgroundLines.push(
        <path key={l} d={d} stroke="#1a1a17" strokeWidth="1.5" strokeOpacity={strokeOpacity} fill="none" />
      )
    }

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: "#fafaf7", // paper-bg (light mode)
            fontFamily: '"SF UI Text"', // using the loaded font
            padding: "60px",
            border: "12px solid #e4aa33", // signature gold
          }}
        >
          {/* Background SVG with wavy lines */}
          <svg
            width="1200"
            height="630"
            viewBox="0 0 1200 630"
            style={{ position: "absolute", top: 0, left: 0, opacity: 0.8 }}
          >
            {backgroundLines}
          </svg>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <img src={brandLogoSrc} width={64} height={64} style={{ marginRight: 20 }} />
              <div
                style={{
                  fontSize: 60,
                  fontWeight: 800, // Matching Heavy font
                  letterSpacing: "-0.05em", // tracking-tight
                  color: "#1a1a17", // paper-text
                  display: "flex",
                }}
              >
                <span style={{ color: "#e4aa33" }}>Bull</span>Value
              </div>
            </div>
            {price && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ fontSize: 28, fontWeight: 400, color: "#57544d", textTransform: "uppercase", display: "flex" }}>Preço Atual</div>
                <div style={{ fontSize: 72, fontWeight: 800, color: "#1a1a17", display: "flex", letterSpacing: "-0.02em" }}>
                  {formatPrice(price, currency)}
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
              {company.logoUrl && (
                <img src={company.logoUrl} width={140} height={140} style={{ borderRadius: "25%", marginRight: 40, objectFit: "contain", backgroundColor: "#ffffff" }} />
              )}
              <div style={{ display: "flex", flexDirection: "column", maxWidth: "800px" }}>
                <div style={{
                  fontSize: company.name.length > 25 ? 55 : company.name.length > 15 ? 75 : company.name.length > 10 ? 90 : 110,
                  fontWeight: 800,
                  color: "#1a1a17",
                  display: "flex",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  flexWrap: "wrap",
                }}>
                  {company.name}
                </div>
                <div style={{ 
                  fontSize: 36, 
                  fontWeight: 400, 
                  color: "#57544d", 
                  display: "flex", 
                  textTransform: "uppercase",
                  marginTop: 12,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}>
                  {company.ticker} · {company.exchange}
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "80px", marginTop: 40 }}>
              {marketCap && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 32, fontWeight: 400, color: "#57544d", textTransform: "uppercase", marginBottom: 10, display: "flex" }}>Market Cap</div>
                  <div style={{ fontSize: 64, fontWeight: 800, color: "#1a1a17", display: "flex", letterSpacing: "-0.02em" }}>
                    {formatLargeNumber(marketCap, currency)}
                  </div>
                </div>
              )}
              {peRatio && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 32, fontWeight: 400, color: "#57544d", textTransform: "uppercase", marginBottom: 10, display: "flex" }}>P/E Ratio</div>
                  <div style={{ fontSize: 64, fontWeight: 800, color: "#1a1a17", display: "flex", letterSpacing: "-0.02em" }}>
                    {peRatio.toFixed(1)}x
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Date Stamp */}
          <div style={{ position: "absolute", bottom: 60, right: 60, fontSize: 24, fontWeight: 400, color: "#8b877d", display: "flex", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {dateString}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: '"SF UI Text"',
            data: sfRegular,
            weight: 400,
            style: "normal",
          },
          {
            name: '"SF UI Text"',
            data: sfHeavy,
            weight: 800,
            style: "normal",
          },
        ],
      }
    )
  } catch (e) {
    console.error(e)
    return new Response("Failed to generate image", { status: 500 })
  }
}
