"use client"

import { useTranslations } from "next-intl"
import type { Analistas } from "@/lib/fmp/estimativas"

/**
 * Consenso dos analistas: preço-alvo numa régua com o preço atual marcado,
 * distribuição Comprar/Manter/Vender de hoje e a sua evolução em 12 meses.
 *
 * Os dados vêm já prontos do servidor (lib/fmp/estimativas.ts). Aqui só se
 * desenha — e nada disto é recomendação nossa, daí o aviso no fim.
 */

const COR = { buy: "var(--bull, #1baf7a)", hold: "#eda100", sell: "var(--bear, #e34948)" }

type Props = {
  alvo: Analistas["alvo"]
  recomendacoes: Analistas["recomendacoes"]
  preco: number | null
  currencySymbol?: string
}

export function AnalystConsensus({ alvo, recomendacoes, preco, currencySymbol = "$" }: Props) {
  const t = useTranslations("stock.analysts")
  if (!alvo && !recomendacoes) return null

  const fmt = (v: number) => `${currencySymbol}${v.toFixed(2)}`

  // Régua do preço-alvo: do menor ao maior entre alvos e preço atual, com
  // folga, para o preço não ficar colado à borda quando está fora do intervalo.
  let regua: { min: number; max: number; pos: (v: number) => number } | null = null
  if (alvo) {
    const valores = [alvo.low, alvo.high, ...(preco ? [preco] : [])]
    const lo = Math.min(...valores)
    const hi = Math.max(...valores)
    const folga = (hi - lo) * 0.08 || hi * 0.05
    const min = lo - folga
    const max = hi + folga
    regua = { min, max, pos: (v) => ((v - min) / (max - min)) * 100 }
  }
  const potencial = alvo && preco ? alvo.consensus / preco - 1 : null
  const alvoUnico = alvo && alvo.low === alvo.high

  const total = recomendacoes
    ? recomendacoes.strongBuy + recomendacoes.buy + recomendacoes.hold + recomendacoes.sell + recomendacoes.strongSell
    : 0
  const buy = recomendacoes ? recomendacoes.strongBuy + recomendacoes.buy : 0
  const sell = recomendacoes ? recomendacoes.sell + recomendacoes.strongSell : 0
  const hold = recomendacoes?.hold ?? 0
  const maxHist = recomendacoes ? Math.max(1, ...recomendacoes.historico.map((h) => h.buy + h.hold + h.sell)) : 1

  return (
    <div className="glass rounded-xl p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t("title")}</h2>
          {total > 0 && <p className="text-xs text-muted-foreground mt-0.5">{t("subtitle", { n: total })}</p>}
        </div>
        {recomendacoes?.consensus && (
          <span
            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
            style={{
              color: recomendacoes.consensus.includes("BUY") ? COR.buy : recomendacoes.consensus.includes("SELL") ? COR.sell : COR.hold,
              background: "color-mix(in srgb, currentColor 12%, transparent)",
            }}
          >
            {t(`consensus.${recomendacoes.consensus}`)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Preço-alvo */}
        {alvo && regua && (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("targetTitle")}</h3>
              {potencial !== null && (
                <span className={`text-sm font-bold nums ${potencial >= 0 ? "text-bull" : "text-bear"}`}>
                  {t("upside")} {potencial >= 0 ? "+" : ""}{(potencial * 100).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="text-3xl font-bold nums">{fmt(alvo.consensus)}</div>

            <div className="relative h-10 mt-1">
              <div
                className="absolute top-4 h-2 rounded-full bg-primary/25"
                style={{ left: `${regua.pos(alvo.low)}%`, width: `${Math.max(1, regua.pos(alvo.high) - regua.pos(alvo.low))}%` }}
              />
              <div className="absolute top-2.5 h-5 w-0.5 bg-primary" style={{ left: `${regua.pos(alvo.median)}%` }} title={t("median")} />
              {preco && (
                <div className="absolute top-0 flex flex-col items-center -translate-x-1/2" style={{ left: `${regua.pos(preco)}%` }}>
                  <div className="h-9 w-0.5 bg-foreground" />
                </div>
              )}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground nums">
              <span>{t("low")} {fmt(alvo.low)}</span>
              <span>{t("median")} {fmt(alvo.median)}</span>
              <span>{t("high")} {fmt(alvo.high)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {preco && <><span className="inline-block w-2.5 h-0.5 bg-foreground align-middle mr-1.5" />{t("currentPrice")} {fmt(preco)} · </>}
              {alvoUnico ? t("singleTarget") : t("targetsLastYear", { n: alvo.alvosUltimoAno })}
            </p>
          </div>
        )}

        {/* Recomendações */}
        {recomendacoes && total > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("ratingsTitle")}</h3>
            <div className="flex h-3 rounded-full overflow-hidden">
              {buy > 0 && <div style={{ width: `${(buy / total) * 100}%`, background: COR.buy }} />}
              {hold > 0 && <div style={{ width: `${(hold / total) * 100}%`, background: COR.hold }} />}
              {sell > 0 && <div style={{ width: `${(sell / total) * 100}%`, background: COR.sell }} />}
            </div>
            <div className="flex justify-between text-sm">
              <span><span className="font-bold nums" style={{ color: COR.buy }}>{buy}</span> {t("buy")}</span>
              <span><span className="font-bold nums" style={{ color: COR.hold }}>{hold}</span> {t("hold")}</span>
              <span><span className="font-bold nums" style={{ color: COR.sell }}>{sell}</span> {t("sell")}</span>
            </div>

            {recomendacoes.historico.length > 1 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-2">{t("history")}</p>
                <div className="flex items-end gap-1 h-16">
                  {recomendacoes.historico.map((h) => {
                    const n = h.buy + h.hold + h.sell
                    return (
                      <div
                        key={h.date}
                        className="flex-1 flex flex-col-reverse rounded-sm overflow-hidden"
                        style={{ height: `${(n / maxHist) * 100}%` }}
                        title={`${h.date.slice(0, 7)} · ${h.buy} / ${h.hold} / ${h.sell}`}
                      >
                        <div style={{ flex: h.buy, background: COR.buy }} />
                        <div style={{ flex: h.hold, background: COR.hold }} />
                        <div style={{ flex: h.sell, background: COR.sell }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/70">{t("disclaimer")}</p>
    </div>
  )
}
