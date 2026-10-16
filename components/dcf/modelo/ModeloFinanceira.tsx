"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, RotateCcw } from "lucide-react"
import {
  raciosFin, pressupostosFinIniciais, projetarFin, avaliarFin, grelhaKeRoe, keDe,
  type AnoFin, type PressupostosFin,
} from "@/lib/finance/modelo"
import { TabelaModelo, useFormatos, type Formato, type LinhaTabela } from "./TabelaModelo"

/**
 * Modelo para financeiras: retorno em excesso (residual income). Os bancos, as
 * seguradoras e as corretoras não se avaliam por FCFF, porque o balanço é o
 * negócio: avalia-se quanto o capital próprio rende acima do que custa.
 * Cálculo no cliente (lib/finance/modelo/financeiras); rascunho por empresa
 * no localStorage.
 */

export type DadosFinanceira = {
  ticker: string
  nome: string
  historico: AnoFin[]
  capitalProprio: number | null
  preco: number | null
  acoes: number | null
  rf: number | null
  beta: number | null
  dataBalanco: string | null
}

const chave = (ticker: string) => `bv-dcf-fin:v1:${ticker}`
const lerRascunho = (ticker: string): PressupostosFin | null => {
  try { const s = localStorage.getItem(chave(ticker)); return s ? (JSON.parse(s) as PressupostosFin) : null } catch { return null }
}
const gravarRascunho = (ticker: string, p: PressupostosFin | null) => {
  try { if (p) localStorage.setItem(chave(ticker), JSON.stringify(p)); else localStorage.removeItem(chave(ticker)) } catch { /* modo privado */ }
}

function Campo({ rotulo, valor, formato, onMudar, ajuda }: { rotulo: string; valor: number; formato: Formato; onMudar: (v: number) => void; ajuda?: string }) {
  const { paraInput, ler } = useFormatos()
  const [texto, setTexto] = React.useState(paraInput(valor, formato))
  const [foco, setFoco] = React.useState(false)
  const mostrado = foco ? texto : paraInput(valor, formato)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
      <div className="flex items-center gap-2">
        <input
          value={mostrado}
          inputMode="decimal"
          onFocus={(e) => { setTexto(paraInput(valor, formato)); setFoco(true); e.currentTarget.select() }}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            setFoco(false)
            if (texto === paraInput(valor, formato)) return
            const n = ler(texto, formato)
            if (n !== null) onMudar(n)
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-28 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-right text-sm font-medium tabular-nums text-primary outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">{formato === "pct" ? "%" : ""}</span>
      </div>
      {ajuda && <span className="text-[11px] leading-snug text-muted-foreground/80">{ajuda}</span>}
    </label>
  )
}

function Cartao({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-base font-semibold tracking-tight">{titulo}</h3>
        {ajuda && <p className="mt-1 text-sm text-muted-foreground">{ajuda}</p>}
      </div>
      {children}
    </section>
  )
}

function LinhaValor({ r, x, forte }: { r: string; x: string; forte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${forte ? "border-t border-border/60 font-semibold" : ""}`}>
      <span className={forte ? "text-foreground" : "text-muted-foreground"}>{r}</span>
      <span className="tabular-nums">{x}</span>
    </div>
  )
}

export function ModeloFinanceira({ d }: { d: DadosFinanceira }) {
  const t = useTranslations("dcfModelo")
  const tf = useTranslations("dcfModelo.financeira")
  const { fmt } = useFormatos()

  const iniciais = React.useMemo(() => pressupostosFinIniciais(d.historico, { rf: d.rf, beta: d.beta }), [d.historico, d.rf, d.beta])
  const [rasc, setRasc] = React.useState<PressupostosFin | null>(() => lerRascunho(d.ticker))
  const p = rasc ?? iniciais
  const atualizar = (patch: Partial<PressupostosFin>) => {
    const novo = { ...p, ...patch }
    setRasc(novo); gravarRascunho(d.ticker, novo)
  }
  const repor = () => { setRasc(null); gravarRascunho(d.ticker, null) }

  const capital0 = d.capitalProprio ?? 0
  const mercado = { preco: d.preco ?? 0, acoes: d.acoes ?? 0, capitalProprio: capital0 }
  const proj = React.useMemo(() => projetarFin(capital0, p), [capital0, p])
  const v = React.useMemo(() => avaliarFin(proj, p, mercado), [proj, p, mercado.preco, mercado.acoes, mercado.capitalProprio]) // eslint-disable-line react-hooks/exhaustive-deps
  const grelha = React.useMemo(() => grelhaKeRoe(mercado, p), [p, mercado.preco, mercado.acoes, mercado.capitalProprio]) // eslint-disable-line react-hooks/exhaustive-deps
  const rs = raciosFin(d.historico)
  const ultimoAno = d.historico[d.historico.length - 1]?.fiscalYear ?? new Date().getFullYear()
  const anosProj = proj.map((a) => ultimoAno + a.ano)
  const ke = keDe(p)

  const col = <K extends keyof AnoFin>(k: K) => d.historico.map((a) => a[k] as number | null)
  const linhas: LinhaTabela[] = [
    { rotulo: tf("linhas.lucro"), formato: "m", hist: col("netIncome"), proj: proj.map((a) => a.lucro), destaque: true },
    { rotulo: tf("linhas.roe"), formato: "pct", hist: rs.map((r) => r.roe), proj: proj.map((a) => a.roe) },
    { rotulo: tf("linhas.distribuicoes"), formato: "m", hist: d.historico.map((a) => ((a.dividendos ?? 0) + (a.recompras ?? 0)) || null), proj: proj.map((a) => a.distribuicoes) },
    { rotulo: tf("linhas.payout"), formato: "pct", hist: rs.map((r) => r.payout), proj: proj.map(() => p.payout) },
    { rotulo: tf("linhas.capital"), formato: "m", hist: col("totalEquity"), proj: proj.map((a) => a.capitalFim), destaque: true },
    { rotulo: tf("linhas.custoCapital"), formato: "m", proj: proj.map((a) => ke * a.capitalInicio) },
    { rotulo: tf("linhas.excesso"), formato: "m", proj: proj.map((a) => a.retornoExcesso), subtotal: true, destaque: true },
    { rotulo: t("linhas.fator"), formato: "fator", proj: proj.map((a) => a.fatorDesconto) },
    { rotulo: tf("linhas.vp"), formato: "m", proj: proj.map((a) => a.valorPresente), subtotal: true },
  ]

  const avisos: string[] = []
  if (v.valido) {
    if (p.g > v.crescimentoSustentavel + 1e-9) avisos.push(tf("avisos.gInsustentavel", { g: fmt(p.g, "pct"), s: fmt(v.crescimentoSustentavel, "pct") }))
    if (v.pesoTerminal > 0.75) avisos.push(t("avisos.pesoTerminal", { pct: fmt(v.pesoTerminal, "pct") }))
    if (p.roeInicial > 0.3 || p.roeFinal > 0.3) avisos.push(tf("avisos.roeAlto"))
  }
  const cor = ""  // sem cores de veredicto
  const meio = 2

  if (!(capital0 > 0) || d.historico.length < 2) {
    return <div className="glass rounded-xl p-5 text-sm">{tf("semDados")}</div>
  }

  return (
    <div className="space-y-6">
      <div className="glass flex items-start gap-3 rounded-xl p-5 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <p>{tf("intro")}</p>
      </div>

      <Cartao titulo={tf("pressupostos.titulo")} ajuda={tf("pressupostos.ajuda")}>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <Campo rotulo={tf("pressupostos.roeInicial")} valor={p.roeInicial} formato="pct" onMudar={(x) => atualizar({ roeInicial: x })} ajuda={tf("pressupostos.roeInicialAjuda")} />
          <Campo rotulo={tf("pressupostos.roeFinal")} valor={p.roeFinal} formato="pct" onMudar={(x) => atualizar({ roeFinal: x })} ajuda={tf("pressupostos.roeFinalAjuda")} />
          <Campo rotulo={tf("pressupostos.payout")} valor={p.payout} formato="pct" onMudar={(x) => atualizar({ payout: Math.min(1.5, Math.max(0, x)) })} ajuda={tf("pressupostos.payoutAjuda")} />
          <Campo rotulo={t("pressupostos.g")} valor={p.g} formato="pct" onMudar={(x) => atualizar({ g: x })} ajuda={tf("pressupostos.gAjuda")} />
          <Campo rotulo={t("pressupostos.rf")} valor={p.rf} formato="pct" onMudar={(x) => atualizar({ rf: x })} />
          <Campo rotulo={t("pressupostos.erp")} valor={p.erp} formato="pct" onMudar={(x) => atualizar({ erp: x })} />
          <Campo rotulo={t("pressupostos.beta")} valor={p.beta} formato="anos" onMudar={(x) => atualizar({ beta: x })} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("horizonte")}</span>
            <select value={p.anos} onChange={(e) => atualizar({ anos: Number(e.target.value) })} className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              {[5, 7, 10].map((n) => <option key={n} value={n}>{t("anos", { n })}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{tf("ke", { ke: fmt(ke, "pct") })}</span>
          {rasc && (
            <button type="button" onClick={repor} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" />{t("repor")}
            </button>
          )}
        </div>
      </Cartao>

      {v.valido ? (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { r: t("avaliacao.valorPorAcao"), x: `$${fmt(v.valorPorAcao, "anos")}`, k: "text-primary" },
              { r: t("avaliacao.preco"), x: `$${fmt(v.preco, "anos")}`, k: "" },
              { r: t("avaliacao.potencial"), x: `${v.potencial >= 0 ? "+" : ""}${fmt(v.potencial, "pct")}`, k: cor },
              { r: t("avaliacao.margemSeguranca"), x: fmt(v.margemSeguranca, "pct"), k: cor },
            ].map((k) => (
              <div key={k.r} className="glass rounded-xl p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k.r}</p>
                <p className={`mt-2 text-3xl font-bold tabular-nums ${k.k}`}>{k.x}</p>
              </div>
            ))}
          </section>
          {avisos.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              {avisos.map((x) => <p key={x} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{x}</p>)}
            </div>
          )}
        </>
      ) : (
        <div className="glass flex items-start gap-3 rounded-xl p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p>{tf(`erros.${v.erro ?? "SEM_DADOS"}`)}</p>
        </div>
      )}

      <Cartao titulo={tf("projecao")} ajuda={tf("projecaoAjuda", { data: d.dataBalanco ?? "N/A" })}>
        <TabelaModelo anosHist={d.historico.map((a) => a.fiscalYear)} anosProj={anosProj} linhas={linhas} unidade={t("unidade")} />
      </Cartao>

      {v.valido && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao titulo={tf("ponte.titulo")}>
            <LinhaValor r={tf("ponte.capitalAtual")} x={`$${fmt(capital0, "m")} M`} />
            <LinhaValor r={tf("ponte.somaVp")} x={`$${fmt(v.somaVp, "m")} M`} />
            <LinhaValor r={tf("ponte.vpTerminal")} x={`$${fmt(v.vpTerminal, "m")} M`} />
            <LinhaValor forte r={tf("ponte.valorCapital")} x={`$${fmt(v.valorCapital, "m")} M`} />
            <LinhaValor r={t("avaliacao.acoes")} x={`${fmt(mercado.acoes, "m")} M`} />
            <LinhaValor forte r={t("avaliacao.valorPorAcao")} x={`$${fmt(v.valorPorAcao, "anos")}`} />
            <LinhaValor r={tf("ponte.pbAtual")} x={mercado.preco > 0 ? fmt((mercado.preco * mercado.acoes) / capital0, "x") : "N/A"} />
            <LinhaValor r={tf("ponte.pb")} x={fmt(v.pbImplicito, "x")} />
            <LinhaValor r={tf("ponte.pe")} x={v.peImplicito === null ? "N/A" : fmt(v.peImplicito, "x")} />
            <LinhaValor r={tf("ponte.pesoTerminal")} x={fmt(v.pesoTerminal, "pct")} />
          </Cartao>
          <Cartao titulo={tf("sensibilidade.titulo")} ajuda={tf("sensibilidade.ajuda")}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-separate border-spacing-1 text-sm tabular-nums">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left text-[11px] font-medium text-muted-foreground">Ke ↓ / ROE →</th>
                    {grelha.roe.map((r, j) => <th key={j} className={`px-2 py-1 text-right text-xs font-semibold ${j === meio ? "text-primary" : "text-muted-foreground"}`}>{fmt(r, "pct")}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grelha.ke.map((k, i) => (
                    <tr key={i}>
                      <th className={`px-2 py-1 text-right text-xs font-semibold ${i === meio ? "text-primary" : "text-muted-foreground"}`}>{fmt(k, "pct")}</th>
                      {grelha.valores[i].map((x, j) => (
                        <td key={j} className={`rounded-md px-2 py-1.5 text-right ${x === null ? "text-muted-foreground/50" : x >= v.preco ? "bg-bull/10 text-bull" : "bg-bear/10 text-bear"} ${i === meio && j === meio ? "font-bold ring-1 ring-primary" : ""}`}>
                          {x === null ? "—" : `$${fmt(x, "anos")}`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        </div>
      )}

      <p className="rounded-xl border border-border/50 bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">{t("legal.aviso")}</p>
    </div>
  )
}
