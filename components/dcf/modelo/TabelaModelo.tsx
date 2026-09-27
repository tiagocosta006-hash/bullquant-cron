"use client"

import * as React from "react"
import { useLocale } from "next-intl"
import type { Driver } from "@/lib/finance/modelo"

/**
 * A grelha de um modelo FMVA: anos históricos à esquerda (esbatidos), anos
 * projetados à direita. Linhas de pressupostos são editáveis na projeção; as
 * restantes são resultados. Valores monetários em milhões de USD.
 */

export type Formato = "m" | "pct" | "dias" | "x" | "fator" | "anos"

export type LinhaTabela = {
  rotulo: string
  formato: Formato
  hist?: (number | null)[]
  proj?: (number | null)[]
  /** Se definido, as células projetadas deste driver são editáveis. */
  driver?: Driver
  destaque?: boolean
  subtotal?: boolean
  /** Linha de título de secção (sem valores). */
  seccao?: boolean
  nota?: string
}

export function useFormatos() {
  const locale = useLocale()
  return React.useMemo(() => {
    const nf = (d: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d })
    const f0 = nf(0), f1 = nf(1), f2 = nf(2)
    const fmt = (v: number | null | undefined, formato: Formato): string => {
      if (v === null || v === undefined || !Number.isFinite(v)) return "N/A"
      switch (formato) {
        case "m": {
          const m = v / 1e6
          const s = Math.abs(m) >= 100 ? f0.format(Math.abs(m)) : f1.format(Math.abs(m))
          return m < 0 ? `(${s})` : s
        }
        case "pct": return `${f1.format(v * 100)}%`
        case "dias": return f0.format(v)
        case "x": return `${f1.format(v)}x`
        case "fator": return new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v)
        case "anos": return f2.format(v)
      }
    }
    /** "12,5" ou "12.5" → 0,125 (pct) ou 12,5 (resto). */
    const ler = (texto: string, formato: Formato): number | null => {
      const limpo = texto.replace(/[%x\s]/g, "").replace(",", ".")
      if (limpo === "" || limpo === "-") return null
      const v = Number(limpo)
      if (!Number.isFinite(v)) return null
      return formato === "pct" ? v / 100 : v
    }
    // Até 2 casas, sem zeros inúteis: o beta de 1,15 aparecia como "1,2".
    const ate2 = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false })
    const paraInput = (v: number, formato: Formato) => ate2.format(formato === "pct" ? v * 100 : v)
    return { fmt, ler, paraInput }
  }, [locale])
}

function CelulaEditavel({
  valor, formato, onMudar, rotulo,
}: { valor: number; formato: Formato; onMudar: (v: number) => void; rotulo: string }) {
  const { paraInput, ler } = useFormatos()
  const [texto, setTexto] = React.useState(paraInput(valor, formato))
  const [foco, setFoco] = React.useState(false)
  React.useEffect(() => {
    if (!foco) setTexto(paraInput(valor, formato))
  }, [valor, formato, foco, paraInput])
  const confirmar = () => {
    setFoco(false)
    // Sem alteração do texto, nada muda: entrar e sair de uma célula não pode
    // arredondar o valor que lá estava.
    if (texto === paraInput(valor, formato)) return
    const v = ler(texto, formato)
    if (v !== null) onMudar(v)
    else setTexto(paraInput(valor, formato))
  }
  return (
    <input
      aria-label={rotulo}
      value={texto}
      inputMode="decimal"
      onFocus={(e) => { setFoco(true); e.currentTarget.select() }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        if (e.key === "Escape") { setTexto(paraInput(valor, formato)); setFoco(false); (e.target as HTMLInputElement).blur() }
      }}
      className="w-full min-w-[4.5rem] rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-right text-sm font-medium tabular-nums text-primary outline-none focus:border-primary focus:bg-background"
    />
  )
}

export function TabelaModelo({
  anosHist, anosProj, linhas, onEditar, unidade,
}: {
  anosHist: number[]
  anosProj: number[]
  linhas: LinhaTabela[]
  onEditar?: (driver: Driver, ano: number, valor: number) => void
  unidade?: string
}) {
  const { fmt } = useFormatos()
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            <th className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-left text-xs font-medium text-muted-foreground">{unidade}</th>
            {anosHist.map((a) => (
              <th key={`h${a}`} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{a}</th>
            ))}
            {anosProj.map((a) => (
              <th key={`p${a}`} className="border-l border-primary/10 bg-primary/5 px-3 py-2 text-right text-xs font-semibold text-primary">{a}E</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, li) =>
            l.seccao ? (
              <tr key={li} className="border-b border-border/40">
                <td colSpan={1 + anosHist.length + anosProj.length} className="sticky left-0 bg-background px-3 pt-4 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {l.rotulo}
                </td>
              </tr>
            ) : (
              <tr key={li} className={`border-b border-border/30 ${l.subtotal ? "bg-muted/20" : ""}`}>
                <td className={`sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 ${l.subtotal ? "bg-muted/20" : "bg-background"} ${l.destaque ? "font-semibold text-foreground" : "text-muted-foreground"}`} title={l.nota}>
                  {l.rotulo}
                </td>
                {anosHist.map((a, i) => (
                  <td key={`h${a}`} className="px-3 py-1.5 text-right tabular-nums text-muted-foreground/80">
                    {l.hist ? fmt(l.hist[i] ?? null, l.formato) : ""}
                  </td>
                ))}
                {anosProj.map((a, i) => (
                  <td key={`p${a}`} className={`border-l border-primary/10 px-2 py-1 text-right tabular-nums ${l.destaque ? "font-semibold text-foreground" : ""}`}>
                    {l.driver && onEditar && l.proj && l.proj[i] !== null && l.proj[i] !== undefined ? (
                      <CelulaEditavel valor={l.proj[i] as number} formato={l.formato} rotulo={`${l.rotulo} ${a}`} onMudar={(v) => onEditar(l.driver!, i, v)} />
                    ) : l.proj ? fmt(l.proj[i] ?? null, l.formato) : ""}
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
