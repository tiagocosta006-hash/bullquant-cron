"use client"

import { useMemo } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { useTranslations } from "next-intl"
import { formatLargeNumber } from "@/lib/finance/format"

/**
 * Receita por geografia do período mais recente, em gráfico circular.
 *
 * A geografia é uma partição da receita de UM momento — quanto vem de cada
 * região —, e um círculo lê-se melhor do que barras empilhadas para isso.
 * A evolução ao longo do tempo fica para o gráfico de segmentos de produto.
 */

// A mesma paleta categórica do gráfico de segmentos (CVD-safe). Mais regiões
// do que cores fundem-se em "Outros", como lá.
const CORES = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"]

type Props = {
  /** Região → receita, já em dólares. */
  geografia: Record<string, number>
  /** Ex.: "2025", "Q2 '26", "TTM Q2 '26". */
  periodo: string
  currencySymbol?: string
}

export function GeographyPie({ geografia, periodo, currencySymbol = "$" }: Props) {
  const t = useTranslations("financials")

  const fatias = useMemo(() => {
    // Valores negativos (ajustes de cobertura, eliminações) não cabem num
    // círculo; ficam de fora em vez de distorcer as percentagens.
    const positivas = Object.entries(geografia)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .sort(([, a], [, b]) => b - a)
    const maxFatias = CORES.length
    const visiveis = positivas.slice(0, positivas.length > maxFatias ? maxFatias - 1 : maxFatias)
    const resto = positivas.slice(visiveis.length).reduce((s, [, v]) => s + v, 0)
    const lista = visiveis.map(([nome, valor]) => ({ nome, valor }))
    if (resto > 0) lista.push({ nome: t("charts.otherRegions"), valor: resto })
    const total = lista.reduce((s, f) => s + f.valor, 0)
    return { lista, total }
  }, [geografia, t])

  if (fatias.lista.length === 0) return null

  return (
    <div className="glass rounded-xl p-4 h-[320px] flex flex-col">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="font-semibold text-[15px] tracking-tight truncate">{t("charts.revenueByGeography")}</h3>
        <span className="text-xs font-medium text-muted-foreground shrink-0">{periodo}</span>
      </div>
      <div className="flex-1 min-h-0 flex items-center gap-3">
        <div className="h-full w-[45%] min-w-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={fatias.lista}
                dataKey="valor"
                nameKey="nome"
                innerRadius="55%"
                outerRadius="90%"
                paddingAngle={1}
                stroke="none"
                isAnimationActive={false}
              >
                {fatias.lista.map((f, i) => (
                  <Cell key={f.nome} fill={CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, nome) => {
                  const n = Number(v)
                  return [`${formatLargeNumber(n, currencySymbol)} · ${((n / fatias.total) * 100).toFixed(1)}%`, String(nome)]
                }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 13,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 min-w-0 flex flex-col gap-1.5 overflow-y-auto no-scrollbar max-h-full">
          {fatias.lista.map((f, i) => (
            <li key={f.nome} className="flex items-center gap-2 text-[13px]">
              <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: CORES[i % CORES.length] }} />
              <span className="truncate text-muted-foreground" title={f.nome}>{f.nome}</span>
              <span className="nums font-semibold ml-auto pl-2 shrink-0">
                {((f.valor / fatias.total) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
