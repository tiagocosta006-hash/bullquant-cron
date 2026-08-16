import { NextRequest } from "next/server"
import { ImageResponse } from "next/og"
import { prisma } from "@/lib/prisma"
import fs from "fs"
import path from "path"

// Load brand logo once
const brandLogoSvg = fs.readFileSync(path.join(process.cwd(), "public", "brand", "logo.svg"), "utf8")
const brandLogoSrc = `data:image/svg+xml;base64,${Buffer.from(brandLogoSvg).toString("base64")}`

// Load fonts for Satori
const sfHeavy = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "sf-ui-text", "SFUIText-Heavy.woff"))
const sfRegular = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "sf-ui-text", "SFUIText-Regular.woff"))

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const article = await prisma.newsArticle.findUnique({
      where: { slug },
      select: {
        titulo: true,
        categoria: true,
        tickers: true,
        publishedAt: true,
      }
    })

    if (!article) {
      return new Response("Not found", { status: 404 })
    }

    const dateString = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(article.publishedAt)

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

    // Adapt font size dynamically based on length
    let fontSize = 90;
    if (article.titulo.length > 100) fontSize = 65;
    else if (article.titulo.length > 70) fontSize = 75;

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
            {article.categoria && (
              <div style={{ 
                display: "flex", 
                backgroundColor: "#e4aa33", 
                color: "#1a1a17", 
                padding: "10px 24px", 
                borderRadius: "32px",
                fontSize: 32, 
                fontWeight: 800,
                letterSpacing: "0.02em"
              }}>
                {article.categoria}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              justifyContent: "center",
            }}
          >
            <div style={{
                fontSize: fontSize,
                fontWeight: 800,
                color: "#1a1a17",
                display: "flex",
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                flexWrap: "wrap",
            }}>
                {article.titulo}
            </div>

            {article.tickers && article.tickers.length > 0 && (
              <div style={{ 
                display: "flex", 
                gap: "16px",
                marginTop: 40 
              }}>
                {article.tickers.slice(0, 3).map((ticker) => (
                  <div key={ticker} style={{
                    display: "flex",
                    backgroundColor: "#1a1a17",
                    color: "#fafaf7",
                    padding: "8px 20px",
                    borderRadius: "16px",
                    fontSize: 28,
                    fontWeight: 800
                  }}>
                    {ticker}
                  </div>
                ))}
              </div>
            )}
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
