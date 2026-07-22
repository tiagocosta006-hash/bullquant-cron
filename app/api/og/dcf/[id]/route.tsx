import { NextRequest } from "next/server"
import { ImageResponse } from "next/og"
import { prisma } from "@/lib/prisma"
import { formatPercent, formatPrice } from "@/lib/finance/format"
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const dcfAnalysis = await prisma.dcfAnalysis.findUnique({
      where: { id },
      include: { company: true },
    })

    if (!dcfAnalysis || !dcfAnalysis.company) {
      return new Response("Not found", { status: 404 })
    }

    const { company, label, notes, fairValue, priceAtSave, marginOfSafety, wacc, terminalGrowth, growthStage1 } = dcfAnalysis

    const currency = company.currency === "EUR" ? "€" : "$"
    const currentPrice = priceAtSave ? Number(priceAtSave) : null
    const calculatedFairValue = Number(fairValue)
    
    const isUndervalued = marginOfSafety && Number(marginOfSafety) > 0
    const marginColor = isUndervalued ? "#16a34a" : "#dc2626"

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

    const titleStr = label ? label : "Análise DCF"
    const displayNotes = notes ? (notes.length > 140 ? notes.substring(0, 140) + "..." : notes) : ""

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: "#fafaf7",
            fontFamily: '"SF UI Text"',
            padding: "40px 50px",
            border: "12px solid #e4aa33",
          }}
        >
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
              <img src={brandLogoSrc} width={42} height={42} style={{ marginRight: 16 }} />
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.05em", color: "#1a1a17", display: "flex" }}>
                <span style={{ color: "#e4aa33" }}>Bull</span>Value
              </div>
            </div>

            {/* Company Badge */}
            <div style={{ display: "flex", alignItems: "center", backgroundColor: "#ffffff", padding: "8px 16px", borderRadius: 100, border: "2px solid rgba(0,0,0,0.05)", boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
              {company.logoUrl && (
                <img src={company.logoUrl} width={28} height={28} style={{ borderRadius: "25%", marginRight: 12, objectFit: "contain" }} />
              )}
              <div style={{ display: "flex", fontSize: 20, fontWeight: 800, color: "#1a1a17", letterSpacing: "-0.02em" }}>
                {company.name} <span style={{ color: "#8b877d", marginLeft: 8 }}>{company.ticker}</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 30, padding: "0 30px" }}>
            <div style={{
              fontSize: titleStr.length > 30 ? 48 : 64,
              fontWeight: 800,
              color: "#1a1a17",
              display: "flex",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              maxWidth: "900px",
              flexWrap: "wrap",
            }}>
              {titleStr}
            </div>
            {displayNotes && (
              <div style={{ 
                fontSize: 24, 
                fontWeight: 400, 
                color: "#57544d", 
                display: "flex", 
                marginTop: 24,
                maxWidth: "850px",
                lineHeight: 1.5
              }}>
                "{displayNotes}"
              </div>
            )}

            {/* Prices Block */}
            <div style={{ display: "flex", alignItems: "center", marginTop: 70, gap: 20 }}>
              {currentPrice && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 20, fontWeight: 400, color: "#8b877d", textTransform: "uppercase", marginBottom: 12, display: "flex", letterSpacing: "0.05em" }}>Preço Atual</div>
                  <div style={{ fontSize: 64, fontWeight: 800, color: "#1a1a17", display: "flex", letterSpacing: "-0.02em" }}>
                    {formatPrice(currentPrice, currency)}
                  </div>
                </div>
              )}

              {currentPrice && marginOfSafety && (
                <div style={{ display: "flex", alignItems: "center", margin: "0 20px" }}>
                  <svg width="48" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b877d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                  <div style={{ fontSize: 36, fontWeight: 800, color: marginColor, display: "flex", marginLeft: 16 }}>
                    {isUndervalued ? "+" : ""}{formatPercent(Number(marginOfSafety))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#e4aa33", textTransform: "uppercase", marginBottom: 12, display: "flex", letterSpacing: "0.05em" }}>Fair Value (DCF)</div>
                <div style={{ fontSize: 64, fontWeight: 800, color: "#1a1a17", display: "flex", letterSpacing: "-0.02em" }}>
                  {formatPrice(calculatedFairValue, currency)}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Inputs Grid */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" }}>
            <div style={{ display: "flex", gap: "60px", borderTop: "2px solid rgba(0,0,0,0.1)", paddingTop: 30 }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 16, fontWeight: 400, color: "#8b877d", textTransform: "uppercase", marginBottom: 8, display: "flex", letterSpacing: "0.02em" }}>WACC</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#1a1a17", display: "flex" }}>{formatPercent(Number(wacc))}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 16, fontWeight: 400, color: "#8b877d", textTransform: "uppercase", marginBottom: 8, display: "flex", letterSpacing: "0.02em" }}>Cresc. Curto Prazo</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#1a1a17", display: "flex" }}>{formatPercent(Number(growthStage1))}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 16, fontWeight: 400, color: "#8b877d", textTransform: "uppercase", marginBottom: 8, display: "flex", letterSpacing: "0.02em" }}>Cresc. Terminal</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#1a1a17", display: "flex" }}>{formatPercent(Number(terminalGrowth))}</div>
              </div>
            </div>
            
            {/* Date Stamp */}
            <div style={{ fontSize: 18, fontWeight: 400, color: "#8b877d", display: "flex", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {dateString}
            </div>
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
