import { ImageResponse } from "next/og"
import { prisma } from "@/lib/prisma"
import { formatPercent, formatPrice } from "@/lib/finance/format"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // We fetch using a raw query or Prisma edge if it works. 
    // Since runtime is edge, we must be careful with Prisma. 
    // Wait, prisma on edge can be tricky unless we use Accelerate.
    // Let's remove runtime="edge" just in case Prisma doesn't support it directly in this project setup.
    const analysis = await prisma.dcfAnalysis.findUnique({
      where: { id },
      include: { company: true },
    })

    if (!analysis || !analysis.isPublic) {
      return new Response("Not found", { status: 404 })
    }

    const { company, fairValue, priceAtSave, marginOfSafety } = analysis
    const currency = company.currency === "EUR" ? "€" : "$"
    
    const marginOfSafetyNum = marginOfSafety && typeof marginOfSafety === "object" && "toNumber" in marginOfSafety
      ? (marginOfSafety as { toNumber(): number }).toNumber()
      : Number(marginOfSafety ?? 0)
    const undervalued = marginOfSafetyNum > 0
    const marginColor = undervalued ? "#10b981" : "#ef4444" // bull / bear hex colors

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#09090b", // background color (near black)
            fontFamily: "sans-serif",
            padding: "40px 80px",
            border: "8px solid #a18030", // primary/gold border
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: "40px" }}>
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: "#facc15", // Primary Gold
                marginRight: 20,
              }}
            >
              BullMetrics
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, color: "#a1a1aa", marginBottom: 20 }}>
              Análise DCF
            </div>
            <div style={{ fontSize: 80, fontWeight: "bold", color: "#ffffff", marginBottom: 60 }}>
              {company.name} ({company.ticker})
            </div>

            {/* Metrics */}
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: "60px" }}>
              
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 32, color: "#a1a1aa", textTransform: "uppercase", marginBottom: 10 }}>Fair Value</div>
                <div style={{ fontSize: 64, fontWeight: "bold", color: "#facc15" }}>
                  {formatPrice(
                    fairValue && typeof fairValue === "object" && "toNumber" in fairValue ? (fairValue as { toNumber(): number }).toNumber() : Number(fairValue),
                    currency
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 32, color: "#a1a1aa", textTransform: "uppercase", marginBottom: 10 }}>Current Price</div>
                <div style={{ fontSize: 64, fontWeight: "bold", color: "#ffffff" }}>
                  {priceAtSave ? formatPrice(
                    typeof priceAtSave === "object" && "toNumber" in priceAtSave ? (priceAtSave as { toNumber(): number }).toNumber() : Number(priceAtSave),
                    currency
                  ) : "N/A"}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 32, color: "#a1a1aa", textTransform: "uppercase", marginBottom: 10 }}>Margin of Safety</div>
                <div style={{ fontSize: 64, fontWeight: "bold", color: marginColor }}>
                  {marginOfSafety ? (undervalued ? "+" : "") + formatPercent(marginOfSafetyNum) : "N/A"}
                </div>
              </div>

            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )
  } catch (e) {
    console.error(e)
    return new Response("Internal Server Error", { status: 500 })
  }
}
