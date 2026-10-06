"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { GraficoMultiplo, estatisticas, type PontoMultiplo } from "@/components/stock/GraficoMultiplo"
import {
  type AnoHistorico, type AnoProjetado, type Avaliacao, type Driver, type EstimativaModelo, type Mercado, type Pressupostos,
  type PressupostosAvaliacao, type RaciosAno,
} from "@/lib/finance/modelo"
import { TabelaModelo, useFormatos, type Formato, type LinhaTabela } from "./TabelaModelo"

/**
 * Os separadores do modelo avançado, à FMVA: Historicals → Schedules →
 * Projections → Valuation. Os Schedules (inputs com painel de dados) vivem em
 * Schedules.tsx; os pressupostos de avaliação vivem na
 * Valuation, onde são usados.
 */

export type ContextoSeparador = {
  ticker: string
  historico: AnoHistorico[]
  racios: RaciosAno[]
  pressupostos: Pressupostos
  iniciais: Pressupostos | null
  projecoes: AnoProjetado[]
  avaliacao: Avaliacao
  mercado: Mercado
  estimativas: EstimativaModelo[]
  /** EV/EBITDA no fim de cada ano fiscal real, e o atual (TTM). */
  multiplosHistoricos: Array<{ fiscalYear: number; evEbitda: number | null }>
  evEbitdaAtual: number | null
  fracaoAno1: number
  /** Anos de hoje até ao fim do ano 1 (para re-correr o modelo na sensibilidade). */
  anosAteFimAno1: number
  onDriver: (d: Driver, ano: number, v: number) => void
  onDriverSerie: (d: Driver, valores: number[]) => void
  onSegmentoSerie: (nome: string, valores: number[]) => void
  onModoReceita: (modo: "total" | "segmentos") => void
  onAvaliacao: (patch: Partial<PressupostosAvaliacao>) => void
}

function Cartao({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="glass rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  )
}

function anosProj(c: ContextoSeparador) {
  return c.projecoes.map((p) => p.fiscalYear)
}
function ultimos<T>(arr: T[], n: number) {
  return arr.slice(-n)
}

function CampoAvaliacao({
  a, k, formato, rotulo, ajuda, onAvaliacao,
}: {
  a: PressupostosAvaliacao
  k: keyof PressupostosAvaliacao
  formato: Formato
  rotulo: string
  ajuda?: string
  onAvaliacao: (patch: Partial<PressupostosAvaliacao>) => void
}) {
  const { paraInput, ler } = useFormatos()
  const v = a[k] as number
  const [texto, setTexto] = React.useState(paraInput(v, formato))
  React.useEffect(() => setTexto(paraInput(v, formato)), [v, formato, paraInput])
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
      <div className="flex items-center gap-2">
        <input
          value={texto}
          inputMode="decimal"
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            if (texto === paraInput(v, formato)) return
            const n = ler(texto, formato)
            if (n !== null) onAvaliacao({ [k]: n } as Partial<PressupostosAvaliacao>)
            else setTexto(paraInput(v, formato))
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-28 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-right text-sm font-medium tabular-nums text-primary outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">{formato === "pct" ? "%" : formato === "x" ? "x" : ""}</span>
      </div>
      {ajuda && <span className="text-[11px] leading-snug text-muted-foreground/80">{ajuda}</span>}
    </label>
  )
}


export function SeparadorHistorico({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const h = c.historico
  const r = c.racios
  const col = <K extends keyof AnoHistorico>(k: K) => h.map((a) => a[k] as number | null)
  const linhas: LinhaTabela[] = [
    { rotulo: t("seccoes.demonstracao"), formato: "m", seccao: true },
    { rotulo: t("linhas.receita"), formato: "m", hist: col("revenue"), destaque: true },
    { rotulo: t("drivers.crescimentoReceita"), formato: "pct", hist: r.map((x) => x.crescimentoReceita) },
    { rotulo: t("linhas.lucroBruto"), formato: "m", hist: col("grossProfit") },
    { rotulo: t("drivers.margemBruta"), formato: "pct", hist: r.map((x) => x.margemBruta) },
    { rotulo: t("linhas.ebit"), formato: "m", hist: col("operatingIncome"), destaque: true },
    { rotulo: t("drivers.margemEbit"), formato: "pct", hist: r.map((x) => x.margemEbit) },
    { rotulo: t("linhas.ebitda"), formato: "m", hist: col("ebitda") },
    { rotulo: t("drivers.taxaImposto"), formato: "pct", hist: r.map((x) => x.taxaImposto) },
    { rotulo: t("seccoes.capexDa"), formato: "m", seccao: true },
    { rotulo: t("linhas.da"), formato: "m", hist: col("depreciationAndAmortization") },
    { rotulo: t("drivers.daPctReceita"), formato: "pct", hist: r.map((x) => x.daPctReceita) },
    { rotulo: t("linhas.capex"), formato: "m", hist: col("capex") },
    { rotulo: t("drivers.capexPctReceita"), formato: "pct", hist: r.map((x) => x.capexPctReceita) },
    { rotulo: t("linhas.sbc"), formato: "m", hist: col("stockBasedCompensation"), nota: t("linhas.sbcNota") },
    { rotulo: t("seccoes.fundoManeio"), formato: "m", seccao: true },
    { rotulo: t("linhas.clientes"), formato: "m", hist: col("accountsReceivable") },
    { rotulo: t("drivers.dso"), formato: "dias", hist: r.map((x) => x.dso) },
    { rotulo: t("linhas.inventario"), formato: "m", hist: col("inventory") },
    { rotulo: t("drivers.dio"), formato: "dias", hist: r.map((x) => x.dio) },
    { rotulo: t("linhas.fornecedores"), formato: "m", hist: col("accountsPayable") },
    { rotulo: t("drivers.dpo"), formato: "dias", hist: r.map((x) => x.dpo) },
    { rotulo: t("seccoes.cashFlow"), formato: "m", seccao: true },
    { rotulo: t("linhas.ocf"), formato: "m", hist: col("operatingCashFlow") },
    { rotulo: t("linhas.fcfHist"), formato: "m", hist: col("freeCashFlow"), destaque: true },
  ]
  return (
    <Cartao titulo={t("tabs.historico")}>
      <p className="text-sm text-muted-foreground">{t("historicoAjuda")}</p>
      <TabelaModelo anosHist={h.map((a) => a.fiscalYear)} anosProj={[]} linhas={linhas} unidade={t("unidade")} />
    </Cartao>
  )
}

// ─── 2. Schedules ──────────────────────────────────────────────────────────

/** CAGR entre dois valores positivos. */
export function SeparadorProjecoes({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const pr = c.projecoes
  const h = ultimos(c.historico, 3)
  const col = <K extends keyof AnoHistorico>(k: K) => h.map((a) => a[k] as number | null)
  const linhas: LinhaTabela[] = [
    { rotulo: t("seccoes.demonstracao"), formato: "m", seccao: true },
    { rotulo: t("linhas.receita"), formato: "m", hist: col("revenue"), proj: pr.map((p) => p.receita), destaque: true },
    { rotulo: t("linhas.custoVendas"), formato: "m", hist: col("costOfRevenue").map((v) => (v === null ? null : -v)), proj: pr.map((p) => -p.cogs) },
    { rotulo: t("linhas.lucroBruto"), formato: "m", hist: col("grossProfit"), proj: pr.map((p) => p.lucroBruto), subtotal: true },
    { rotulo: t("linhas.ebitda"), formato: "m", hist: col("ebitda"), proj: pr.map((p) => p.ebitda) },
    { rotulo: t("linhas.daMenos"), formato: "m", hist: col("depreciationAndAmortization").map((v) => (v === null ? null : -v)), proj: pr.map((p) => -p.da) },
    { rotulo: t("linhas.ebit"), formato: "m", hist: col("operatingIncome"), proj: pr.map((p) => p.ebit), subtotal: true, destaque: true },
    { rotulo: t("seccoes.fcff"), formato: "m", seccao: true },
    { rotulo: t("linhas.ebit"), formato: "m", proj: pr.map((p) => p.ebit) },
    { rotulo: t("linhas.impostosMenos"), formato: "m", proj: pr.map((p) => -p.impostosOperacionais) },
    { rotulo: t("linhas.nopat"), formato: "m", proj: pr.map((p) => p.nopat), subtotal: true },
    { rotulo: t("linhas.daMais"), formato: "m", proj: pr.map((p) => p.da) },
    { rotulo: t("linhas.capexMenos"), formato: "m", proj: pr.map((p) => -p.capex) },
    { rotulo: t("linhas.varFundoManeioMenos"), formato: "m", proj: pr.map((p) => -p.variacaoFundoManeio) },
    { rotulo: t("linhas.fcff"), formato: "m", proj: pr.map((p) => p.fcff), subtotal: true, destaque: true },
    { rotulo: t("seccoes.desconto"), formato: "m", seccao: true },
    { rotulo: t("linhas.fracao"), formato: "pct", proj: pr.map((p) => p.fracao), nota: t("linhas.fracaoNota") },
    { rotulo: t("linhas.periodo"), formato: "anos", proj: pr.map((p) => p.periodoDesconto) },
    { rotulo: t("linhas.fator"), formato: "fator", proj: pr.map((p) => p.fatorDesconto) },
    { rotulo: t("linhas.vp"), formato: "m", proj: pr.map((p) => p.valorPresente), subtotal: true, destaque: true },
  ]
  return (
    <Cartao titulo={t("tabs.projecoes")}>
      <p className="text-sm text-muted-foreground">{t("projecoesAjuda")}</p>
      <TabelaModelo anosHist={h.map((a) => a.fiscalYear)} anosProj={anosProj(c)} linhas={linhas} unidade={t("unidade")} />
    </Cartao>
  )
}


/**
 * EV/EBITDA histórico ao lado do exit multiple: a mesma linha semanal do
 * gráfico de múltiplos da página da empresa (/api/valuation), com média,
 * mediana e o múltiplo de saída escolhido. Sem acesso à série semanal (demo
 * anónima), cai nos valores de fim de ano fiscal.
 */
function HistoricoMultiplo({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const tV = useTranslations("stock.valuationChart")
  const { fmt } = useFormatos()
  const a = c.pressupostos.avaliacao
  const [semanal, setSemanal] = React.useState<PontoMultiplo[] | null>(null)
  React.useEffect(() => {
    let vivo = true
    fetch(`/api/valuation/${encodeURIComponent(c.ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Array<{ date: string; price: number; evEbitda?: number }> | null) => {
        if (vivo && Array.isArray(d)) setSemanal(d.map((x) => ({ date: x.date, price: x.price, v: x.evEbitda })))
      })
      .catch(() => undefined)
    return () => { vivo = false }
  }, [c.ticker])

  const anual: PontoMultiplo[] = c.multiplosHistoricos
    .filter((x) => x.evEbitda !== null)
    .map((x) => ({ date: `${x.fiscalYear}-12-31`, v: x.evEbitda }))
  const pontos = (semanal && semanal.some((x) => typeof x.v === "number") ? semanal : anual).filter(
    (x) => typeof x.v !== "number" || (x.v > 0 && x.v < 200),
  )
  if (pontos.length === 0) return null
  const { mediana } = estatisticas(pontos)
  const vals = pontos.map((x) => x.v).filter((x): x is number => typeof x === "number")
  const usar = (v: number) => c.onAvaliacao({ multiploSaida: Math.round(v * 10) / 10 })

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{t("multiplo.titulo")}</p>
        <p className="text-xs text-muted-foreground">
          {t("multiplo.resumo", { atual: fmt(c.evEbitdaAtual, "x"), mediana: fmt(mediana ?? null, "x"), min: fmt(Math.min(...vals), "x"), max: fmt(Math.max(...vals), "x") })}
        </p>
      </div>
      <div className="mt-2">
        <GraficoMultiplo
          pontos={pontos}
          formato="x"
          cor="#8b5cf6"
          nome="EV/EBITDA"
          altura={260}
          rotulos={{ media: tV("avgLabel"), mediana: tV("medianLabel"), preco: tV("tooltipPrice") }}
          linhaExtra={{ y: a.multiploSaida, rotulo: t("multiplo.saida", { x: fmt(a.multiploSaida, "x") }), cor: "var(--primary)" }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {mediana !== undefined && <button type="button" onClick={() => usar(mediana)} className="rounded-md border border-border/60 px-2.5 py-1 text-primary hover:bg-primary/10">{t("multiplo.usarMediana", { x: fmt(mediana, "x") })}</button>}
        {c.evEbitdaAtual && <button type="button" onClick={() => usar(c.evEbitdaAtual!)} className="rounded-md border border-border/60 px-2.5 py-1 text-primary hover:bg-primary/10">{t("multiplo.usarAtual", { x: fmt(c.evEbitdaAtual, "x") })}</button>}
        <span className="self-center text-muted-foreground">{t("multiplo.nota")}</span>
      </div>
    </div>
  )
}

function AssumptionsAvaliacao({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const a = c.pressupostos.avaliacao
  const onAvaliacao = c.onAvaliacao
  return (
    <Cartao titulo={t("pressupostos.avaliacao")}>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        <CampoAvaliacao a={a} onAvaliacao={onAvaliacao} k="rf" formato="pct" rotulo={t("pressupostos.rf")} ajuda={t("pressupostos.rfAjuda")} />
        <CampoAvaliacao a={a} onAvaliacao={onAvaliacao} k="erp" formato="pct" rotulo={t("pressupostos.erp")} ajuda={t("pressupostos.erpAjuda")} />
        <CampoAvaliacao a={a} onAvaliacao={onAvaliacao} k="beta" formato="anos" rotulo={t("pressupostos.beta")} ajuda={t("pressupostos.betaAjuda")} />
        <CampoAvaliacao a={a} onAvaliacao={onAvaliacao} k="custoDivida" formato="pct" rotulo={t("pressupostos.custoDivida")} ajuda={t("pressupostos.custoDividaAjuda")} />
        <CampoAvaliacao a={a} onAvaliacao={onAvaliacao} k="taxaImpostoWacc" formato="pct" rotulo={t("pressupostos.taxaImpostoWacc")} />
        <CampoAvaliacao a={a} onAvaliacao={onAvaliacao} k="g" formato="pct" rotulo={t("pressupostos.g")} ajuda={t("pressupostos.gAjuda")} />
        <CampoAvaliacao a={a} onAvaliacao={onAvaliacao} k="multiploSaida" formato="x" rotulo={t("pressupostos.multiplo")} ajuda={t("pressupostos.multiploAjuda")} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t("pressupostos.waccManual")}</span>
          <div className="flex items-center gap-2">
            <input
              defaultValue={a.waccManual !== null ? String(Math.round(a.waccManual * 1000) / 10).replace(".", ",") : ""}
              key={a.waccManual ?? "auto"}
              placeholder={t("pressupostos.waccAuto")}
              inputMode="decimal"
              onBlur={(e) => {
                const s = e.target.value.replace(",", ".").replace("%", "").trim()
                onAvaliacao({ waccManual: s === "" ? null : Number.isFinite(Number(s)) ? Number(s) / 100 : a.waccManual })
              }}
              className="w-28 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-right text-sm font-medium tabular-nums text-primary outline-none focus:border-primary placeholder:text-muted-foreground/60"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <span className="text-[11px] leading-snug text-muted-foreground/80">{t("pressupostos.waccManualAjuda")}</span>
        </label>
      </div>
      <HistoricoMultiplo c={c} />
      <div className="flex flex-wrap items-center gap-6 pt-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("pressupostos.metodo")}</span>
          {(["gordon", "multiplo", "media"] as const).map((m) => (
            <button key={m} type="button" onClick={() => onAvaliacao({ metodoTerminal: m })}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${a.metodoTerminal === m ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>
              {t(`pressupostos.metodos.${m}`)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={a.meioDoAno} onChange={(e) => onAvaliacao({ meioDoAno: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
          <span>{t("pressupostos.meioDoAno")}</span>
        </label>
      </div>
    </Cartao>
  )
}

// ─── 4. Valuation ──────────────────────────────────────────────────────────

export function SeparadorAvaliacao({ c }: { c: ContextoSeparador }) {
  const assumptions = <AssumptionsAvaliacao c={c} />
  const t = useTranslations("dcfModelo")
  const { fmt } = useFormatos()
  const v = c.avaliacao
  const a = c.pressupostos.avaliacao
  const m = c.mercado
  const w = v.wacc

  if (!v.valido) {
    return (
      <div className="space-y-6">
        {assumptions}
        <div className="glass flex items-start gap-3 rounded-xl p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p>{t(`erros.${v.erro ?? "SEM_DADOS"}`)}</p>
        </div>
      </div>
    )
  }

  const Linha = ({ rotulo, valor, forte, sinal }: { rotulo: string; valor: string; forte?: boolean; sinal?: string }) => (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${forte ? "border-t border-border/60 font-semibold" : ""}`}>
      <span className={forte ? "text-foreground" : "text-muted-foreground"}>{sinal && <span className="mr-2 inline-block w-3 text-center">{sinal}</span>}{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  )
  const usd = (x: number) => `$${fmt(x, "m")} M`

  const avisos: string[] = []
  if (v.pesoTerminal > 0.75) avisos.push(t("avisos.pesoTerminal", { pct: fmt(v.pesoTerminal, "pct") }))
  if (a.g > a.rf) avisos.push(t("avisos.gAcimaRf"))
  if (v.gImplicitoNoMultiplo !== null && Math.abs(v.gImplicitoNoMultiplo - a.g) > 0.02)
    avisos.push(t("avisos.divergencia", { g: fmt(v.gImplicitoNoMultiplo, "pct"), mult: fmt(v.multiploImplicitoNoGordon, "x") }))

  const cor = v.potencial >= 0 ? "text-bull" : "text-bear"
  return (
    <div className="space-y-6">
      {assumptions}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { r: t("avaliacao.valorPorAcao"), v: `$${fmt(v.valorPorAcao, "anos")}`, c: "text-primary" },
          { r: t("avaliacao.preco"), v: `$${fmt(v.preco, "anos")}`, c: "" },
          { r: t("avaliacao.potencial"), v: `${v.potencial >= 0 ? "+" : ""}${fmt(v.potencial, "pct")}`, c: cor },
          { r: t("avaliacao.margemSeguranca"), v: fmt(v.margemSeguranca, "pct"), c: cor },
        ].map((k) => (
          <div key={k.r} className="glass rounded-xl p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k.r}</p>
            <p className={`mt-2 text-3xl font-bold tabular-nums ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </section>

      {avisos.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          {avisos.map((x) => (
            <p key={x} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{x}</p>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao titulo={t("avaliacao.wacc")}>
          <div className="text-sm">
            <Linha rotulo={t("pressupostos.rf")} valor={fmt(a.rf, "pct")} />
            <Linha rotulo={t("pressupostos.beta")} valor={fmt(a.beta, "anos")} sinal="×" />
            <Linha rotulo={t("pressupostos.erp")} valor={fmt(a.erp, "pct")} sinal="×" />
            <Linha rotulo={t("avaliacao.custoCapital")} valor={fmt(w.custoCapitalProprio, "pct")} forte />
            <Linha rotulo={t("avaliacao.custoDividaApos")} valor={fmt(w.custoDividaAposImpostos, "pct")} />
            <Linha rotulo={t("avaliacao.pesoCapital")} valor={fmt(w.pesoCapitalProprio, "pct")} />
            <Linha rotulo={t("avaliacao.pesoDivida")} valor={fmt(w.pesoDivida, "pct")} />
            <Linha rotulo={w.manual ? t("avaliacao.waccManualUsada") : t("avaliacao.wacc")} valor={fmt(w.wacc, "pct")} forte />
          </div>
        </Cartao>

        <Cartao titulo={t("avaliacao.terminal")}>
          <div className="text-sm">
            <Linha rotulo={t("avaliacao.gordon")} valor={usd(v.terminalGordon)} />
            <Linha rotulo={t("avaliacao.multiploImplicito")} valor={fmt(v.multiploImplicitoNoGordon, "x")} />
            <Linha rotulo={t("avaliacao.multiploSaida", { x: fmt(a.multiploSaida, "x") })} valor={usd(v.terminalMultiplo)} />
            <Linha rotulo={t("avaliacao.gImplicito")} valor={fmt(v.gImplicitoNoMultiplo, "pct")} />
            <Linha rotulo={t(`avaliacao.usado.${a.metodoTerminal}`)} valor={usd(v.terminalUsado)} forte />
            <Linha rotulo={t("avaliacao.vpTerminal")} valor={usd(v.vpTerminal)} />
            <Linha rotulo={t("avaliacao.pesoTerminal")} valor={fmt(v.pesoTerminal, "pct")} />
          </div>
        </Cartao>

        <Cartao titulo={t("avaliacao.ponte")}>
          <div className="text-sm">
            <Linha rotulo={t("avaliacao.somaVp")} valor={usd(v.somaVpFcff)} />
            <Linha rotulo={t("avaliacao.vpTerminal")} valor={usd(v.vpTerminal)} sinal="+" />
            <Linha rotulo={t("avaliacao.ev")} valor={usd(v.enterpriseValue)} forte />
            <Linha rotulo={t("avaliacao.divida")} valor={usd(m.dividaTotal)} sinal="−" />
            <Linha rotulo={t("avaliacao.caixa")} valor={usd(m.caixa)} sinal="+" />
            <Linha rotulo={t("avaliacao.minoritarios")} valor={usd(m.interessesMinoritarios)} sinal="−" />
            <Linha rotulo={t("avaliacao.capitalProprio")} valor={usd(v.valorCapitalProprio)} forte />
            <Linha rotulo={t("avaliacao.acoes")} valor={`${fmt(m.acoes, "m")} M`} sinal="÷" />
            <Linha rotulo={t("avaliacao.valorPorAcao")} valor={`$${fmt(v.valorPorAcao, "anos")}`} forte />
          </div>
        </Cartao>
      </div>
      <p className="text-xs text-muted-foreground">{t("avaliacao.nota", { f: fmt(c.fracaoAno1, "pct") })}</p>
    </div>
  )
}
