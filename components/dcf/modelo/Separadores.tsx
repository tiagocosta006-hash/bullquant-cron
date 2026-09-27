"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts"
import {
  resumo,
  type AnoHistorico, type AnoProjetado, type Avaliacao, type Driver, type EstimativaModelo, type Mercado, type Pressupostos,
  type PressupostosAvaliacao, type RaciosAno,
} from "@/lib/finance/modelo"
import { TabelaModelo, CelulaEditavel, useFormatos, type Formato, type LinhaTabela } from "./TabelaModelo"

/**
 * Os separadores do modelo avançado, à FMVA: Historicals → Schedules →
 * Projections → Valuation. Cada schedule tem os SEUS assumptions no topo
 * (os inputs) e o cálculo por baixo; os pressupostos de avaliação vivem na
 * Valuation, onde são usados.
 */

/** Quantos anos de histórico se mostram ao lado das projeções. */
const ANOS_HIST_SCHEDULES = 5

export type ContextoSeparador = {
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
  onDriver: (d: Driver, ano: number, v: number) => void
  onDriverSerie: (d: Driver, valores: number[]) => void
  onSegmentoSerie: (nome: string, valores: number[]) => void
  onModoReceita: (modo: "total" | "segmentos") => void
  onAvaliacao: (patch: Partial<PressupostosAvaliacao>) => void
}

const FORMATO_DRIVER: Record<Driver, Formato> = {
  crescimentoReceita: "pct", margemBruta: "pct", margemEbit: "pct", daPctReceita: "pct",
  capexPctReceita: "pct", dso: "dias", dio: "dias", dpo: "dias", taxaImposto: "pct",
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

// ─── Assumptions de um schedule ────────────────────────────────────────────

type Caminho = "linear" | "constant" | "custom"

/** Que forma tem a série: constante, linha reta do ano 1 ao último, ou editada à mão. */
function caminhoDe(v: number[]): Caminho {
  const n = v.length
  const tol = (x: number) => Math.abs(x) * 1e-9 + 1e-12
  if (v.every((x) => Math.abs(x - v[0]) <= tol(v[0]))) return "constant"
  const linear = v.every((x, i) => Math.abs(x - (v[0] + ((v[n - 1] - v[0]) * i) / (n - 1))) <= tol(x) + 1e-9)
  return linear ? "linear" : "custom"
}
function linha(de: number, ate: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (n === 1 ? ate : de + ((ate - de) * i) / (n - 1)))
}

export type LinhaInput = {
  chave: string
  rotulo: string
  formato: Formato
  valores: number[]
  iniciais?: number[] | null
  /** Valores de referência (histórico), um por coluna de referência. */
  refs: (number | null)[]
  refsFormato?: Formato
  onSerie: (v: number[]) => void
}

/**
 * A tabela de assumptions de um schedule: por linha, as referências
 * históricas, o Year 1, o Final year e o caminho entre os dois. "By year"
 * abre a linha para afinar anos específicos.
 */
function TabelaAssumptions({ linhas, cabecalhosRefs, anos }: { linhas: LinhaInput[]; cabecalhosRefs: string[]; anos: number[] }) {
  const t = useTranslations("dcfModelo")
  const { fmt } = useFormatos()
  const [aberto, setAberto] = React.useState<string | null>(null)
  const n = anos.length
  const colunas = 5 + cabecalhosRefs.length
  return (
    <div className="overflow-x-auto rounded-xl border border-primary/20 bg-primary/[0.03]">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-primary">{t("schedules.assumptions")}</th>
            {cabecalhosRefs.map((h) => <th key={h} className="px-3 py-2 text-right font-medium">{h}</th>)}
            <th className="px-3 py-2 text-right font-semibold text-primary">{t("pressupostos.ano1", { ano: anos[0] })}</th>
            <th className="px-3 py-2 text-right font-semibold text-primary">{t("pressupostos.anoFinal", { ano: anos[n - 1] })}</th>
            <th className="px-3 py-2 text-left font-medium">{t("pressupostos.caminho")}</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const v = l.valores
            const cam = caminhoDe(v)
            const eIniciais = l.iniciais && l.iniciais.length === v.length && l.iniciais.every((x, i) => x === v[i])
            const mudarY1 = (x: number) => l.onSerie(cam === "constant" ? v.map(() => x) : linha(x, v[n - 1], n))
            const mudarFinal = (x: number) => l.onSerie(linha(v[0], x, n))
            return (
              <React.Fragment key={l.chave}>
                <tr className="border-b border-border/30">
                  <td className="px-3 py-1.5 font-medium">{l.rotulo}</td>
                  {l.refs.map((r, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(r, l.refsFormato ?? l.formato)}</td>)}
                  <td className="px-2 py-1 text-right"><CelulaEditavel valor={v[0]} formato={l.formato} rotulo={`${l.rotulo} Y1`} onMudar={mudarY1} /></td>
                  <td className="px-2 py-1 text-right">
                    {cam === "constant"
                      ? <button type="button" onClick={() => mudarFinal(v[0])} className="w-full rounded-md px-2 py-1 text-right text-sm tabular-nums text-muted-foreground hover:bg-muted/50" title={t("pressupostos.igualY1Ajuda")}>= Y1</button>
                      : <CelulaEditavel valor={v[n - 1]} formato={l.formato} rotulo={`${l.rotulo} final`} onMudar={mudarFinal} />}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {(["constant", "linear"] as const).map((k) => (
                        <button key={k} type="button"
                          onClick={() => l.onSerie(k === "constant" ? v.map(() => v[0]) : linha(v[0], v[n - 1], n))}
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${cam === k ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>
                          {t(`pressupostos.caminhos.${k}`)}
                        </button>
                      ))}
                      {cam === "custom" && (eIniciais
                        ? <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary" title={t("pressupostos.consensoAjuda")}>{t("pressupostos.caminhos.consenso")}</span>
                        : <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400" title={t("pressupostos.customAjuda")}>{t("pressupostos.caminhos.custom")}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setAberto(aberto === l.chave ? null : l.chave)} className="rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10">
                      {aberto === l.chave ? "▾" : "▸"} {t("pressupostos.porAno")}
                    </button>
                    {l.iniciais && (
                      <button type="button" onClick={() => l.onSerie([...l.iniciais!])} className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/50" title={t("pressupostos.reporDriverAjuda")}>↺</button>
                    )}
                  </td>
                </tr>
                {aberto === l.chave && (
                  <tr className="border-b border-border/30 bg-muted/10">
                    <td colSpan={colunas} className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {v.map((x, i) => (
                          <label key={i} className="flex w-20 flex-col gap-1 text-xs text-muted-foreground">
                            <span className="text-center">{anos[i]}E</span>
                            <CelulaEditavel valor={x} formato={l.formato} rotulo={`${l.rotulo} ${anos[i]}`} onMudar={(val) => l.onSerie(v.map((y, j) => (j === i ? val : y)))} />
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Linhas de assumptions para drivers "normais" (com Last FY e 3Y avg). */
function linhasDrivers(c: ContextoSeparador, drivers: Driver[], rotulo: (d: Driver) => string): LinhaInput[] {
  return drivers.map((d) => {
    const r = resumo(c.racios, d, 3)
    return {
      chave: d, rotulo: rotulo(d), formato: FORMATO_DRIVER[d], valores: c.pressupostos.drivers[d],
      iniciais: c.iniciais?.drivers[d] ?? null, refs: [r.ultimo, r.media], onSerie: (v) => c.onDriverSerie(d, v),
    }
  })
}

// ─── 1. Historicals ──────────────────────────────────────────────────────────

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
function cagrEntre(ini: number | null | undefined, fim: number | null | undefined, anos: number): number | null {
  return ini && fim && ini > 0 && fim > 0 && anos > 0 ? Math.pow(fim / ini, 1 / anos) - 1 : null
}

function RevenueBuild({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const p = c.pressupostos
  const rs = p.receitaSegmentos ?? null
  const modo = rs ? p.modoReceita ?? "total" : "total"
  const h = ultimos(c.historico, 6)
  const r = ultimos(c.racios, 6)
  const anosH = h.map((a) => a.fiscalYear)
  const anosP = anosProj(c)
  const pr = c.projecoes
  const ult = c.historico[c.historico.length - 1]

  // Crescimento implícito no consenso, para os anos projetados que o têm.
  const consenso = anosP.map((fy, i) => {
    const e = c.estimativas.find((x) => x.fiscalYear === fy)
    const antes = i === 0 ? { revenueAvg: ult.revenue ?? 0 } : c.estimativas.find((x) => x.fiscalYear === fy - 1)
    return e && antes && antes.revenueAvg > 0 ? e.revenueAvg / antes.revenueAvg - 1 : null
  })
  const crescimentoProj = pr.map((x, i) => (i === 0 ? (ult.revenue ? x.receita / ult.revenue - 1 : null) : x.receita / pr[i - 1].receita - 1))

  const eixo = rs?.eixo
  const segHist = (nome: string) => h.map((a) => (eixo ? a.segmentos?.[eixo]?.[nome] ?? null : null))
  const nomes = rs?.segmentos.map((s) => s.nome) ?? []

  const seletor = rs ? (
    <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
      {(["total", "segmentos"] as const).map((m) => (
        <button key={m} type="button" onClick={() => c.onModoReceita(m)}
          className={`rounded-md px-3 py-1 text-xs font-semibold ${modo === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          {m === "total" ? t("receita.modoTotal") : t(`receita.modoSegmentos.${rs.eixo}`)}
        </button>
      ))}
    </div>
  ) : null

  // Receita por segmento: histórico sempre visível (é o que diz o que cresce);
  // projeção só no modo por segmento.
  const tabelaSegmentos: LinhaTabela[] = rs ? [
    ...nomes.map((nome) => ({
      rotulo: nome, formato: "m" as const, hist: segHist(nome),
      proj: modo === "segmentos" ? pr.map((x) => x.segmentos?.[nome] ?? null) : undefined,
    })),
    {
      rotulo: t("receita.outros"), formato: "m" as const, nota: t("receita.outrosNota"),
      hist: h.map((a) => {
        const m = eixo ? a.segmentos?.[eixo] : null
        return m && a.revenue !== null ? a.revenue - Object.values(m).reduce((s, v) => s + v, 0) : null
      }),
      proj: modo === "segmentos" ? pr.map((x) => (x.segmentos ? x.receita - Object.values(x.segmentos).reduce((s, v) => s + v, 0) : null)) : undefined,
    },
    { rotulo: t("linhas.receita"), formato: "m" as const, hist: h.map((a) => a.revenue), proj: pr.map((x) => x.receita), subtotal: true, destaque: true },
    { rotulo: t("drivers.crescimentoReceita"), formato: "pct" as const, hist: r.map((x) => x.crescimentoReceita), proj: crescimentoProj },
    { rotulo: t("receita.consenso"), formato: "pct" as const, proj: consenso },
  ] : []

  const crescimentoSeg: LinhaTabela[] = rs ? nomes.map((nome) => {
    const s = segHist(nome)
    return {
      rotulo: nome, formato: "pct" as const,
      hist: s.map((v, i) => (i > 0 && v !== null && s[i - 1] ? v / (s[i - 1] as number) - 1 : null)),
      proj: modo === "segmentos" ? rs.segmentos.find((x) => x.nome === nome)!.crescimento : undefined,
      driver: modo === "segmentos" ? ("crescimentoReceita" as Driver) : undefined,
    }
  }) : []

  const inputsSegmentos: LinhaInput[] = rs && modo === "segmentos" ? rs.segmentos.map((s) => {
    const serie = c.historico.map((a) => (eixo ? a.segmentos?.[eixo]?.[s.nome] ?? null : null))
    const fim = serie[serie.length - 1]
    const somaUlt = eixo && ult.segmentos?.[eixo] ? Object.values(ult.segmentos[eixo]!).reduce((a, b) => a + b, 0) : 0
    const ini = c.iniciais?.receitaSegmentos?.segmentos.find((x) => x.nome === s.nome)?.crescimento ?? null
    return {
      chave: `seg:${s.nome}`, rotulo: s.nome, formato: "pct" as const, valores: s.crescimento, iniciais: ini,
      refs: [cagrEntre(serie[serie.length - 4], fim, 3), cagrEntre(serie[serie.length - 6], fim, 5), somaUlt > 0 && fim ? fim / somaUlt : null],
      onSerie: (v: number[]) => c.onSegmentoSerie(s.nome, v),
    }
  }) : []

  return (
    <Cartao titulo={t("seccoes.receita")} acao={seletor}>
      <p className="text-sm text-muted-foreground">{modo === "segmentos" ? t("receita.segmentosAjuda") : t("schedules.receitaAjuda")}</p>
      {modo === "total" ? (
        <TabelaAssumptions anos={anosP} cabecalhosRefs={[t("pressupostos.ultimoAno"), t("pressupostos.media3Col")]}
          linhas={linhasDrivers(c, ["crescimentoReceita"], (d) => t(`drivers.${d}`))} />
      ) : (
        <TabelaAssumptions anos={anosP} cabecalhosRefs={[t("receita.cagr3"), t("receita.cagr5"), t("receita.mix")]} linhas={inputsSegmentos} />
      )}
      {rs ? (
        <>
          <p className="pt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("receita.receitaSegmentos")}</p>
          <TabelaModelo anosHist={anosH} anosProj={modo === "segmentos" ? anosP : anosP} linhas={tabelaSegmentos} unidade={t("unidade")} />
          <p className="pt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("receita.crescimentoSegmentos")}</p>
          <TabelaModelo anosHist={anosH} anosProj={modo === "segmentos" ? anosP : []} linhas={crescimentoSeg} unidade="YoY" />
        </>
      ) : (
        <>
          <TabelaModelo anosHist={anosH} anosProj={anosP} unidade={t("unidade")} linhas={[
            { rotulo: t("drivers.crescimentoReceita"), formato: "pct", driver: "crescimentoReceita", hist: r.map((x) => x.crescimentoReceita), proj: p.drivers.crescimentoReceita },
            { rotulo: t("linhas.receita"), formato: "m", hist: h.map((a) => a.revenue), proj: pr.map((x) => x.receita), destaque: true },
            { rotulo: t("receita.consenso"), formato: "pct", proj: consenso },
          ]} />
          <p className="text-xs text-muted-foreground">{t("receita.semSegmentos")}</p>
        </>
      )}
    </Cartao>
  )
}

export function SeparadorSchedules({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const h = ultimos(c.historico, ANOS_HIST_SCHEDULES)
  const r = ultimos(c.racios, ANOS_HIST_SCHEDULES)
  const pr = c.projecoes
  const d = c.pressupostos.drivers
  const anosH = h.map((a) => a.fiscalYear)
  const anosP = anosProj(c)
  const col = <K extends keyof AnoHistorico>(k: K) => h.map((a) => a[k] as number | null)
  const nwcHist = h.map((a) => (a.accountsReceivable ?? 0) + (a.inventory ?? 0) - (a.accountsPayable ?? 0))
  const refs = [t("pressupostos.ultimoAno"), t("pressupostos.media3Col")]
  const rot = (x: Driver) => t(`drivers.${x}`)

  const blocos: Array<{ titulo: string; ajuda: string; drivers: Driver[]; linhas: LinhaTabela[] }> = [
    {
      titulo: t("seccoes.custos"), ajuda: t("schedules.custosAjuda"), drivers: ["margemBruta", "margemEbit"],
      linhas: [
        { rotulo: t("drivers.margemBruta"), formato: "pct", driver: "margemBruta", hist: r.map((x) => x.margemBruta), proj: d.margemBruta },
        { rotulo: t("linhas.custoVendas"), formato: "m", hist: col("costOfRevenue"), proj: pr.map((p) => p.cogs) },
        { rotulo: t("linhas.lucroBruto"), formato: "m", hist: col("grossProfit"), proj: pr.map((p) => p.lucroBruto) },
        { rotulo: t("drivers.margemEbit"), formato: "pct", driver: "margemEbit", hist: r.map((x) => x.margemEbit), proj: d.margemEbit },
        { rotulo: t("linhas.ebit"), formato: "m", hist: col("operatingIncome"), proj: pr.map((p) => p.ebit), destaque: true },
      ],
    },
    {
      titulo: t("seccoes.capexDa"), ajuda: t("schedules.capexAjuda"), drivers: ["capexPctReceita", "daPctReceita"],
      linhas: [
        { rotulo: t("drivers.capexPctReceita"), formato: "pct", driver: "capexPctReceita", hist: r.map((x) => x.capexPctReceita), proj: d.capexPctReceita },
        { rotulo: t("linhas.capex"), formato: "m", hist: col("capex"), proj: pr.map((p) => p.capex) },
        { rotulo: t("drivers.daPctReceita"), formato: "pct", driver: "daPctReceita", hist: r.map((x) => x.daPctReceita), proj: d.daPctReceita },
        { rotulo: t("linhas.da"), formato: "m", hist: col("depreciationAndAmortization"), proj: pr.map((p) => p.da) },
        { rotulo: t("linhas.capexLiquido"), formato: "m", hist: h.map((a) => (a.capex !== null && a.depreciationAndAmortization !== null ? a.capex - a.depreciationAndAmortization : null)), proj: pr.map((p) => p.capex - p.da), nota: t("linhas.capexLiquidoNota") },
      ],
    },
    {
      titulo: t("seccoes.fundoManeio"), ajuda: t("schedules.fundoManeioAjuda"), drivers: ["dso", "dio", "dpo"],
      linhas: [
        { rotulo: t("drivers.dso"), formato: "dias", driver: "dso", hist: r.map((x) => x.dso), proj: d.dso },
        { rotulo: t("linhas.clientes"), formato: "m", hist: col("accountsReceivable"), proj: pr.map((p) => p.clientes) },
        { rotulo: t("drivers.dio"), formato: "dias", driver: "dio", hist: r.map((x) => x.dio), proj: d.dio },
        { rotulo: t("linhas.inventario"), formato: "m", hist: col("inventory"), proj: pr.map((p) => p.inventario) },
        { rotulo: t("drivers.dpo"), formato: "dias", driver: "dpo", hist: r.map((x) => x.dpo), proj: d.dpo },
        { rotulo: t("linhas.fornecedores"), formato: "m", hist: col("accountsPayable"), proj: pr.map((p) => p.fornecedores) },
        { rotulo: t("linhas.fundoManeio"), formato: "m", hist: nwcHist, proj: pr.map((p) => p.fundoManeio), subtotal: true },
        { rotulo: t("linhas.varFundoManeio"), formato: "m", hist: nwcHist.map((v, i) => (i === 0 ? null : v - nwcHist[i - 1])), proj: pr.map((p) => p.variacaoFundoManeio), destaque: true },
      ],
    },
    {
      titulo: t("seccoes.impostos"), ajuda: t("schedules.impostosAjuda"), drivers: ["taxaImposto"],
      linhas: [
        { rotulo: t("drivers.taxaImposto"), formato: "pct", driver: "taxaImposto", hist: r.map((x) => x.taxaImposto), proj: d.taxaImposto },
        { rotulo: t("linhas.impostosOperacionais"), formato: "m", proj: pr.map((p) => p.impostosOperacionais) },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      <RevenueBuild c={c} />
      {blocos.map((b) => (
        <Cartao key={b.titulo} titulo={b.titulo}>
          <p className="text-sm text-muted-foreground">{b.ajuda}</p>
          <TabelaAssumptions anos={anosP} cabecalhosRefs={refs} linhas={linhasDrivers(c, b.drivers, rot)} />
          <TabelaModelo anosHist={anosH} anosProj={anosP} linhas={b.linhas} unidade={t("unidade")} />
        </Cartao>
      ))}
    </div>
  )
}

// ─── 3. Projections ──────────────────────────────────────────────────────────

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
 * EV/EBITDA histórico, ao lado do exit multiple: a que múltiplos a empresa
 * negociou nos últimos 10 anos, para escolher o de saída com contexto.
 */
function HistoricoMultiplo({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const { fmt } = useFormatos()
  const a = c.pressupostos.avaliacao
  const dados = c.multiplosHistoricos.filter((x) => x.evEbitda !== null && x.evEbitda > 0 && x.evEbitda < 200)
  if (dados.length === 0) return null
  const vals = dados.map((x) => x.evEbitda as number).sort((x, y) => x - y)
  const m = Math.floor(vals.length / 2)
  const mediana = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2
  const grafico = [
    ...dados.map((x) => ({ ano: String(x.fiscalYear), v: x.evEbitda as number, atual: false })),
    ...(c.evEbitdaAtual ? [{ ano: "TTM", v: c.evEbitdaAtual, atual: true }] : []),
  ]
  const usar = (v: number) => c.onAvaliacao({ multiploSaida: Math.round(v * 10) / 10 })
  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{t("multiplo.titulo")}</p>
        <p className="text-xs text-muted-foreground">
          {t("multiplo.resumo", { atual: fmt(c.evEbitdaAtual, "x"), mediana: fmt(mediana, "x"), min: fmt(vals[0], "x"), max: fmt(vals[vals.length - 1], "x") })}
        </p>
      </div>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={grafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="ano" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={36} tickFormatter={(v: number) => `${Math.round(v)}x`} />
            <Tooltip formatter={(v) => [fmt(Number(v), "x"), "EV/EBITDA"]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
            <ReferenceLine y={a.multiploSaida} stroke="var(--primary)" strokeDasharray="4 4" label={{ value: t("multiplo.saida", { x: fmt(a.multiploSaida, "x") }), position: "insideTopRight", fill: "var(--primary)", fontSize: 11 }} />
            <Bar dataKey="v" radius={[4, 4, 0, 0]}>
              {grafico.map((x) => <Cell key={x.ano} fill={x.atual ? "var(--primary)" : "var(--muted-foreground)"} fillOpacity={x.atual ? 0.9 : 0.35} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => usar(mediana)} className="rounded-md border border-border/60 px-2.5 py-1 text-primary hover:bg-primary/10">{t("multiplo.usarMediana", { x: fmt(mediana, "x") })}</button>
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
