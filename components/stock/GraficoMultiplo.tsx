"use client"

import { useMemo } from "react"
import { useLocale } from "next-intl"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"

/**
 * Um múltiplo de valuation ao longo do tempo (P/E, P/S, FCF yield,
 * EV/EBITDA), com linhas de média e de mediana. Partilhado pela página da
 * empresa (ValuationMultiples) e pelo DCF, onde aparece junto ao exit
 * multiple com a linha do múltiplo escolhido.
 *
 * A mediana ao lado da média importa: um ano de euforia (múltiplos de 40x+ em
 * 2020-21) puxa a média para cima; a mediana diz o que foi "normal".
 */

export type PontoMultiplo = { date: string; v: number | null | undefined; price?: number }

export function estatisticas(pontos: PontoMultiplo[]) {
  const vals = pontos.map((p) => p.v).filter((x): x is number => typeof x === "number" && Number.isFinite(x))
  if (vals.length === 0) return { media: undefined, mediana: undefined }
  const ord = [...vals].sort((a, b) => a - b)
  const m = Math.floor(ord.length / 2)
  return {
    media: vals.reduce((a, b) => a + b, 0) / vals.length,
    mediana: ord.length % 2 ? ord[m] : (ord[m - 1] + ord[m]) / 2,
  }
}

export function GraficoMultiplo({
  pontos, formato, cor, nome, altura = 350, rotulos, linhaExtra,
}: {
  pontos: PontoMultiplo[]
  formato: "x" | "pct"
  cor: string
  nome: string
  altura?: number
  rotulos: { media: string; mediana: string; preco: string }
  linhaExtra?: { y: number; rotulo: string; cor: string }
}) {
  const locale = useLocale()
  const { media, mediana } = useMemo(() => estatisticas(pontos), [pontos])
  const f = (v: number) =>
    formato === "pct"
      ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v * 100)}%`
      : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v)}x`
  const data = pontos.filter((p) => typeof p.v === "number")

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={altura} className="outline-none focus:outline-none">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(val: string) => { const d = new Date(val); return `${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}` }}
            minTickGap={40}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => (formato === "pct" ? `${(v * 100).toFixed(0)}%` : `${v.toFixed(0)}x`)}
            domain={["auto", "auto"]}
            width={48}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as PontoMultiplo
              return (
                <div className="rounded-lg border border-border/50 bg-popover/95 p-3 text-sm shadow-xl backdrop-blur-sm">
                  <p className="mb-2 border-b border-border/50 pb-2 font-semibold">{String(label)}</p>
                  {d.price !== undefined && (
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">{rotulos.preco}</span><span className="font-medium">${d.price.toFixed(2)}</span></div>
                  )}
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">{nome}</span><span className="font-medium" style={{ color: cor }}>{typeof d.v === "number" ? f(d.v) : "N/A"}</span></div>
                </div>
              )
            }}
          />
          {/* Sem rótulos nas linhas: com a média e a mediana próximas, os
              textos ficavam entre as duas e liam-se trocados. A legenda por
              baixo diz qual é qual. */}
          {media !== undefined && <ReferenceLine y={media} stroke="var(--muted-foreground)" strokeDasharray="6 4" />}
          {mediana !== undefined && <ReferenceLine y={mediana} stroke="var(--foreground)" strokeOpacity={0.7} strokeDasharray="2 3" />}
          {linhaExtra && <ReferenceLine y={linhaExtra.y} stroke={linhaExtra.cor} strokeWidth={1.5} />}
          <Line type="linear" dataKey="v" name={nome} stroke={cor} strokeWidth={2} dot={false}
            activeDot={{ r: 6, fill: cor, stroke: "var(--background)", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {media !== undefined && (
          <span className="flex items-center gap-1.5"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="6 4" /></svg>{rotulos.media}: <b className="text-foreground">{f(media)}</b></span>
        )}
        {mediana !== undefined && (
          <span className="flex items-center gap-1.5"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="var(--foreground)" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="2 3" /></svg>{rotulos.mediana}: <b className="text-foreground">{f(mediana)}</b></span>
        )}
        {linhaExtra && (
          <span className="flex items-center gap-1.5"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={linhaExtra.cor} strokeWidth="2" /></svg><b style={{ color: linhaExtra.cor }}>{linhaExtra.rotulo}</b></span>
        )}
      </div>
    </div>
  )
}
