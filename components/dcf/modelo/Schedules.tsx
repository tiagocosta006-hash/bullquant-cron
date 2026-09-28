"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { ChevronDown, ChevronRight, Info, X, Pencil } from "lucide-react"
import { ComposedChart, Bar, Line, Scatter, ErrorBar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import type { Driver } from "@/lib/finance/modelo"
import { CelulaEditavel, useFormatos, type Formato } from "./TabelaModelo"
import type { ContextoSeparador } from "./Separadores"

/**
 * Schedules do modelo avançado, compactos.
 *
 * Princípio: as tabelas só se leem; os inputs vivem num painel lateral que
 * abre ao clicar numa linha azul (a "barra de fórmulas" do Excel). O painel
 * junta os controlos (Year 1, Final year, Path, ano a ano) com os dados para
 * decidir: gráfico de 10 anos, estatísticas, consenso dos analistas e o
 * contexto próprio de cada pressuposto — sempre que esses dados existem.
 */

const ANOS_HIST = 5

const FORMATO_DRIVER: Record<Driver, Formato> = {
  crescimentoReceita: "pct", margemBruta: "pct", margemEbit: "pct", daPctReceita: "pct",
  capexPctReceita: "pct", dso: "dias", dio: "dias", dpo: "dias", taxaImposto: "pct",
}

export type Alvo = { tipo: "driver"; d: Driver } | { tipo: "segmento"; nome: string }
const chaveAlvo = (a: Alvo) => (a.tipo === "driver" ? a.d : `seg:${a.nome}`)

type Linha = {
  rotulo: string
  formato: Formato
  hist?: (number | null)[]
  proj?: (number | null)[]
  /** Linha de input (azul, clicável): o alvo que o painel abre. */
  alvo?: Alvo
  subtotal?: boolean
  destaque?: boolean
  /** Linha de consenso dos analistas (itálico, discreta). */
  consenso?: boolean
}

// ─── Utilitários ───────────────────────────────────────────────────────────

const ultimos = <T,>(arr: T[], n: number) => arr.slice(-n)
function cagr(ini: number | null | undefined, fim: number | null | undefined, anos: number): number | null {
  return ini && fim && ini > 0 && fim > 0 && anos > 0 ? Math.pow(fim / ini, 1 / anos) - 1 : null
}
function estat(v: (number | null)[]) {
  const x = v.filter((y): y is number => y !== null && Number.isFinite(y))
  if (!x.length) return null
  const ord = [...x].sort((a, b) => a - b)
  const m = Math.floor(ord.length / 2)
  const media = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  return {
    ultimo: v[v.length - 1] ?? null,
    media3: media(x.slice(-3)),
    media5: media(x.slice(-5)),
    mediana: ord.length % 2 ? ord[m] : (ord[m - 1] + ord[m]) / 2,
    min: ord[0],
    max: ord[ord.length - 1],
  }
}
type Caminho = "linear" | "constant" | "custom"
function caminhoDe(v: number[]): Caminho {
  const n = v.length
  const tol = (x: number) => Math.abs(x) * 1e-9 + 1e-12
  if (v.every((x) => Math.abs(x - v[0]) <= tol(v[0]))) return "constant"
  const linear = v.every((x, i) => Math.abs(x - (v[0] + ((v[n - 1] - v[0]) * i) / (n - 1))) <= tol(x) + 1e-9)
  return linear ? "linear" : "custom"
}
const linha = (de: number, ate: number, n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? ate : de + ((ate - de) * i) / (n - 1)))

// ─── Peças de layout ───────────────────────────────────────────────────────

function Seccao({ titulo, resumo, ajuda, aberta, onToggle, acao, children }: {
  titulo: string; resumo: string; ajuda: string; aberta: boolean; onToggle: () => void; acao?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="border-b border-border/60 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 py-2.5">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left">
          {aberta ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-semibold">{titulo}</span>
        </button>
        <span className="text-xs tabular-nums text-muted-foreground">{resumo}</span>
        <span title={ajuda} className="cursor-help text-muted-foreground/60 hover:text-muted-foreground"><Info className="h-3.5 w-3.5" /></span>
        <div className="ml-auto">{acao}</div>
      </div>
      {aberta && <div className="space-y-3 pb-4">{children}</div>}
    </section>
  )
}

function TabelaSchedule({ anosHist, anosProj, linhas, selecionado, onSelecionar, unidade }: {
  anosHist: number[]; anosProj: number[]; linhas: Linha[]; selecionado: string | null; onSelecionar: (a: Alvo) => void; unidade: string
}) {
  const { fmt } = useFormatos()
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-muted-foreground">
            <th className="sticky left-0 z-10 min-w-[190px] bg-background py-1.5 pr-3 text-left font-medium">{unidade}</th>
            {anosHist.map((a) => <th key={`h${a}`} className="px-2 py-1.5 text-right font-medium">{a}</th>)}
            {anosProj.map((a, i) => (
              <th key={`p${a}`} className={`px-2 py-1.5 text-right font-semibold text-primary ${i === 0 ? "border-l border-border/60" : ""}`}>{a}E</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, li) => {
            const k = l.alvo ? chaveAlvo(l.alvo) : null
            const ativo = k !== null && k === selecionado
            return (
              <tr key={li} className={`border-b border-border/25 ${l.subtotal ? "font-semibold" : ""} ${ativo ? "bg-primary/10" : l.alvo ? "hover:bg-primary/5" : ""}`}>
                <td className={`sticky left-0 z-10 whitespace-nowrap py-1 pr-3 ${ativo ? "bg-primary/10" : "bg-background"}`}>
                  {l.alvo ? (
                    <button type="button" onClick={() => onSelecionar(l.alvo!)} className="flex items-center gap-1.5 font-medium text-primary hover:underline">
                      <Pencil className="h-3 w-3 opacity-60" />{l.rotulo}
                    </button>
                  ) : (
                    <span className={l.consenso ? "italic text-muted-foreground" : l.destaque ? "font-semibold" : "text-muted-foreground"}>{l.rotulo}</span>
                  )}
                </td>
                {anosHist.map((a, i) => (
                  <td key={`h${a}`} className="px-2 py-1 text-right tabular-nums text-muted-foreground/80">{l.hist ? fmt(l.hist[i] ?? null, l.formato) : ""}</td>
                ))}
                {anosProj.map((a, i) => (
                  <td key={`p${a}`} className={`px-2 py-1 text-right tabular-nums ${i === 0 ? "border-l border-border/60" : ""} ${l.alvo ? "font-medium text-primary" : l.consenso ? "italic text-muted-foreground" : ""}`}>
                    {l.proj ? (l.proj[i] === null || l.proj[i] === undefined ? (l.consenso ? "" : "N/A") : fmt(l.proj[i] as number, l.formato)) : ""}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Consenso ──────────────────────────────────────────────────────────────

/** Crescimento e margens implícitos no consenso, por ano projetado. */
function consensoPorAno(c: ContextoSeparador) {
  const ult = c.historico[c.historico.length - 1]
  return c.projecoes.map((p, i) => {
    const e = c.estimativas.find((x) => x.fiscalYear === p.fiscalYear)
    if (!e) return null
    const antes = i === 0 ? ult.revenue ?? null : c.estimativas.find((x) => x.fiscalYear === p.fiscalYear - 1)?.revenueAvg ?? null
    const g = (v?: number) => (v && antes && antes > 0 ? v / antes - 1 : null)
    return {
      fiscalYear: p.fiscalYear,
      analistas: e.analistas,
      receita: e.revenueAvg,
      receitaLow: e.revenueLow ?? null,
      receitaHigh: e.revenueHigh ?? null,
      crescimento: g(e.revenueAvg),
      crescimentoLow: g(e.revenueLow),
      crescimentoHigh: g(e.revenueHigh),
      margemEbit: e.ebitAvg && e.revenueAvg > 0 ? e.ebitAvg / e.revenueAvg : null,
      margemEbitda: e.ebitdaAvg && e.revenueAvg > 0 ? e.ebitdaAvg / e.revenueAvg : null,
    }
  })
}

// ─── Painel da assumption ──────────────────────────────────────────────────

function Stat({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className="text-sm font-semibold tabular-nums">{valor}</p>
    </div>
  )
}

function PainelAssumption({ c, alvo, onFechar }: { c: ContextoSeparador; alvo: Alvo; onFechar: () => void }) {
  const t = useTranslations("dcfModelo")
  const { fmt } = useFormatos()
  const p = c.pressupostos
  const anos = c.projecoes.map((x) => x.fiscalYear)
  const n = anos.length
  const hist = c.historico
  const rs = p.receitaSegmentos

  // Série, histórico e controlos conforme o alvo.
  let rotulo: string, formato: Formato, valores: number[], iniciais: number[] | null, onSerie: (v: number[]) => void
  let histValores: (number | null)[]
  if (alvo.tipo === "driver") {
    rotulo = t(`drivers.${alvo.d}`); formato = FORMATO_DRIVER[alvo.d]
    valores = p.drivers[alvo.d]; iniciais = c.iniciais?.drivers[alvo.d] ?? null
    onSerie = (v) => c.onDriverSerie(alvo.d, v)
    histValores = c.racios.map((r) => r[alvo.d])
  } else {
    const seg = rs?.segmentos.find((s) => s.nome === alvo.nome)
    rotulo = alvo.nome; formato = "pct"
    valores = seg?.crescimento ?? []; iniciais = c.iniciais?.receitaSegmentos?.segmentos.find((s) => s.nome === alvo.nome)?.crescimento ?? null
    onSerie = (v) => c.onSegmentoSerie(alvo.nome, v)
    const serie = hist.map((a) => (rs ? a.segmentos?.[rs.eixo]?.[alvo.nome] ?? null : null))
    histValores = serie.map((v, i) => (i > 0 && v !== null && serie[i - 1] ? v / (serie[i - 1] as number) - 1 : null))
  }
  const st = estat(histValores)
  const cons = consensoPorAno(c)
  const consDriver = alvo.tipo === "driver" && (alvo.d === "crescimentoReceita" || alvo.d === "margemEbit")
    ? cons.map((x) => (x ? (alvo.d === "crescimentoReceita" ? { v: x.crescimento, low: x.crescimentoLow, high: x.crescimentoHigh, n: x.analistas } : { v: x.margemEbit, low: null, high: null, n: x.analistas }) : null))
    : null

  const escala = formato === "pct" ? 100 : 1
  const grafico = [
    ...hist.map((a, i) => ({ ano: String(a.fiscalYear), hist: histValores[i] !== null ? (histValores[i] as number) * escala : null })),
    ...anos.map((a, i) => {
      const cd = consDriver?.[i]
      const v = cd?.v ?? null
      return {
        ano: `${a}E`,
        proj: valores[i] * escala,
        cons: v !== null ? v * escala : null,
        consErro: v !== null && cd?.low != null && cd?.high != null ? [(v - cd.low) * escala, (cd.high - v) * escala] : undefined,
      }
    }),
  ]

  const comIntervalo = !!consDriver?.some((x) => x?.low != null)
  const cam = caminhoDe(valores)
  const mudarY1 = (x: number) => onSerie(cam === "constant" ? valores.map(() => x) : linha(x, valores[n - 1], n))
  const mudarFinal = (x: number) => onSerie(linha(valores[0], x, n))
  const eIniciais = iniciais && iniciais.every((x, i) => x === valores[i])

  // Contexto específico
  const extras: React.ReactNode[] = []
  if (alvo.tipo === "driver" && alvo.d === "crescimentoReceita" && rs) {
    const somaUlt = Object.values(hist[hist.length - 1].segmentos?.[rs.eixo] ?? {}).reduce((a, b) => a + b, 0)
    extras.push(
      <div key="seg">
        <p className="mb-1 text-xs font-semibold">{t("painel.segmentos")}</p>
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground"><th className="text-left font-medium">{t("receita.segmento")}</th><th className="text-right font-medium">{t("receita.cagr3")}</th><th className="text-right font-medium">{t("painel.ultimoYoY")}</th><th className="text-right font-medium">{t("receita.mix")}</th></tr></thead>
          <tbody>
            {rs.segmentos.map((s) => {
              const serie = hist.map((a) => a.segmentos?.[rs.eixo]?.[s.nome] ?? null)
              const fim = serie[serie.length - 1], ant = serie[serie.length - 2]
              return (
                <tr key={s.nome} className="border-t border-border/30">
                  <td className="max-w-[160px] truncate py-0.5" title={s.nome}>{s.nome}</td>
                  <td className="text-right tabular-nums">{fmt(cagr(serie[serie.length - 4], fim, 3), "pct")}</td>
                  <td className="text-right tabular-nums">{fmt(fim && ant ? fim / ant - 1 : null, "pct")}</td>
                  <td className="text-right tabular-nums">{fmt(fim && somaUlt ? fim / somaUlt : null, "pct")}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>,
    )
  }
  if (alvo.tipo === "driver" && alvo.d === "margemEbit") {
    const ebitda = cons.map((x) => x?.margemEbitda ?? null)
    if (ebitda.some((x) => x !== null)) {
      extras.push(<p key="ebitda" className="text-xs text-muted-foreground">{t("painel.margemEbitdaConsenso")}: {ebitda.map((x, i) => (x !== null ? `${anos[i]}E ${fmt(x, "pct")}` : null)).filter(Boolean).join(" · ")}</p>)
    }
    extras.push(<p key="aj" className="text-xs text-muted-foreground">{t("painel.ebitAjustado")}</p>)
  }
  if (alvo.tipo === "driver" && (alvo.d === "capexPctReceita" || alvo.d === "daPctReceita")) {
    const ratio = hist.map((a) => (a.capex && a.depreciationAndAmortization ? a.capex / a.depreciationAndAmortization : null))
    extras.push(<p key="cd" className="text-xs text-muted-foreground">{t("painel.capexDa")}: {ultimos(hist, 6).map((a, i) => `${a.fiscalYear} ${fmt(ultimos(ratio, 6)[i], "x")}`).join(" · ")}</p>)
  }
  if (alvo.tipo === "driver" && ["dso", "dio", "dpo"].includes(alvo.d)) {
    const nwc = hist.map((a) => (a.revenue ? ((a.accountsReceivable ?? 0) + (a.inventory ?? 0) - (a.accountsPayable ?? 0)) / a.revenue : null))
    extras.push(<p key="nwc" className="text-xs text-muted-foreground">{t("painel.nwc")}: {ultimos(hist, 6).map((a, i) => `${a.fiscalYear} ${fmt(ultimos(nwc, 6)[i], "pct")}`).join(" · ")}</p>)
  }
  if (alvo.tipo === "driver" && alvo.d === "taxaImposto") {
    extras.push(<p key="tax" className="text-xs text-muted-foreground">{t("painel.taxaLegal")}</p>)
  }
  if (alvo.tipo === "segmento" && rs) {
    const mix = hist.map((a) => {
      const m = a.segmentos?.[rs.eixo]
      const v = m?.[alvo.nome]
      const s = m ? Object.values(m).reduce((x, y) => x + y, 0) : 0
      return v && s ? v / s : null
    })
    extras.push(<p key="mix" className="text-xs text-muted-foreground">{t("painel.mixHistorico")}: {ultimos(hist, 6).map((a, i) => `${a.fiscalYear} ${fmt(ultimos(mix, 6)[i], "pct")}`).join(" · ")}</p>)
  }

  // Portal para o body: o cabeçalho e os cartões .glass criam contextos de
  // empilhamento próprios e tapavam o painel.
  return createPortal(
    <aside className="fixed right-0 top-0 z-[120] flex h-full w-full max-w-[440px] flex-col border-l border-border bg-[#FBFAF7] shadow-2xl dark:bg-[#1A1917]">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{t("painel.titulo")}</p>
          <p className="text-base font-semibold">{rotulo}</p>
        </div>
        <button type="button" onClick={onFechar} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground" aria-label={t("painel.fechar")}><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Controlos */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("pressupostos.ano1", { ano: anos[0] })}
              <CelulaEditavel valor={valores[0]} formato={formato} rotulo={`${rotulo} Y1`} onMudar={mudarY1} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("pressupostos.anoFinal", { ano: anos[n - 1] })}
              {cam === "constant"
                ? <button type="button" onClick={() => mudarFinal(valores[0])} className="rounded-md border border-dashed border-border px-2 py-1 text-right text-sm text-muted-foreground">= Y1</button>
                : <CelulaEditavel valor={valores[n - 1]} formato={formato} rotulo={`${rotulo} final`} onMudar={mudarFinal} />}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">{t("pressupostos.caminho")}</span>
            {(["constant", "linear"] as const).map((k) => (
              <button key={k} type="button" onClick={() => onSerie(k === "constant" ? valores.map(() => valores[0]) : linha(valores[0], valores[n - 1], n))}
                className={`rounded px-2 py-0.5 text-xs font-semibold ${cam === k ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"}`}>{t(`pressupostos.caminhos.${k}`)}</button>
            ))}
            {cam === "custom" && <span className={`rounded px-2 py-0.5 text-xs font-semibold ${eIniciais ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>{eIniciais ? t("pressupostos.caminhos.consenso") : t("pressupostos.caminhos.custom")}</span>}
            {iniciais && <button type="button" onClick={() => onSerie([...iniciais!])} className="ml-auto rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/60" title={t("pressupostos.reporDriverAjuda")}>↺ {t("repor")}</button>}
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-primary">{t("pressupostos.porAno")}</summary>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {valores.map((x, i) => (
                <label key={i} className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                  <span className="text-center">{anos[i]}E</span>
                  <CelulaEditavel valor={x} formato={formato} rotulo={`${rotulo} ${anos[i]}`} onMudar={(v) => onSerie(valores.map((y, j) => (j === i ? v : y)))} />
                </label>
              ))}
            </div>
          </details>
        </div>

        {/* Gráfico: histórico, projeção e consenso */}
        <div>
          <p className="mb-1 text-xs font-semibold">{t("painel.historicoProjecao")}</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={grafico} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="ano" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => (formato === "pct" ? `${Math.round(v)}%` : `${Math.round(v)}`)} />
                <Tooltip formatter={(v, nome) => [typeof v === "number" ? (formato === "pct" ? `${v.toFixed(1)}%` : v.toFixed(0)) : String(v), String(nome)]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 11 }} />
                <Bar dataKey="hist" name={t("painel.real")} fill="var(--muted-foreground)" fillOpacity={0.4} radius={[3, 3, 0, 0]} />
                <Line dataKey="proj" name={t("painel.tuaProjecao")} stroke="var(--primary)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                {consDriver && (
                  <Scatter dataKey="cons" name={t("painel.consenso")} fill="#2F6FAE">
                    <ErrorBar dataKey="consErro" width={4} stroke="#2F6FAE" direction="y" />
                  </Scatter>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Estatísticas */}
        {st && (
          <div className="grid grid-cols-3 gap-2">
            <Stat rotulo={t("pressupostos.ultimoAno")} valor={fmt(st.ultimo, formato)} />
            <Stat rotulo={t("painel.media3")} valor={fmt(st.media3, formato)} />
            <Stat rotulo={t("painel.media5")} valor={fmt(st.media5, formato)} />
            <Stat rotulo={t("painel.mediana10")} valor={fmt(st.mediana, formato)} />
            <Stat rotulo={t("painel.min")} valor={fmt(st.min, formato)} />
            <Stat rotulo={t("painel.max")} valor={fmt(st.max, formato)} />
          </div>
        )}

        {/* Consenso */}
        {consDriver && consDriver.some((x) => x && x.v !== null) && (
          <div>
            <p className="mb-1 text-xs font-semibold">{t("painel.consenso")}</p>
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground"><th className="text-left font-medium">FY</th>{comIntervalo && <th className="text-right font-medium">Low</th>}<th className="text-right font-medium">Avg</th>{comIntervalo && <th className="text-right font-medium">High</th>}<th className="text-right font-medium">{t("painel.analistas")}</th></tr></thead>
              <tbody>
                {consDriver.map((x, i) => x && x.v !== null ? (
                  <tr key={i} className="border-t border-border/30">
                    <td className="py-0.5">{anos[i]}E</td>
                    {comIntervalo && <td className="text-right tabular-nums">{fmt(x.low, formato)}</td>}
                    <td className="text-right font-semibold tabular-nums">{fmt(x.v, formato)}</td>
                    {comIntervalo && <td className="text-right tabular-nums">{fmt(x.high, formato)}</td>}
                    <td className="text-right tabular-nums text-muted-foreground">{x.n}</td>
                  </tr>
                ) : null)}
              </tbody>
            </table>
          </div>
        )}
        {extras.length > 0 && <div className="space-y-3">{extras}</div>}
      </div>
    </aside>,
    document.body,
  )
}

// ─── Gráfico do Revenue Build ──────────────────────────────────────────────

function GraficoReceita({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const cons = consensoPorAno(c)
  const dados = [
    ...c.historico.map((a) => ({ ano: String(a.fiscalYear), real: a.revenue !== null ? a.revenue / 1e9 : null })),
    ...c.projecoes.map((p, i) => {
      const x = cons[i]
      const v = x ? x.receita / 1e9 : null
      return {
        ano: `${p.fiscalYear}E`,
        proj: p.receita / 1e9,
        cons: v,
        consErro: v !== null && x?.receitaLow && x?.receitaHigh ? [v - x.receitaLow / 1e9, x.receitaHigh / 1e9 - v] : undefined,
      }
    }),
  ]
  const maxB = Math.max(0, ...dados.map((x) => ("proj" in x ? x.proj ?? 0 : x.real ?? 0)))
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="ano" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}T` : `$${maxB < 10 ? v.toFixed(1) : Math.round(v)}B`)} />
          <Tooltip formatter={(v, nome) => [typeof v === "number" ? `$${v.toFixed(1)}B` : String(v), String(nome)]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 11 }} />
          <Bar dataKey="real" name={t("painel.real")} fill="var(--muted-foreground)" fillOpacity={0.4} radius={[3, 3, 0, 0]} />
          <Bar dataKey="proj" name={t("painel.tuaProjecao")} fill="var(--primary)" fillOpacity={0.55} radius={[3, 3, 0, 0]} />
          <Scatter dataKey="cons" name={t("painel.consenso")} fill="#2F6FAE">
            <ErrorBar dataKey="consErro" width={4} stroke="#2F6FAE" direction="y" />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Separador ─────────────────────────────────────────────────────────────

export function SeparadorSchedules({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const { fmt } = useFormatos()
  const [alvo, setAlvo] = React.useState<Alvo | null>(null)
  const [fechadas, setFechadas] = React.useState<Set<string>>(new Set())
  React.useEffect(() => {
    if (!alvo) return
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) setAlvo(null) }
    window.addEventListener("keydown", tecla, true)
    return () => window.removeEventListener("keydown", tecla, true)
  }, [alvo])

  const p = c.pressupostos
  const d = p.drivers
  const pr = c.projecoes
  const h = ultimos(c.historico, ANOS_HIST)
  const r = ultimos(c.racios, ANOS_HIST)
  const anosH = h.map((a) => a.fiscalYear)
  const anosP = pr.map((x) => x.fiscalYear)
  const col = (k: "revenue" | "costOfRevenue" | "grossProfit" | "operatingIncome" | "capex" | "depreciationAndAmortization" | "accountsReceivable" | "inventory" | "accountsPayable") => h.map((a) => a[k])
  const ult = c.historico[c.historico.length - 1]
  const cons = consensoPorAno(c)
  const rs = p.receitaSegmentos ?? null
  const modo = rs ? p.modoReceita ?? "total" : "total"
  const sel = alvo ? chaveAlvo(alvo) : null
  const drv = (x: Driver): Alvo => ({ tipo: "driver", d: x })
  const toggle = (k: string) => setFechadas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const crescProj = pr.map((x, i) => (i === 0 ? (ult.revenue ? x.receita / ult.revenue - 1 : null) : x.receita / pr[i - 1].receita - 1))
  const nwcHist = h.map((a) => (a.accountsReceivable ?? 0) + (a.inventory ?? 0) - (a.accountsPayable ?? 0))
  const cagrProj = ult.revenue && pr.length ? Math.pow(pr[pr.length - 1].receita / ult.revenue, 1 / pr.length) - 1 : null
  const hist5 = c.historico.length >= 6 ? cagr(c.historico[c.historico.length - 6].revenue, ult.revenue, 5) : null

  // Revenue Build
  const eixo = rs?.eixo
  const segHist = (nome: string) => h.map((a) => (eixo ? a.segmentos?.[eixo]?.[nome] ?? null : null))
  // YoY sobre o histórico completo, para a primeira coluna visível ter o ano anterior.
  const segYoY = (nome: string) => {
    const tudo = c.historico.map((a) => (eixo ? a.segmentos?.[eixo]?.[nome] ?? null : null))
    return ultimos(tudo.map((v, i) => (i > 0 && v !== null && tudo[i - 1] ? v / (tudo[i - 1] as number) - 1 : null)), ANOS_HIST)
  }
  const linhasReceita: Linha[] = modo === "segmentos" && rs
    ? [
        ...rs.segmentos.map((s): Linha => ({ rotulo: s.nome, formato: "pct", alvo: { tipo: "segmento", nome: s.nome }, hist: segYoY(s.nome), proj: s.crescimento })),
        ...rs.segmentos.map((s): Linha => ({ rotulo: `${s.nome} ($M)`, formato: "m", hist: segHist(s.nome), proj: pr.map((x) => x.segmentos?.[s.nome] ?? null) })),
        { rotulo: t("linhas.receita"), formato: "m", hist: col("revenue"), proj: pr.map((x) => x.receita), subtotal: true },
        { rotulo: t("drivers.crescimentoReceita"), formato: "pct", hist: r.map((x) => x.crescimentoReceita), proj: crescProj },
        { rotulo: t("receita.consenso"), formato: "pct", proj: cons.map((x) => x?.crescimento ?? null), consenso: true },
      ]
    : [
        { rotulo: t("drivers.crescimentoReceita"), formato: "pct", alvo: drv("crescimentoReceita"), hist: r.map((x) => x.crescimentoReceita), proj: d.crescimentoReceita },
        { rotulo: t("receita.consenso"), formato: "pct", proj: cons.map((x) => x?.crescimento ?? null), consenso: true },
        { rotulo: t("linhas.receita"), formato: "m", hist: col("revenue"), proj: pr.map((x) => x.receita), subtotal: true },
        ...(rs ? rs.segmentos.map((s): Linha => ({ rotulo: s.nome, formato: "m", hist: segHist(s.nome) })) : []),
      ]

  const seletorReceita = rs ? (
    <div className="flex gap-0.5 rounded-md bg-muted/50 p-0.5">
      {(["total", "segmentos"] as const).map((m) => (
        <button key={m} type="button" onClick={() => c.onModoReceita(m)}
          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${modo === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
          {m === "total" ? t("receita.modoTotal") : t(`receita.modoSegmentos.${rs.eixo}`)}
        </button>
      ))}
    </div>
  ) : null

  const seccoes: Array<{ k: string; titulo: string; resumo: string; ajuda: string; acao?: React.ReactNode; topo?: React.ReactNode; linhas: Linha[] }> = [
    {
      k: "receita", titulo: t("seccoes.receita"), acao: seletorReceita,
      resumo: t("resumos.receita", { g: fmt(crescProj[0] ?? null, "pct"), ano: anosP[0], cagr: fmt(cagrProj, "pct"), hist: fmt(hist5, "pct") }),
      ajuda: modo === "segmentos" ? t("receita.segmentosAjuda") : t("schedules.receitaAjuda"),
      topo: <GraficoReceita c={c} />,
      linhas: linhasReceita,
    },
    {
      k: "custos", titulo: t("seccoes.custos"), ajuda: t("schedules.custosAjuda"),
      resumo: t("resumos.custos", { de: fmt(d.margemEbit[0], "pct"), ate: fmt(d.margemEbit[d.margemEbit.length - 1], "pct"), hist: fmt(r[r.length - 1]?.margemEbit ?? null, "pct") }),
      linhas: [
        { rotulo: t("drivers.margemBruta"), formato: "pct", alvo: drv("margemBruta"), hist: r.map((x) => x.margemBruta), proj: d.margemBruta },
        { rotulo: t("linhas.lucroBruto"), formato: "m", hist: col("grossProfit"), proj: pr.map((x) => x.lucroBruto) },
        { rotulo: t("drivers.margemEbit"), formato: "pct", alvo: drv("margemEbit"), hist: r.map((x) => x.margemEbit), proj: d.margemEbit },
        { rotulo: t("painel.consensoEbit"), formato: "pct", proj: cons.map((x) => x?.margemEbit ?? null), consenso: true },
        { rotulo: t("linhas.ebit"), formato: "m", hist: col("operatingIncome"), proj: pr.map((x) => x.ebit), subtotal: true },
      ],
    },
    {
      k: "capex", titulo: t("seccoes.capexDa"), ajuda: t("schedules.capexAjuda"),
      resumo: t("resumos.capex", { capex: fmt(d.capexPctReceita[0], "pct"), da: fmt(d.daPctReceita[0], "pct") }),
      linhas: [
        { rotulo: t("drivers.capexPctReceita"), formato: "pct", alvo: drv("capexPctReceita"), hist: r.map((x) => x.capexPctReceita), proj: d.capexPctReceita },
        { rotulo: t("linhas.capex"), formato: "m", hist: col("capex"), proj: pr.map((x) => x.capex) },
        { rotulo: t("drivers.daPctReceita"), formato: "pct", alvo: drv("daPctReceita"), hist: r.map((x) => x.daPctReceita), proj: d.daPctReceita },
        { rotulo: t("linhas.da"), formato: "m", hist: col("depreciationAndAmortization"), proj: pr.map((x) => x.da) },
      ],
    },
    {
      k: "wc", titulo: t("seccoes.fundoManeio"), ajuda: t("schedules.fundoManeioAjuda"),
      resumo: t("resumos.wc", { dso: fmt(d.dso[0], "dias"), dio: fmt(d.dio[0], "dias"), dpo: fmt(d.dpo[0], "dias") }),
      linhas: [
        { rotulo: t("drivers.dso"), formato: "dias", alvo: drv("dso"), hist: r.map((x) => x.dso), proj: d.dso },
        { rotulo: t("drivers.dio"), formato: "dias", alvo: drv("dio"), hist: r.map((x) => x.dio), proj: d.dio },
        { rotulo: t("drivers.dpo"), formato: "dias", alvo: drv("dpo"), hist: r.map((x) => x.dpo), proj: d.dpo },
        { rotulo: t("linhas.fundoManeio"), formato: "m", hist: nwcHist, proj: pr.map((x) => x.fundoManeio) },
        { rotulo: t("linhas.varFundoManeio"), formato: "m", hist: nwcHist.map((v, i) => (i === 0 ? null : v - nwcHist[i - 1])), proj: pr.map((x) => x.variacaoFundoManeio), subtotal: true },
      ],
    },
    {
      k: "tax", titulo: t("seccoes.impostos"), ajuda: t("schedules.impostosAjuda"),
      resumo: t("resumos.tax", { t: fmt(d.taxaImposto[0], "pct") }),
      linhas: [
        { rotulo: t("drivers.taxaImposto"), formato: "pct", alvo: drv("taxaImposto"), hist: r.map((x) => x.taxaImposto), proj: d.taxaImposto },
        { rotulo: t("linhas.impostosOperacionais"), formato: "m", proj: pr.map((x) => x.impostosOperacionais) },
      ],
    },
  ]

  return (
    <div className="glass rounded-xl px-5 py-2">
      <p className="border-b border-border/60 py-2 text-xs text-muted-foreground">{t("schedules.inputsNotaNova")}</p>
      {seccoes.map((s) => (
        <Seccao key={s.k} titulo={s.titulo} resumo={s.resumo} ajuda={s.ajuda} acao={s.acao} aberta={!fechadas.has(s.k)} onToggle={() => toggle(s.k)}>
          {s.topo}
          <TabelaSchedule anosHist={anosH} anosProj={anosP} linhas={s.linhas} selecionado={sel} onSelecionar={setAlvo} unidade={t("unidade")} />
        </Seccao>
      ))}
      {alvo && <PainelAssumption c={c} alvo={alvo} onFechar={() => setAlvo(null)} />}
    </div>
  )
}
