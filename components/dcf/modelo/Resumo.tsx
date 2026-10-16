"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { correrCenarios } from "@/lib/finance/modelo"
import type { ContextoSeparador } from "./Separadores"
import { useFormatos } from "./TabelaModelo"
import { BotoesExportar } from "./exportar/BotoesExportar"
import { VersoesGuardadas } from "./Versoes"

/**
 * Bloco 7 do modelo FMVA: Summary. A página que se mostra a um cliente: o
 * resultado, os três cenários, os pressupostos que mais pesam, a tese do
 * analista e o aviso legal. O PDF e o Excel têm o mesmo conteúdo.
 */

const MAX_TESE = 3000

function Linha({ r, x }: { r: string; x: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/30 py-1.5 text-sm">
      <span className="text-muted-foreground">{r}</span><span className="tabular-nums font-medium">{x}</span>
    </div>
  )
}

export function SeparadorResumo({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const { fmt } = useFormatos()
  const v = c.avaliacao
  const a = c.pressupostos.avaliacao
  const m = c.mercado
  const d = c.pressupostos.drivers
  const n = d.crescimentoReceita.length
  const [tese, setTese] = React.useState(c.conjunto.tese ?? "")

  const cen = React.useMemo(() => {
    const base = c.historico[c.historico.length - 1]
    return base ? correrCenarios(base, c.conjunto, m, c.fracaoAno1, c.anosAteFimAno1) : null
  }, [c.historico, c.conjunto, m, c.fracaoAno1, c.anosAteFimAno1])

  if (!v.valido || !cen) return <p className="text-sm text-muted-foreground">{t("sensibilidade.semModelo")}</p>

  const pot = (x: number | null) => (x === null || m.preco <= 0 ? "N/A" : `${x >= m.preco ? "+" : ""}${fmt(x / m.preco - 1, "pct")}`)
  const cor = (_x: number | null) => ""  // sem cores de veredicto: é uma diferença face ao preço, não um sinal
  const avisos: string[] = []
  if (v.pesoTerminal > 0.75) avisos.push(t("avisos.pesoTerminal", { pct: fmt(v.pesoTerminal, "pct") }))
  if (a.g > a.rf) avisos.push(t("avisos.gAcimaRf"))
  if (v.gImplicitoNoMultiplo !== null && Math.abs(v.gImplicitoNoMultiplo - a.g) > 0.02)
    avisos.push(t("avisos.divergencia", { g: fmt(v.gImplicitoNoMultiplo, "pct"), mult: fmt(v.multiploImplicitoNoGordon, "x") }))

  return (
    <div className="space-y-6">
      <section className="glass rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold tracking-tight">{t("resumo.titulo")}</h3>
          <BotoesExportar c={c} />
        </div>
        <p className="text-sm text-muted-foreground">{t("resumo.ajuda", { cenario: t(`cenario.nomes.${c.cenario}`) })}</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { r: t("avaliacao.valorPorAcao"), x: `$${fmt(v.valorPorAcao, "anos")}`, k: "text-primary" },
            { r: t("avaliacao.preco"), x: `$${fmt(v.preco, "anos")}`, k: "" },
            { r: t("avaliacao.potencial"), x: pot(v.valorPorAcao), k: cor(v.valorPorAcao) },
            { r: t("avaliacao.margemSeguranca"), x: fmt(v.margemSeguranca, "pct"), k: cor(v.valorPorAcao) },
          ].map((k) => (
            <div key={k.r} className="rounded-xl border border-border/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k.r}</p>
              <p className={`mt-2 text-2xl font-bold tabular-nums ${k.k}`}>{k.x}</p>
            </div>
          ))}
        </div>
      </section>

      {avisos.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          {avisos.map((x) => <p key={x} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{x}</p>)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-xl p-5">
          <h3 className="mb-2 text-base font-semibold tracking-tight">{t("sensibilidade.cenarios.titulo")}</h3>
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">{t("cenario.rotulo")}</th>
              <th className="py-1 text-right font-medium">{t("avaliacao.valorPorAcao")}</th>
              <th className="py-1 text-right font-medium">{t("avaliacao.potencial")}</th>
              <th className="py-1 text-right font-medium">{t("sensibilidade.cenarios.probabilidade")}</th>
            </tr></thead>
            <tbody>
              {cen.linhas.map((l) => (
                <tr key={l.nome} className="border-t border-border/40">
                  <td className="py-1.5 font-semibold">{t(`cenario.nomes.${l.nome}`)}</td>
                  <td className="py-1.5 text-right">{l.valor === null ? "N/A" : `$${fmt(l.valor, "anos")}`}</td>
                  <td className={`py-1.5 text-right ${cor(l.valor)}`}>{pot(l.valor)}</td>
                  <td className="py-1.5 text-right">{fmt(c.conjunto.probabilidades[l.nome], "pct")}</td>
                </tr>
              ))}
              <tr className="border-t border-border/60 font-semibold">
                <td className="py-1.5" colSpan={1}>{t("sensibilidade.cenarios.esperado")}</td>
                <td className="py-1.5 text-right text-primary">{cen.esperado === null ? "N/A" : `$${fmt(cen.esperado, "anos")}`}</td>
                <td className={`py-1.5 text-right ${cor(cen.esperado)}`}>{pot(cen.esperado)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>

        <section className="glass rounded-xl p-5">
          <h3 className="mb-2 text-base font-semibold tracking-tight">{t("pressupostos.avaliacao")}</h3>
          <Linha r={t("drivers.crescimentoReceita")} x={`${fmt(d.crescimentoReceita[0], "pct")} → ${fmt(d.crescimentoReceita[n - 1], "pct")}`} />
          <Linha r={t("drivers.margemEbit")} x={`${fmt(d.margemEbit[0], "pct")} → ${fmt(d.margemEbit[n - 1], "pct")}`} />
          <Linha r={t("avaliacao.wacc")} x={fmt(v.wacc.wacc, "pct")} />
          <Linha r={t("pressupostos.metodo")} x={t(`pressupostos.metodos.${a.metodoTerminal}`)} />
          <Linha r={t("pressupostos.g")} x={fmt(a.g, "pct")} />
          <Linha r={t("pressupostos.multiplo")} x={fmt(a.multiploSaida, "x")} />
          <Linha r={t("avaliacao.pesoTerminal")} x={fmt(v.pesoTerminal, "pct")} />
        </section>
      </div>

      <section className="glass rounded-xl p-5 space-y-2">
        <h3 className="text-base font-semibold tracking-tight">{t("resumo.tese")}</h3>
        <p className="text-sm text-muted-foreground">{t("resumo.teseAjuda")}</p>
        <textarea
          value={tese}
          maxLength={MAX_TESE}
          rows={6}
          onChange={(e) => setTese(e.target.value)}
          onBlur={() => tese !== (c.conjunto.tese ?? "") && c.onTese(tese)}
          placeholder={t("resumo.tesePlaceholder")}
          className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
        />
        <p className="text-right text-[11px] text-muted-foreground">{tese.length}/{MAX_TESE}</p>
      </section>

      <VersoesGuardadas c={c} />

      <p className="rounded-xl border border-border/50 bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">{t("legal.aviso")}</p>
    </div>
  )
}
