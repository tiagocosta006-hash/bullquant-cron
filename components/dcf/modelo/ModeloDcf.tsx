"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Search, Loader2, RotateCcw, AlertTriangle } from "lucide-react"
import { useDebounce } from "@/hooks/useDebounce"
import {
  racios, projetar, avaliar, fracaoAno1, anosAteFimAno1, pressupostosIniciais, mudarHorizonte,
  cenariosIniciais, derivarCenario, mudarHorizonteCenarios, NOMES_CENARIOS, PROBABILIDADES_POR_OMISSAO,
  type ConjuntoCenarios, type NomeCenario, type AnoHistorico, type Driver, type EstimativaModelo, type ContextoMercado, type Pressupostos,
  type PressupostosAvaliacao, type Mercado,
} from "@/lib/finance/modelo"
import {
  SeparadorHistorico, SeparadorProjecoes, SeparadorAvaliacao,
  type ContextoSeparador,
} from "./Separadores"
import { SeparadorSchedules } from "./Schedules"
import { SeparadorSensibilidade } from "./Sensibilidade"
import { useFormatos } from "./TabelaModelo"

/**
 * Modelo DCF completo, organizado como um modelo FMVA:
 * Pressupostos → Histórico → Schedules → Projeções → Avaliação.
 *
 * Os cálculos correm no cliente (lib/finance/modelo); o servidor só entrega
 * os dados (/api/dcf/modelo/[ticker]). Os pressupostos que o analista muda
 * ficam guardados neste browser, por empresa, até se reporem.
 */

type Dados = {
  empresa: { ticker: string; nome: string; setor: string | null; industria: string | null; logoUrl: string | null; financeira: boolean }
  historico: AnoHistorico[]
  multiplosHistoricos?: Array<{ fiscalYear: number; evEbitda: number | null }>
  estimativas: EstimativaModelo[]
  mercado: { preco: number | null; acoes: number | null; dividaTotal: number; caixa: number; interessesMinoritarios: number; dataBalanco: string | null }
  contexto: ContextoMercado & { dataRf: string | null }
}

type SearchResult = { ticker: string; name: string }

const SEPARADORES = ["historico", "schedules", "projecoes", "avaliacao", "sensibilidade"] as const
type Separador = (typeof SEPARADORES)[number]

// v2: os três cenários. v1 (um só conjunto de pressupostos) passa a ser o Base.
const chaveRascunho = (ticker: string) => `bv-dcf-modelo:v2:${ticker}`
const chaveV1 = (ticker: string) => `bv-dcf-modelo:v1:${ticker}`
const chaveProbV1 = (ticker: string) => `bv-dcf-cenarios:v1:${ticker}`

function lerRascunho(ticker: string): ConjuntoCenarios | null {
  try {
    const v2 = localStorage.getItem(chaveRascunho(ticker))
    if (v2) return JSON.parse(v2) as ConjuntoCenarios
    const v1 = localStorage.getItem(chaveV1(ticker))
    if (!v1) return null
    const conjunto = cenariosIniciais(JSON.parse(v1) as Pressupostos)
    const prob = JSON.parse(localStorage.getItem(chaveProbV1(ticker)) ?? "null") as Record<NomeCenario, number> | null
    return prob ? { ...conjunto, probabilidades: { ...PROBABILIDADES_POR_OMISSAO, ...prob } } : conjunto
  } catch {
    return null
  }
}
function gravarRascunho(ticker: string, c: ConjuntoCenarios | null) {
  try {
    if (c) localStorage.setItem(chaveRascunho(ticker), JSON.stringify(c))
    else localStorage.removeItem(chaveRascunho(ticker))
    localStorage.removeItem(chaveV1(ticker))
    localStorage.removeItem(chaveProbV1(ticker))
  } catch { /* modo privado: o rascunho só não fica guardado */ }
}

/** Rascunhos de antes do Revenue Build por segmento não têm segmentos: recebem os iniciais. */
function completar(p: Pressupostos, ini: Pressupostos): Pressupostos {
  return { ...p, receitaSegmentos: p.receitaSegmentos ?? mudarHorizonte(ini, p.anos).receitaSegmentos, modoReceita: p.modoReceita ?? "total" }
}

const COR_CENARIO: Record<NomeCenario, string> = {
  bear: "bg-bear text-white",
  base: "bg-primary text-primary-foreground",
  bull: "bg-bull text-white",
}

export function ModeloDcf({ defaultTicker, locked = false }: { defaultTicker?: string; locked?: boolean }) {
  const t = useTranslations("dcfModelo")
  const { fmt } = useFormatos()
  const [dados, setDados] = React.useState<Dados | null>(null)
  const [conjunto, setConjunto] = React.useState<ConjuntoCenarios | null>(null)
  const [iniciaisConjunto, setIniciaisConjunto] = React.useState<ConjuntoCenarios | null>(null)
  const cenario: NomeCenario = conjunto?.ativo ?? "base"
  const pressupostos = conjunto?.cenarios[cenario] ?? null
  const iniciais = iniciaisConjunto?.cenarios[cenario] ?? null
  const [aba, setAba] = React.useState<Separador>("schedules")
  const [carregando, setCarregando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [comRascunho, setComRascunho] = React.useState(false)

  // Pesquisa
  const [query, setQuery] = React.useState("")
  const [resultados, setResultados] = React.useState<SearchResult[]>([])
  const debounced = useDebounce(query, 300)
  React.useEffect(() => {
    if (locked || debounced.length < 2) { setResultados([]); return }
    let vivo = true
    fetch(`/api/search?empresas=1&q=${encodeURIComponent(debounced)}`)
      .then((r) => r.json())
      .then((d) => { if (vivo) setResultados(Array.isArray(d) ? d.slice(0, 8) : []) })
      .catch(() => vivo && setResultados([]))
    return () => { vivo = false }
  }, [debounced, locked])

  const carregar = React.useCallback(async (ticker: string) => {
    setQuery(""); setResultados([]); setErro(null); setCarregando(true)
    try {
      const r = await fetch(`/api/dcf/modelo/${encodeURIComponent(ticker)}`)
      if (!r.ok) { setErro(r.status === 404 ? t("erros.naoEncontrada") : t("erros.carregar")); setDados(null); return }
      const d = (await r.json()) as Dados
      setDados(d)
      const ini = pressupostosIniciais(d.historico, racios(d.historico), d.estimativas, d.contexto)
      setIniciaisConjunto(cenariosIniciais(ini))
      const rasc = lerRascunho(d.empresa.ticker)
      const junto: ConjuntoCenarios = rasc
        ? {
            ...rasc,
            cenarios: {
              bear: completar(rasc.cenarios.bear, ini),
              base: completar(rasc.cenarios.base, ini),
              bull: completar(rasc.cenarios.bull, ini),
            },
          }
        : cenariosIniciais(ini)
      setConjunto(junto)
      setComRascunho(!!rasc)
      setAba("schedules")
    } catch {
      setErro(t("erros.carregar"))
    } finally {
      setCarregando(false)
    }
  }, [t])

  React.useEffect(() => { if (defaultTicker) carregar(defaultTicker) }, [defaultTicker, carregar])

  const atualizarConjunto = (fn: (c: ConjuntoCenarios) => ConjuntoCenarios) => {
    setConjunto((c) => {
      if (!c || !dados) return c
      const novo = fn(c)
      gravarRascunho(dados.empresa.ticker, novo)
      setComRascunho(true)
      return novo
    })
  }
  // Os Schedules e a Valuation editam o cenário ativo.
  const atualizar = (fn: (p: Pressupostos) => Pressupostos) =>
    atualizarConjunto((c) => ({ ...c, cenarios: { ...c.cenarios, [c.ativo]: fn(c.cenarios[c.ativo]) } }))
  const mudarCenario = (ativo: NomeCenario) => setConjunto((c) => {
    if (!c || !dados) return c
    const novo = { ...c, ativo }
    gravarRascunho(dados.empresa.ticker, novo)
    return novo
  })
  const onProbabilidade = (nome: NomeCenario, v: number) =>
    atualizarConjunto((c) => ({ ...c, probabilidades: { ...c.probabilidades, [nome]: v } }))
  /** Recomeça o Bear ou o Bull a partir do Base atual. */
  const derivarDoBase = (nome: NomeCenario) =>
    atualizarConjunto((c) => ({ ...c, cenarios: { ...c.cenarios, [nome]: derivarCenario(c.cenarios.base, nome) } }))
  const onDriver = (d: Driver, i: number, v: number) =>
    atualizar((p) => ({ ...p, drivers: { ...p.drivers, [d]: p.drivers[d].map((x, j) => (j === i ? v : x)) } }))
  const onDriverSerie = (d: Driver, valores: number[]) =>
    atualizar((p) => ({ ...p, drivers: { ...p.drivers, [d]: valores } }))
  const onSegmentoSerie = (nome: string, valores: number[]) =>
    atualizar((p) => p.receitaSegmentos
      ? { ...p, receitaSegmentos: { ...p.receitaSegmentos, segmentos: p.receitaSegmentos.segmentos.map((s) => (s.nome === nome ? { ...s, crescimento: valores } : s)) } }
      : p)
  const onModoReceita = (modoReceita: "total" | "segmentos") => atualizar((p) => ({ ...p, modoReceita }))
  const onAvaliacao = (patch: Partial<PressupostosAvaliacao>) =>
    atualizar((p) => ({ ...p, avaliacao: { ...p.avaliacao, ...patch } }))
  const repor = () => {
    if (!dados || !iniciaisConjunto) return
    gravarRascunho(dados.empresa.ticker, null)
    setConjunto(iniciaisConjunto)
    setComRascunho(false)
  }

  const calculo = React.useMemo(() => {
    if (!dados || !pressupostos || dados.historico.length === 0) return null
    const hist = dados.historico
    const rs = racios(hist)
    const base = hist[hist.length - 1]
    const mercado: Mercado = {
      preco: dados.mercado.preco ?? 0,
      acoes: dados.mercado.acoes ?? 0,
      dividaTotal: dados.mercado.dividaTotal,
      caixa: dados.mercado.caixa,
      interessesMinoritarios: dados.mercado.interessesMinoritarios,
    }
    // Os fluxos até à data do balanço já estão na caixa e na dívida da ponte:
    // conta-se só o resto do ano 1. O desconto conta a partir de hoje.
    const dataBalanco = dados.mercado.dataBalanco ? new Date(dados.mercado.dataBalanco + "T00:00:00Z") : new Date()
    const f = fracaoAno1(base.periodEnd, dataBalanco)
    const d0 = anosAteFimAno1(base.periodEnd)
    const proj = projetar(base, pressupostos)
    const { projecoes, avaliacao } = avaliar(proj, pressupostos.avaliacao, mercado, f, d0)
    return { hist, rs, mercado, f, d0, projecoes, avaliacao }
  }, [dados, pressupostos])

  const contexto: ContextoSeparador | null = calculo && pressupostos ? {
    ticker: dados?.empresa.ticker ?? "", historico: calculo.hist, racios: calculo.rs, pressupostos, iniciais, projecoes: calculo.projecoes,
    avaliacao: calculo.avaliacao, mercado: calculo.mercado, estimativas: dados?.estimativas ?? [], multiplosHistoricos: dados?.multiplosHistoricos ?? [], evEbitdaAtual: dados?.contexto.evEbitdaAtual ?? null, fracaoAno1: calculo.f, anosAteFimAno1: calculo.d0,
    onDriver, onDriverSerie, onSegmentoSerie, onModoReceita, onAvaliacao,
    cenario, conjunto: conjunto!, onProbabilidade, derivarDoBase,
  } : null

  return (
    <div className="space-y-6">
      {/* Cabeçalho: pesquisa + empresa + resultado */}
      {/* overflow-visible: o .glass corta o conteúdo, e cortava a lista da pesquisa. */}
      <div className="glass relative z-30 overflow-visible rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {!locked && (
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("pesquisa")}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
              {resultados.length > 0 && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-[#FBFAF7] shadow-2xl dark:bg-[#1A1917]">
                  {resultados.map((r) => (
                    <button key={r.ticker} type="button" onClick={() => carregar(r.ticker)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60">
                      <span className="w-14 font-semibold text-primary">{r.ticker}</span>
                      <span className="truncate text-muted-foreground">{r.name}</span>
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
              {calculo?.avaliacao.valido && (
                <div className="flex items-center gap-6 text-sm">
                  <div><p className="text-xs text-muted-foreground">{t("avaliacao.valorPorAcao")}{cenario !== "base" && <span className={`ml-1.5 rounded px-1 py-px text-[10px] font-semibold ${COR_CENARIO[cenario]}`}>{t(`cenario.nomes.${cenario}`)}</span>}</p><p className="text-xl font-bold text-primary tabular-nums">${fmt(calculo.avaliacao.valorPorAcao, "anos")}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("avaliacao.preco")}</p><p className="text-xl font-bold tabular-nums">${fmt(calculo.avaliacao.preco, "anos")}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("avaliacao.potencial")}</p><p className={`text-xl font-bold tabular-nums ${calculo.avaliacao.potencial >= 0 ? "text-bull" : "text-bear"}`}>{calculo.avaliacao.potencial >= 0 ? "+" : ""}{fmt(calculo.avaliacao.potencial, "pct")}</p></div>
                </div>
              )}
            </div>
          )}
        </div>
        {erro && <p className="flex items-center gap-2 text-sm text-bear"><AlertTriangle className="h-4 w-4" />{erro}</p>}
        {!dados && !carregando && !erro && resultados.length === 0 && <p className="text-sm text-muted-foreground">{t("vazio")}</p>}
      </div>

      {dados?.empresa.financeira && (
        <div className="glass flex items-start gap-3 rounded-xl p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p>{t("erros.financeira")}</p>
        </div>
      )}

      {contexto && pressupostos && !dados?.empresa.financeira && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 rounded-xl border border-border/50 bg-muted/40 p-1">
              {SEPARADORES.map((s, i) => (
                <button key={s} type="button" onClick={() => setAba(s)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${aba === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <span className="mr-1.5 text-primary/70">{i + 1}</span>{t(`tabs.${s}`)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2" title={t("cenario.ajuda")}>
                <span className="text-muted-foreground">{t("cenario.rotulo")}</span>
                <div className="flex gap-0.5 rounded-lg border border-border/50 bg-muted/40 p-0.5">
                  {NOMES_CENARIOS.map((n) => (
                    <button key={n} type="button" onClick={() => mudarCenario(n)}
                      className={`rounded-md px-2.5 py-1 font-semibold transition-all ${cenario === n ? COR_CENARIO[n] : "text-muted-foreground hover:text-foreground"}`}>
                      {t(`cenario.nomes.${n}`)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">{t("horizonte")}</span>
                <select value={pressupostos.anos} onChange={(e) => atualizarConjunto((c) => mudarHorizonteCenarios(c, Number(e.target.value)))}
                  className="rounded-md border border-border bg-background px-2 py-1">
                  {[5, 7, 10].map((n) => <option key={n} value={n}>{t("anos", { n })}</option>)}
                </select>
              </label>
              {comRascunho && (
                <button type="button" onClick={repor} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground" title={t("reporAjuda")}>
                  <RotateCcw className="h-3.5 w-3.5" />{t("repor")}
                </button>
              )}
            </div>
          </div>
          {aba === "historico" && <SeparadorHistorico c={contexto} />}
          {aba === "schedules" && <SeparadorSchedules c={contexto} />}
          {aba === "projecoes" && <SeparadorProjecoes c={contexto} />}
          {aba === "avaliacao" && <SeparadorAvaliacao c={contexto} />}
          {aba === "sensibilidade" && <SeparadorSensibilidade key={contexto.ticker} c={contexto} />}

          <p className="text-xs text-muted-foreground">
            {t("fontes", {
              balanco: dados?.mercado.dataBalanco ?? "N/A",
              rf: dados?.contexto.dataRf ?? "N/A",
              n: dados?.estimativas.length ?? 0,
            })}
          </p>
        </>
      )}
    </div>
  )
}
