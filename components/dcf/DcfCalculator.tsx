"use client"

import * as React from "react"
import { Search, Loader2, Wand2, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useDebounce } from "@/hooks/useDebounce"
import { runDcf, solveReverseDcf, type DcfInputs } from "@/lib/finance/dcf"
import { computeWacc, type WaccBreakdown } from "@/lib/finance/wacc"
import { DcfResults } from "./DcfResults"
import { Slider } from "./Slider"
import { SavedAnalyses, type SavedAnalysis } from "./SavedAnalyses"
import { WaccBreakdownCard } from "./WaccBreakdown"

type SearchResult = {
  ticker: string
  name: string
  exchange: string
  logoUrl: string | null
}

type FcfSourceRecord = {
  fiscalYear: number
  operatingCashFlow: number | null
  capex: number | null
  interestExpense: number | null
  taxExpense: number | null
  operatingIncome: number | null
}

type DcfDataResponse = {
  ticker: string
  name: string
  currency: string
  fcfe0: number | null
  fcff0: number | null
  effectiveTaxRate: number
  shares: number | null
  netDebt: number | null
  totalDebt: number | null
  interestExpense: number | null
  currentPrice: number | null
  beta: number | null
  suggestedGrowth: number | null
  annualFcfSeries: FcfSourceRecord[]
}

const MILLION = 1_000_000

// Estado da UI: taxas em percentagem (10 = 10%), valores grandes em milhões.
const DEFAULTS = {
  currentPrice: 0,
  fcf0M: 0,
  sharesM: 0,
  netDebtM: 0,
  growth1: 10,
  growth2: 5,
  wacc: 10,
  terminalGrowth: 2.5,
}

export function DcfCalculator() {
  const t = useTranslations("dcf")

  // --- estado dos inputs ---
  const [currency, setCurrency] = React.useState("$")
  const [loadedName, setLoadedName] = React.useState<string | null>(null)
  const [loadedTicker, setLoadedTicker] = React.useState<string | null>(null)
  const [currentPrice, setCurrentPrice] = React.useState(DEFAULTS.currentPrice)
  const [fcf0M, setFcf0M] = React.useState(DEFAULTS.fcf0M)
  const [sharesM, setSharesM] = React.useState(DEFAULTS.sharesM)
  const [netDebtM, setNetDebtM] = React.useState(DEFAULTS.netDebtM)
  const [growth1, setGrowth1] = React.useState(DEFAULTS.growth1)
  const [growth2, setGrowth2] = React.useState(DEFAULTS.growth2)
  const [wacc, setWacc] = React.useState(DEFAULTS.wacc)
  const [terminalGrowth, setTerminalGrowth] = React.useState(DEFAULTS.terminalGrowth)
  const [fcfMode, setFcfMode] = React.useState<"FCFF" | "FCFE">("FCFF")
  const [annualFcfSeries, setAnnualFcfSeries] = React.useState<FcfSourceRecord[]>([])
  const [beta, setBeta] = React.useState<number | null>(null)
  const [waccBreakdown, setWaccBreakdown] = React.useState<WaccBreakdown | null>(null)

  // --- autopreencher (pesquisa) ---
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const [isLoadingData, setIsLoadingData] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 300)

  React.useEffect(() => {
    const fetchResults = async () => {
      if (debouncedQuery.length < 2) {
        setResults([])
        setIsOpen(false)
        return
      }
      setIsSearching(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
        setIsOpen(true)
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }
    fetchResults()
  }, [debouncedQuery])

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = async (ticker: string) => {
    setQuery("")
    setResults([])
    setIsOpen(false)
    setLoadError(null)
    setIsLoadingData(true)
    try {
      const res = await fetch(`/api/dcf-data/${ticker}`)
      if (!res.ok) {
        setLoadError(t("loadError"))
        return
      }
      const data: DcfDataResponse = await res.json()
      setCurrency(data.currency === "EUR" ? "€" : "$")
      setLoadedName(data.name)
      setLoadedTicker(ticker.toUpperCase())
      setAnnualFcfSeries(data.annualFcfSeries)
      setFcfMode("FCFF") // default, pode ser alterado depois
      if (data.currentPrice != null) {
        setCurrentPrice(round2(data.currentPrice))
      } else {
        setCurrentPrice(DEFAULTS.currentPrice)
      }
      
      // Usar fcff0 (com fallback fcfe0 se FCFF derivado for nulo)
      const baseFcf = data.fcff0 ?? data.fcfe0
      if (baseFcf != null) {
        setFcf0M(round2(baseFcf / MILLION))
      } else {
        setFcf0M(DEFAULTS.fcf0M)
      }
      
      if (data.shares != null) {
        setSharesM(round2(data.shares / MILLION))
      } else {
        setSharesM(DEFAULTS.sharesM)
      }
      
      if (data.netDebt != null) {
        setNetDebtM(round2(data.netDebt / MILLION))
      } else {
        setNetDebtM(DEFAULTS.netDebtM)
      }
      
      if (data.suggestedGrowth != null) {
        const g = round2(data.suggestedGrowth * 100)
        setGrowth1(g)
        setGrowth2(round2(g / 2))
      } else {
        setGrowth1(DEFAULTS.growth1)
        setGrowth2(DEFAULTS.growth2)
      }

      setTerminalGrowth(DEFAULTS.terminalGrowth)

      // Calcular WACC via CAPM se temos beta
      setBeta(data.beta)
      if (data.beta != null && data.currentPrice != null && data.shares != null) {
        const breakdown = computeWacc({
          beta: data.beta,
          currentPrice: data.currentPrice,
          shares: data.shares,
          netDebt: data.netDebt ?? 0,
          totalDebt: data.totalDebt,
          interestExpense: data.interestExpense,
          effectiveTaxRate: data.effectiveTaxRate,
        })
        setWaccBreakdown(breakdown)
        if (breakdown) {
          setWacc(round2(breakdown.wacc * 100))
        } else {
          setWacc(DEFAULTS.wacc)
        }
      } else {
        setWaccBreakdown(null)
        setWacc(DEFAULTS.wacc)
      }
    } catch {
      setLoadError(t("loadError"))
    } finally {
      setIsLoadingData(false)
    }
  }

  // --- cálculo reativo ---
  const result = React.useMemo(() => {
    const inputs: DcfInputs = {
      fcf0: fcf0M * MILLION,
      growthStage1: growth1 / 100,
      growthStage2: growth2 / 100,
      wacc: wacc / 100,
      terminalGrowth: terminalGrowth / 100,
      shares: sharesM * MILLION,
      netDebt: netDebtM * MILLION,
      currentPrice,
      mode: fcfMode,
    }
    return runDcf(inputs)
  }, [fcf0M, growth1, growth2, wacc, terminalGrowth, sharesM, netDebtM, currentPrice, fcfMode])

  // Valores atuais a guardar (unidades absolutas / decimais).
  const currentForSave = React.useMemo(() => {
    if (!result.valid) return null
    return {
      inputs: {
        fcf0: fcf0M * MILLION,
        growthStage1: growth1 / 100,
        growthStage2: growth2 / 100,
        wacc: wacc / 100,
        terminalGrowth: terminalGrowth / 100,
        shares: sharesM * MILLION,
        netDebt: netDebtM * MILLION,
        fcfMode,
      },
      fairValue: result.fairValue,
      currentPrice,
      marginOfSafety: result.marginOfSafety,
    }
  }, [result, fcf0M, growth1, growth2, wacc, terminalGrowth, sharesM, netDebtM, currentPrice, fcfMode])

  // Aplicar uma análise guardada de volta aos inputs.
  const handleLoadSaved = (a: SavedAnalysis) => {
    setFcf0M(round2(a.fcf0 / MILLION))
    setSharesM(round2(a.shares / MILLION))
    setNetDebtM(round2(a.netDebt / MILLION))
    setGrowth1(round2(a.growthStage1 * 100))
    setGrowth2(round2(a.growthStage2 * 100))
    setWacc(round2(a.wacc * 100))
    setTerminalGrowth(round2(a.terminalGrowth * 100))
    setFcfMode(a.fcfMode ?? "FCFF")
    if (a.priceAtSave != null) setCurrentPrice(round2(a.priceAtSave))
  }

  // Resolver Crescimento Implícito (Reverse DCF)
  const handleReverseDcf = () => {
    if (currentPrice <= 0 || fcf0M <= 0 || sharesM <= 0) return
    const implied = solveReverseDcf(
      {
        fcf0: fcf0M * MILLION,
        wacc: wacc / 100,
        terminalGrowth: terminalGrowth / 100,
        shares: sharesM * MILLION,
        netDebt: netDebtM * MILLION,
        currentPrice,
      },
      // Limites do slider growth1 (a restrição vinculativa: growth2 = growth1/2
      // fica sempre dentro do seu próprio range -10/20 quando growth1 respeita -10/30).
      { minGrowth: -0.10, maxGrowth: 0.30 }
    )
    if (implied) {
      setGrowth1(round2(implied.impliedGrowth1 * 100))
      setGrowth2(round2(implied.impliedGrowth2 * 100))
    }
  }

  const handleUseWacc = (suggestedWacc: number) => {
    setWacc(round2(suggestedWacc * 100))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Painel esquerdo: inputs ── */}
      <Card className="p-6 gap-0 space-y-5">
        {/* Autopreencher */}
        <div ref={wrapperRef} className="relative z-20">
          <label className="text-sm font-medium text-foreground mb-2 block">{t("autofillLabel")}</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("autofillPlaceholder")}
              className="pl-10 bg-input/30 border-input/30"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (e.target.value.length >= 2) setIsOpen(true)
              }}
            />
            {(isSearching || isLoadingData) && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {isOpen && results.length > 0 && (
            <div className="absolute top-full mt-2 w-full bg-popover border border-border/50 rounded-xl shadow-lg overflow-hidden z-50 backdrop-blur-xl">
              <ul className="max-h-[260px] overflow-y-auto py-2">
                {results.map((c) => (
                  <li key={c.ticker}>
                    <button
                      type="button"
                      onClick={() => handleSelect(c.ticker)}
                      className="w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-foreground">{c.ticker}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{c.name}</div>
                      </div>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                        {c.exchange}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {loadedTicker && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <span className="text-xs font-bold text-primary">{loadedTicker}</span>
            <span className="text-xs text-muted-foreground truncate">{loadedName}</span>
          </div>
        )}
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        {/* Inputs numéricos */}
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label={t("currentPriceInput")}
            value={currentPrice}
            onChange={setCurrentPrice}
            step={0.01}
            suffix={currency}
          />
          <NumberField
            label={t("fcf0")}
            value={fcf0M}
            onChange={setFcf0M}
            step={1}
            suffix={t("millionsSuffix")}
          />
          <NumberField
            label={t("shares")}
            value={sharesM}
            onChange={setSharesM}
            step={1}
            suffix={t("millionsSuffix")}
          />
          <NumberField
            label={t("netDebt")}
            value={netDebtM}
            onChange={setNetDebtM}
            step={1}
            suffix={t("millionsSuffix")}
          />
        </div>

        {/* Toggle FCFF/FCFE */}
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1 cursor-help">
                <span className="text-xs font-medium text-muted-foreground">{t("fcfMode") || "FCF Base"}:</span>
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                <p className="font-semibold mb-1">Qual a diferença?</p>
                <p className="mb-1"><span className="font-semibold text-primary">FCFF (Free Cash Flow to Firm):</span> Dinheiro disponível para acionistas e credores (descontado ao WACC).</p>
                <p><span className="font-semibold text-primary">FCFE (Free Cash Flow to Equity):</span> Dinheiro disponível apenas para os acionistas após pagamento de juros (descontado ao Custo do Capital Próprio).</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
            {["FCFF", "FCFE"].map((mode) => (
              <button
                key={mode}
                onClick={() => setFcfMode(mode as "FCFF" | "FCFE")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  fcfMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-5 pt-2">
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={handleReverseDcf} className="h-8 text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-all">
              <Wand2 className="w-3 h-3 mr-2" />
              {t("reverseDcf") || "Calculate Implied Growth (Reverse DCF)"}
            </Button>
          </div>
          <Slider
            label={t("growth1")}
            value={growth1}
            onChange={setGrowth1}
            min={-10}
            max={30}
            step={0.5}
            display={(v) => `${v.toFixed(1)}%`}
          />
          <Slider
            label={t("growth2")}
            value={growth2}
            onChange={setGrowth2}
            min={-10}
            max={20}
            step={0.5}
            display={(v) => `${v.toFixed(1)}%`}
          />
          <Slider
            label={t("wacc.label")}
            value={wacc}
            onChange={setWacc}
            min={4}
            max={15}
            step={0.25}
            display={(v) => `${v.toFixed(2)}%`}
            hint={t("wacc.hint")}
          />
          <Slider
            label={t("terminalGrowth")}
            value={terminalGrowth}
            onChange={setTerminalGrowth}
            min={0}
            max={4}
            step={0.1}
            display={(v) => `${v.toFixed(1)}%`}
            hint={t("terminalGrowthHint")}
          />
        </div>
      </Card>

      {/* ── Painel direito: resultados ── */}
      <div className="space-y-4 lg:sticky lg:top-6 self-start">
        <DcfResults result={result} currency={currency} mode={fcfMode} />
        <WaccBreakdownCard breakdown={waccBreakdown} fcfMode={fcfMode} onUseWacc={handleUseWacc} />
        <SavedAnalyses
          ticker={loadedTicker}
          currency={currency}
          current={currentForSave}
          canSave={result.valid && loadedTicker !== null}
          onLoad={handleLoadSaved}
        />
        <p className="text-xs text-muted-foreground leading-relaxed px-1">{t("disclaimer")}</p>
      </div>
    </div>
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function NumberField({
  label,
  value,
  onChange,
  step,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step: number
  suffix?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
        <span>{label}</span>
        {suffix && <span className="text-muted-foreground/60">{suffix}</span>}
      </label>
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="bg-input/30 border-input/30 tabular-nums"
      />
    </div>
  )
}
