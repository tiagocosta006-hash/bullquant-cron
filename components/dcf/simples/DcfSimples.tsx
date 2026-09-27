"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { Search, Loader2, AlertTriangle, RotateCcw } from "lucide-react"
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { useDebounce } from "@/hooks/useDebounce"
import {
  calcularCenario, cenariosIniciais, cagr, mediana,
  type Cenario, type MetricaSimples, type ResultadoCenario,
} from "@/lib/finance/dcfSimples"

/**
 * DCF simples, estilo Qualtrim: por ação (FCF per share ou EPS), três
 * cenários, múltiplo de saída e retorno desejado. Os termos financeiros ficam
 * em inglês em todas as línguas (pedido do Costa); as explicações traduzem-se.
 */

type AnoHist = { fiscalYear: number; periodEnd: string; eps: number | null; fcfPerShare: number | null; preco: number | null; pe: number | null; pfcf: number | null }
type Dados = {
  empresa: { ticker: string; nome: string; setor: string | null; industria: string | null }
  preco: number | null
  historico: AnoHist[]
  ttm: { eps: number | null; fcfPerShare: number | null; pe: number | null; pfcf: number | null }
  consenso: { epsGrowth: number | null; revenueGrowth: number | null; analistas: number; anos: number }
}
type Cenarios = { bear: Cenario; base: Cenario; bull: Cenario }
type Estado = { metrica: MetricaSimples; anos: number; retorno: number; inicial: Record<MetricaSimples, number | null>; cenarios: Record<MetricaSimples, Cenarios> }

const CENARIOS = ["bear", "base", "bull"] as const
const COR: Record<(typeof CENARIOS)[number], string> = { bear: "#C2622D", base: "var(--primary)", bull: "#2F6FAE" }
const chave = (t: string) => `bv-dcf-simples:v1:${t}`

function useFmt() {
  const locale = useLocale()
  return React.useMemo(() => {
    const nf = (d: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d })
    const f1 = nf(1), f2 = nf(2)
    return {
      pct: (v: number | null | undefined, sinal = false) => (v == null || !Number.isFinite(v) ? "N/A" : `${sinal && v > 0 ? "+" : ""}${f1.format(v * 100)}%`),
      usd: (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "N/A" : `$${f2.format(v)}`),
      x: (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "N/A" : `${f1.format(v)}x`),
      num: (v: number, d = 2) => new Intl.NumberFormat(locale, { maximumFractionDigits: d, useGrouping: false }).format(v),
    }
  }, [locale])
}

/** Campo numérico que só altera o valor quando o texto muda de facto. */
function Campo({ valor, pct, onMudar, rotulo, largura = "w-24" }: { valor: number; pct?: boolean; onMudar: (v: number) => void; rotulo: string; largura?: string }) {
  const { num } = useFmt()
  const mostrar = React.useCallback((v: number) => num(pct ? v * 100 : v), [num, pct])
  const [texto, setTexto] = React.useState(mostrar(valor))
  React.useEffect(() => setTexto(mostrar(valor)), [valor, mostrar])
  return (
    <div className="flex items-center gap-1">
      <input
        aria-label={rotulo}
        value={texto}
        inputMode="decimal"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto === mostrar(valor)) return
          const v = Number(texto.replace(",", ".").replace(/[%x$\s]/g, ""))
          if (Number.isFinite(v)) onMudar(pct ? v / 100 : v)
          else setTexto(mostrar(valor))
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={`${largura} rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-primary outline-none focus:border-primary`}
      />
      {pct && <span className="text-xs text-muted-foreground">%</span>}
    </div>
  )
}

export function DcfSimples({ defaultTicker, locked = false }: { defaultTicker?: string; locked?: boolean }) {
  const t = useTranslations("dcfSimples")
  const f = useFmt()
  const [dados, setDados] = React.useState<Dados | null>(null)
  const [estado, setEstado] = React.useState<Estado | null>(null)
  const [iniciais, setIniciais] = React.useState<Estado | null>(null)
  const [carregando, setCarregando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [resultados, setResultados] = React.useState<Array<{ ticker: string; name: string }>>([])
  const debounced = useDebounce(query, 300)

  React.useEffect(() => {
    if (locked || debounced.length < 2) { setResultados([]); return }
    let vivo = true
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`).then((r) => r.json())
      .then((d) => vivo && setResultados(Array.isArray(d) ? d.slice(0, 8) : [])).catch(() => vivo && setResultados([]))
    return () => { vivo = false }
  }, [debounced, locked])

  const carregar = React.useCallback(async (ticker: string) => {
    setQuery(""); setResultados([]); setErro(null); setCarregando(true)
    try {
      const r = await fetch(`/api/dcf/simples/${encodeURIComponent(ticker)}`)
      if (!r.ok) { setErro(t("erros.carregar")); setDados(null); return }
      const d = (await r.json()) as Dados
      setDados(d)
      const ini = estadoInicial(d)
      setIniciais(ini)
      let rasc: Estado | null = null
      try { const s = localStorage.getItem(chave(d.empresa.ticker)); rasc = s ? JSON.parse(s) : null } catch { /* sem armazenamento */ }
      setEstado(rasc ?? ini)
    } catch {
      setErro(t("erros.carregar"))
    } finally {
      setCarregando(false)
    }
  }, [t])
  React.useEffect(() => { if (defaultTicker) carregar(defaultTicker) }, [defaultTicker, carregar])

  const mudar = (fn: (e: Estado) => Estado) => setEstado((e) => {
    if (!e || !dados) return e
    const n = fn(e)
    try { localStorage.setItem(chave(dados.empresa.ticker), JSON.stringify(n)) } catch { /* modo privado */ }
    return n
  })
  const repor = () => {
    if (!dados || !iniciais) return
    try { localStorage.removeItem(chave(dados.empresa.ticker)) } catch { /* */ }
    setEstado(iniciais)
  }

  const calc = React.useMemo(() => {
    if (!dados || !estado) return null
    const m = estado.metrica
    const valor = (a: AnoHist) => (m === "fcf" ? a.fcfPerShare : a.eps)
    const multiplo = (a: AnoHist) => (m === "fcf" ? a.pfcf : a.pe)
    const h = dados.historico
    const inicio = estado.inicial[m]
    const preco = dados.preco ?? 0
    const res = Object.fromEntries(
      CENARIOS.map((c) => [c, calcularCenario(inicio ?? 0, estado.cenarios[m][c], estado.anos, estado.retorno, preco)]),
    ) as Record<(typeof CENARIOS)[number], ResultadoCenario>
    const ult = h[h.length - 1]
    const ha = (n: number) => h[h.length - 1 - n] ?? null
    const mults = h.map(multiplo).filter((x): x is number => x !== null && x > 0 && x < 200)
    return {
      m, valor, multiplo, inicio, preco, res,
      cagr5: cagr(ha(5) ? valor(ha(5)!) : null, valor(ult), 5),
      cagr10: h.length >= 10 ? cagr(valor(h[0]), valor(ult), h.length - 1) : null,
      multMediano: mediana(mults),
      multMin: mults.length ? Math.min(...mults) : null,
      multMax: mults.length ? Math.max(...mults) : null,
      multAtual: m === "fcf" ? dados.ttm.pfcf : dados.ttm.pe,
    }
  }, [dados, estado])

  const grafico = React.useMemo(() => {
    if (!calc || !dados || !estado) return []
    const linhas: Array<Record<string, number | string | null>> = dados.historico.map((a) => ({ ano: String(a.fiscalYear), hist: calc.valor(a) }))
    const ultimoAno = dados.historico[dados.historico.length - 1].fiscalYear
    // Ponto de ligação: o valor inicial (TTM) no último ano real.
    if (linhas.length) Object.assign(linhas[linhas.length - 1], { bear: calc.inicio, base: calc.inicio, bull: calc.inicio })
    for (let i = 0; i < estado.anos; i++) {
      linhas.push({
        ano: `${ultimoAno + i + 1}E`,
        hist: null,
        bear: calc.res.bear.valido ? calc.res.bear.projecao[i] : null,
        base: calc.res.base.valido ? calc.res.base.projecao[i] : null,
        bull: calc.res.bull.valido ? calc.res.bull.projecao[i] : null,
      })
    }
    return linhas
  }, [calc, dados, estado])

  const nomeMetrica = estado?.metrica === "eps" ? t("t.eps") : t("t.fcfPerShare")
  const nomeMultiplo = estado?.metrica === "eps" ? t("t.pe") : t("t.pfcf")

  return (
    <div className="space-y-6">
      <div className="glass rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {!locked && (
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("pesquisa")}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
              {resultados.length > 0 && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
                  {resultados.map((r) => (
                    <button key={r.ticker} type="button" onClick={() => carregar(r.ticker)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60">
                      <span className="w-14 font-semibold text-primary">{r.ticker}</span><span className="truncate text-muted-foreground">{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {carregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {dados && (
            <div className="flex flex-1 flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-lg font-bold tracking-tight">{dados.empresa.nome} <span className="text-primary">{dados.empresa.ticker}</span></p>
                <p className="text-xs text-muted-foreground">{[dados.empresa.setor, dados.empresa.industria].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t("t.price")}</p>
                <p className="text-xl font-bold tabular-nums">{f.usd(dados.preco)}</p>
              </div>
            </div>
          )}
        </div>
        {erro && <p className="flex items-center gap-2 text-sm text-bear"><AlertTriangle className="h-4 w-4" />{erro}</p>}
        {!dados && !carregando && !erro && <p className="text-sm text-muted-foreground">{t("vazio")}</p>}
      </div>

      {dados && estado && calc && (
        <>
          {/* Controlos */}
          <div className="glass rounded-xl p-5 flex flex-wrap items-end gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("t.metric")}</span>
              <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                {(["fcf", "eps"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => mudar((e) => ({ ...e, metrica: m }))}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${estado.metrica === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                    {m === "fcf" ? t("t.fcfPerShare") : t("t.eps")}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("t.years")}</span>
              <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                {[5, 10].map((n) => (
                  <button key={n} type="button" onClick={() => mudar((e) => ({ ...e, anos: n }))}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${estado.anos === n ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>{n}</button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("t.starting", { m: nomeMetrica })}</span>
              <Campo valor={calc.inicio ?? 0} rotulo={t("t.starting", { m: nomeMetrica })} onMudar={(v) => mudar((e) => ({ ...e, inicial: { ...e.inicial, [e.metrica]: v } }))} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("t.desiredReturn")}</span>
              <Campo valor={estado.retorno} pct rotulo={t("t.desiredReturn")} onMudar={(v) => mudar((e) => ({ ...e, retorno: v }))} largura="w-20" />
            </label>
            <button type="button" onClick={repor} className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground" title={t("reporAjuda")}>
              <RotateCcw className="h-3.5 w-3.5" />{t("t.reset")}
            </button>
          </div>

          {!(calc.inicio && calc.inicio > 0) && (
            <div className="glass flex items-start gap-3 rounded-xl p-5 text-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <p>{t("erros.negativo", { metrica: nomeMetrica })}</p>
            </div>
          )}

          {/* Cenários */}
          <div className="glass rounded-xl p-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-2 text-left text-xs font-medium text-muted-foreground"></th>
                  {CENARIOS.map((c) => (
                    <th key={c} className="py-2 text-right text-sm font-bold" style={{ color: COR[c] }}>{t(`t.${c}`)}</th>
                  ))}
                  <th className="py-2 pl-6 text-left text-xs font-medium text-muted-foreground">{t("t.reference")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 pr-4 font-medium">{t("t.growth", { m: nomeMetrica })}<span className="block text-xs font-normal text-muted-foreground">{t("porAno", { n: estado.anos })}</span></td>
                  {CENARIOS.map((c) => (
                    <td key={c} className="py-2.5"><div className="flex justify-end">
                      <Campo valor={estado.cenarios[estado.metrica][c].crescimento} pct rotulo={`${c} growth`}
                        onMudar={(v) => mudar((e) => ({ ...e, cenarios: { ...e.cenarios, [e.metrica]: { ...e.cenarios[e.metrica], [c]: { ...e.cenarios[e.metrica][c], crescimento: v } } } }))} largura="w-20" />
                    </div></td>
                  ))}
                  <td className="py-2.5 pl-6 text-xs text-muted-foreground">
                    {t("t.refCagr", { c5: f.pct(calc.cagr5), c10: f.pct(calc.cagr10) })}<br />
                    {estado.metrica === "eps"
                      ? t("t.refConsensusEps", { g: f.pct(dados.consenso.epsGrowth) })
                      : t("t.refConsensusFcf", { g: f.pct(dados.consenso.epsGrowth), r: f.pct(dados.consenso.revenueGrowth) })}
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 pr-4 font-medium">{t("t.exitMultiple", { x: nomeMultiplo })}<span className="block text-xs font-normal text-muted-foreground">{t("anoSaida", { n: estado.anos })}</span></td>
                  {CENARIOS.map((c) => (
                    <td key={c} className="py-2.5"><div className="flex justify-end">
                      <Campo valor={estado.cenarios[estado.metrica][c].multiploSaida} rotulo={`${c} exit multiple`}
                        onMudar={(v) => mudar((e) => ({ ...e, cenarios: { ...e.cenarios, [e.metrica]: { ...e.cenarios[e.metrica], [c]: { ...e.cenarios[e.metrica][c], multiploSaida: v } } } }))} largura="w-20" />
                    </div></td>
                  ))}
                  <td className="py-2.5 pl-6 text-xs text-muted-foreground">
                    {t("t.refMultiple", { atual: f.x(calc.multAtual), med: f.x(calc.multMediano) })}<br />
                    {t("t.refRange", { min: f.x(calc.multMin), max: f.x(calc.multMax) })}
                  </td>
                </tr>
                {[
                  { r: t("t.futureMetric", { m: nomeMetrica, n: estado.anos }), v: (x: ResultadoCenario) => f.usd(x.metricaFutura) },
                  { r: t("t.futurePrice", { n: estado.anos }), v: (x: ResultadoCenario) => f.usd(x.precoFuturo) },
                ].map((l) => (
                  <tr key={l.r} className="border-b border-border/30">
                    <td className="py-2 pr-4 text-muted-foreground">{l.r}</td>
                    {CENARIOS.map((c) => <td key={c} className="py-2 text-right tabular-nums">{calc.res[c].valido ? l.v(calc.res[c]) : "N/A"}</td>)}
                    <td />
                  </tr>
                ))}
                <tr className="border-b border-border/30 bg-muted/20">
                  <td className="py-3 pr-4 font-semibold">{t("t.fairValue")}<span className="block text-xs font-normal text-muted-foreground">{t("fairValueAjuda", { r: f.pct(estado.retorno) })}</span></td>
                  {CENARIOS.map((c) => <td key={c} className="py-3 text-right text-lg font-bold tabular-nums" style={{ color: COR[c] }}>{calc.res[c].valido ? f.usd(calc.res[c].fairValue) : "N/A"}</td>)}
                  <td />
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2 pr-4 text-muted-foreground">{t("t.upside")}</td>
                  {CENARIOS.map((c) => <td key={c} className={`py-2 text-right font-semibold tabular-nums ${calc.res[c].potencial >= 0 ? "text-bull" : "text-bear"}`}>{calc.res[c].valido ? f.pct(calc.res[c].potencial, true) : "N/A"}</td>)}
                  <td />
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-semibold">{t("t.expectedCagr")}<span className="block text-xs font-normal text-muted-foreground">{t("cagrAjuda", { p: f.usd(calc.preco) })}</span></td>
                  {CENARIOS.map((c) => {
                    const x = calc.res[c]
                    return <td key={c} className={`py-3 text-right text-lg font-bold tabular-nums ${x.cagrEsperado >= estado.retorno ? "text-bull" : "text-bear"}`}>{x.valido ? f.pct(x.cagrEsperado) : "N/A"}</td>
                  })}
                  <td className="py-3 pl-6 text-xs text-muted-foreground">{t("cagrCor", { r: f.pct(estado.retorno) })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Gráfico */}
          <div className="glass rounded-xl p-5">
            <h3 className="mb-3 text-sm font-semibold">{t("t.chartTitle", { m: nomeMetrica })}</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={grafico} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="ano" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => `$${f.num(v, 1)}`} />
                  <Tooltip formatter={(v) => (typeof v === "number" ? f.usd(v) : String(v))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="hist" name={t("t.actual")} fill="var(--muted-foreground)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
                  {CENARIOS.map((c) => (
                    <Line key={c} dataKey={c} name={t(`t.${c}`)} stroke={COR[c]} strokeWidth={2.5} dot={false} connectNulls={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("graficoAjuda")}</p>
          </div>
        </>
      )}
    </div>
  )
}

function estadoInicial(d: Dados): Estado {
  const h = d.historico
  const ult = h[h.length - 1]
  const ha5 = h[h.length - 6] ?? null
  const mk = (m: MetricaSimples) => {
    const v = (a: AnoHist | null) => (a ? (m === "fcf" ? a.fcfPerShare : a.eps) : null)
    const mult = h.map((a) => (m === "fcf" ? a.pfcf : a.pe)).filter((x): x is number => x !== null && x > 0 && x < 200)
    return cenariosIniciais({
      // Para FCF por ação não há consenso de FCF: o de EPS é o melhor proxy.
      crescimentoConsenso: d.consenso.epsGrowth,
      crescimentoHistorico: cagr(v(ha5), v(ult), 5),
      multiploMediano: mediana(mult),
      multiploAtual: m === "fcf" ? d.ttm.pfcf : d.ttm.pe,
    })
  }
  return {
    metrica: "fcf",
    anos: 5,
    retorno: 0.1,
    inicial: { fcf: d.ttm.fcfPerShare ?? ult?.fcfPerShare ?? null, eps: d.ttm.eps ?? ult?.eps ?? null },
    cenarios: { fcf: mk("fcf"), eps: mk("eps") },
  }
}
