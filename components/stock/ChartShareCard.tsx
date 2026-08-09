"use client"

import { forwardRef } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import { BRAND } from "@/lib/brand"
import { getOptimizedUrl } from "@/components/ui/CompanyLogo"
import { SHARE_PALETTE as C, shareColor } from "@/lib/shareTheme"
import { RoundedBar, makeAxisFormatter } from "./chartPrimitives"
import type { ChartConfig } from "./DecisionChart"

/** Formato 4:5 — o rácio que os feeds sociais mostram maior sem cortar. */
export const CARD_W = 1080
export const CARD_H = 1350

const PAD = 64
const INNER_W = CARD_W - PAD * 2 // 952
const CHART_PAD = 40
const CHART_W = INNER_W - CHART_PAD * 2 // 872
const CHART_H = 520

export type ShareCompany = {
  ticker: string
  name: string
  exchange: string
  logoUrl: string | null
  currency?: string | null
}

export type SharePrice = {
  currentPrice: number
  change: number
  changePercent: number
}

export type ChartShareCardProps = {
  company: ShareCompany
  price: SharePrice | null
  /** Título do gráfico (ex.: "Receita"). */
  title: string
  /** Linha de contexto por baixo do título (ex.: "Anual · 10 anos"). */
  subtitle?: string
  data: Record<string, unknown>[]
  type: "BAR" | "LINE" | "COMPOSED" | "STACKED_BAR" | "AREA"
  config: ChartConfig
  cagr?: number | null
  cagrLabel?: string
  currencySymbol?: string
  /** Rodapé legal — obrigatório numa imagem que circula fora da app. */
  disclaimer: string
  /** Data já formatada no locale do utilizador. */
  dateLabel: string
  hiddenKeys?: string[]
}

/**
 * ChartShareCard — o artefacto que sai da app quando alguém partilha um
 * gráfico. É renderizado no DOM (escondido/escalado) e rasterizado por
 * `html-to-image`, por isso **todas as cores são hex literais**: a cascata de
 * `var(--…)` não sobrevive ao clone (ver lib/shareTheme.ts).
 */
export const ChartShareCard = forwardRef<HTMLDivElement, ChartShareCardProps>(
  function ChartShareCard(
    {
      company,
      price,
      title,
      subtitle,
      data,
      type,
      config,
      cagr,
      cagrLabel = "CAGR",
      currencySymbol = "$",
      disclaimer,
      dateLabel,
      hiddenKeys = [],
    },
    ref,
  ) {
    const hidden = new Set(hiddenKeys)
    const visibleKeys = config.dataKeys.filter((k) => !hidden.has(k.key))
    const formatAxis = makeAxisFormatter(config, currencySymbol)
    const up = price ? price.change >= 0 : true
    const changeColor = up ? C.bull : C.bear

    // Nomes longos roubam a linha ao wordmark — escala como no cartão OG.
    const nameSize = company.name.length > 34 ? 34 : company.name.length > 24 ? 40 : 46

    const ChartRoot =
      type === "COMPOSED" || type === "STACKED_BAR"
        ? ComposedChart
        : type === "LINE"
          ? LineChart
          : type === "AREA"
            ? AreaChart
            : BarChart

    // Barras têm de assentar no zero (a altura é que codifica o valor); linhas
    // não — ancorar um P/E a zero desperdiçava metade do gráfico em vazio.
    const hasBars = type !== "LINE" && type !== "AREA" && visibleKeys.some((k) => k.type === "bar")
    // Pontos só quando são poucos: numa série diária (~1250 pontos) os dots
    // fundem-se e a linha vira um borrão.
    const showDots = data.length <= 24

    return (
      <div
        ref={ref}
        data-share-card
        // `[&_*]:outline-none` não é cosmético: o <svg.recharts-surface> computa
        // `outline: 5px auto` (anel de foco do UA). O html-to-image copia o
        // estilo COMPUTADO para inline e, no SVG isolado que rasteriza, um
        // outline-style `auto` com largura pinta sempre — saía um retângulo
        // claro à volta do gráfico em todas as imagens.
        className="[&_*]:outline-none"
        style={{
          width: CARD_W,
          height: CARD_H,
          backgroundColor: C.bg,
          color: C.text,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Régua dourada — a assinatura da marca antes de qualquer conteúdo */}
        <div style={{ height: 8, background: `linear-gradient(90deg, ${C.goldDeep} 0%, ${C.gold} 45%, ${C.goldDeep} 100%)` }} />

        {/* Marca d'água: o touro, grande e quase invisível, a sangrar no canto.
            Entra como <img> (não mask-image) porque URLs relativas de CSS não
            resolvem dentro do foreignObject serializado — um <img> same-origin
            é inlined pelo html-to-image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BRAND.logoSrc}
          alt=""
          aria-hidden
          style={{ position: "absolute", width: 900, right: -230, bottom: -160, opacity: 0.05, pointerEvents: "none" }}
        />
        {/* Brilho dourado no topo-direito, a dar profundidade ao fundo chapado */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -280,
            right: -220,
            width: 760,
            height: 760,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${C.gold}1f 0%, transparent 68%)`,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: `52px ${PAD}px 48px`,
          }}
        >
          {/* ── Cabeçalho: quem é a empresa · de quem é a análise ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, minWidth: 0 }}>
              {company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  // Pelo optimizador do Next: o URL cru da Finnhub é
                  // cross-origin e o html-to-image não o consegue inline
                  // (o logo saía em branco). `/_next/image` é same-origin.
                  src={getOptimizedUrl(company.logoUrl, 92)}
                  alt=""
                  width={92}
                  height={92}
                  style={{
                    width: 92,
                    height: 92,
                    borderRadius: 22,
                    objectFit: "contain",
                    backgroundColor: C.surface2,
                    border: `1px solid ${C.border}`,
                    padding: 10,
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 92,
                    height: 92,
                    borderRadius: 22,
                    backgroundColor: C.surface2,
                    border: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 42,
                    fontWeight: 800,
                    color: C.gold,
                    flexShrink: 0,
                  }}
                >
                  {company.ticker.charAt(0)}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: nameSize, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                  {company.name}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    color: C.text2,
                    marginTop: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    fontWeight: 600,
                  }}
                >
                  {company.ticker} · {company.exchange}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BRAND.logoSrc} alt="" width={44} height={47} style={{ width: 44, height: 47 }} />
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>
                <span style={{ color: C.gold }}>{BRAND.nameParts[0]}</span>
                {BRAND.nameParts[1]}
              </div>
            </div>
          </div>

          {/* ── Preço: a âncora que dá contexto temporal ao gráfico ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 56,
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 24,
              padding: "28px 36px",
            }}
          >
            <div>
              <div style={{ fontSize: 18, color: C.text3, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700 }}>
                {currencySymbol === "$" ? "Price" : "Preço"}
              </div>
              <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 6, lineHeight: 1 }}>
                {price ? `${currencySymbol}${price.currentPrice.toFixed(2)}` : "N/A"}
              </div>
            </div>
            {price && (
              <div>
                <div style={{ fontSize: 18, color: C.text3, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700 }}>
                  {company.currency || "USD"}
                </div>
                <div style={{ fontSize: 36, fontWeight: 700, color: changeColor, marginTop: 12, lineHeight: 1 }}>
                  {up ? "▲" : "▼"} {up ? "+" : ""}
                  {price.change.toFixed(2)} ({up ? "+" : ""}
                  {price.changePercent.toFixed(2)}%)
                </div>
              </div>
            )}
          </div>

          {/* ── O gráfico ── */}
          <div
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 28,
              padding: CHART_PAD,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{title}</div>
                {subtitle && <div style={{ fontSize: 20, color: C.text2, marginTop: 8 }}>{subtitle}</div>}
              </div>
              {cagr !== undefined && cagr !== null && Number.isFinite(cagr) && (
                <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 24 }}>
                  <div style={{ fontSize: 17, color: C.text3, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700 }}>
                    {cagrLabel}
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 800, color: cagr >= 0 ? C.bull : C.bear, marginTop: 6, lineHeight: 1 }}>
                    {cagr > 0 ? "+" : ""}
                    {(cagr * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            <ChartRoot
              width={CHART_W}
              height={CHART_H}
              data={data}
              margin={{ top: 16, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.border} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: C.text2, fontSize: 16 }}
                dy={12}
                height={44}
                interval={data.length > 15 ? "preserveEnd" : 0}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: C.text2, fontSize: 16 }}
                tickFormatter={formatAxis}
                width={88}
                domain={hasBars ? [(dataMin: number) => Math.min(0, dataMin), "auto"] : ["auto", "auto"]}
              />
              {config.referenceLine && (
                <ReferenceLine
                  y={config.referenceLine.y}
                  stroke={shareColor(config.referenceLine.color)}
                  strokeDasharray="3 3"
                  label={{
                    position: "insideBottomLeft",
                    value: config.referenceLine.label,
                    fill: shareColor(config.referenceLine.color),
                    fontSize: 16,
                    fontWeight: 600,
                    dy: -8,
                  }}
                />
              )}

              {visibleKeys.map((k) => {
                const color = shareColor(k.color)
                if (k.type === "line" || type === "LINE") {
                  return (
                    <Line
                      key={k.key}
                      isAnimationActive={false}
                      type="linear"
                      dataKey={k.key}
                      name={k.name || k.key}
                      stroke={color}
                      strokeWidth={3}
                      dot={showDots ? { r: 4, fill: color, strokeWidth: 0 } : false}
                    />
                  )
                }
                if (k.type === "area" || type === "AREA") {
                  return (
                    <Area
                      key={k.key}
                      isAnimationActive={false}
                      type="linear"
                      dataKey={k.key}
                      name={k.name || k.key}
                      fill={color}
                      stroke={color}
                      fillOpacity={0.2}
                      strokeWidth={3}
                    />
                  )
                }
                return (
                  <Bar
                    key={k.key}
                    isAnimationActive={false}
                    dataKey={k.key}
                    name={k.name || k.key}
                    fill={color}
                    stackId={k.stackId}
                    shape={<RoundedBar maxR={type === "STACKED_BAR" ? 0 : 4} dataKey={k.key} />}
                  >
                    {data.map((entry, index) => {
                      // Mesma semântica do gráfico interativo: em séries
                      // `inverseColors` (ex.: nº de ações) descer é BOM.
                      let cellColor = color
                      if (config.inverseColors) {
                        if (index > 0) {
                          const prev = Number(data[index - 1][k.key]) || 0
                          const curr = Number(entry[k.key]) || 0
                          if (curr < prev) cellColor = C.bull
                          else if (curr > prev) cellColor = C.bear
                        } else {
                          cellColor = shareColor("var(--chart-4)")
                        }
                      }
                      if (entry.isPreliminary) {
                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={cellColor}
                            fillOpacity={0.4}
                            stroke={cellColor}
                            strokeOpacity={0.9}
                            strokeDasharray="3 2"
                          />
                        )
                      }
                      return <Cell key={`cell-${index}`} fill={cellColor} />
                    })}
                  </Bar>
                )
              })}
            </ChartRoot>

            {visibleKeys.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 20 }}>
                {visibleKeys.map((k) => (
                  <div key={k.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* traço fino, não caixa — regra dataviz do projeto */}
                    <span style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: shareColor(k.color) }} />
                    <span style={{ fontSize: 20, color: C.text2, fontWeight: 500 }}>{k.name || k.key}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Rodapé: origem + data + aviso ── */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 32,
              borderTop: `1px solid ${C.border}`,
              paddingTop: 24,
            }}
          >
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.gold, letterSpacing: "-0.01em" }}>{BRAND.domain}</div>
              <div style={{ fontSize: 17, color: C.text3, marginTop: 6, maxWidth: 640, lineHeight: 1.4 }}>{disclaimer}</div>
            </div>
            <div
              style={{
                fontSize: 18,
                color: C.text3,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {dateLabel}
            </div>
          </div>
        </div>
      </div>
    )
  },
)
