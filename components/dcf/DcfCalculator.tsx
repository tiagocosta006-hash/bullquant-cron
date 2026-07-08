"use client"

import * as React from "react"
import { Search, Loader2, Wand2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useDebounce } from "@/hooks/useDebounce"
import { runDcf, solveReverseDcf, type DcfInputs } from "@/lib/finance/dcf"
import { DcfResults } from "./DcfResults"
import { Slider } from "./Slider"
import { SavedAnalyses, type SavedAnalysis } from "./SavedAnalyses"

type SearchResult = {
  ticker: string
  name: string
  exchange: string
  logoUrl: string | null
}

type DcfDataResponse = {
  ticker: string
  name: string
  currency: string
  fcf0: number | null
  shares: number | null
  netDebt: number | null
  currentPrice: number | null
  suggestedGrowth: number | null
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
      if (data.currentPrice != null) setCurrentPrice(round2(data.currentPrice))
      if (data.fcf0 != null) setFcf0M(round2(data.fcf0 / MILLION))
      if (data.shares != null) setSharesM(round2(data.shares / MILLION))
      if (data.netDebt != null) setNetDebtM(round2(data.netDebt / MILLION))
      if (data.suggestedGrowth != null) {
        const g = round2(data.suggestedGrowth * 100)
        setGrowth1(g)
        setGrowth2(round2(g / 2))
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
    }
    return runDcf(inputs)
  }, [fcf0M, growth1, growth2, wacc, terminalGrowth, sharesM, netDebtM, currentPrice])

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
      },
      fairValue: result.fairValue,
      currentPrice,
      marginOfSafety: result.marginOfSafety,
    }
  }, [result, fcf0M, growth1, growth2, wacc, terminalGrowth, sharesM, netDebtM, currentPrice])

  // Aplicar uma análise guardada de volta aos inputs.
  const handleLoadSaved = (a: SavedAnalysis) => {
    setFcf0M(round2(a.fcf0 / MILLION))
    setSharesM(round2(a.shares / MILLION))
    setNetDebtM(round2(a.netDebt / MILLION))
    setGrowth1(round2(a.growthStage1 * 100))
    setGrowth2(round2(a.growthStage2 * 100))
    setWacc(round2(a.wacc * 100))
    setTerminalGrowth(round2(a.terminalGrowth * 100))
    if (a.priceAtSave != null) setCurrentPrice(round2(a.priceAtSave))
  }

  // Resolver Crescimento Implícito (Reverse DCF)
  const handleReverseDcf = () => {
    if (currentPrice <= 0 || fcf0M <= 0 || sharesM <= 0) return
    const implied = solveReverseDcf({
      fcf0: fcf0M * MILLION,
      wacc: wacc / 100,
      terminalGrowth: terminalGrowth / 100,
      shares: sharesM * MILLION,
      netDebt: netDebtM * MILLION,
      currentPrice,
    })
    if (implied) {
      setGrowth1(round2(implied.impliedGrowth1 * 100))
      setGrowth2(round2(implied.impliedGrowth2 * 100))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Painel esquerdo: inputs ── */}
      <Card className="p-6 gap-0 space-y-5">
        {/* Autopreencher */}
        <div ref={wrapperRef} className="relative">
          <label className="text-sm font-medium text-foreground mb-2 block">{t("autofillLabel")}</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("autofillPlaceholder")}
              className="pl-10 bg-white/5 border-white/10"
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
            label={t("wacc")}
            value={wacc}
            onChange={setWacc}
            min={4}
            max={15}
            step={0.25}
            display={(v) => `${v.toFixed(2)}%`}
            hint={t("waccHint")}
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
        <DcfResults result={result} currency={currency} />
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
        className="bg-white/5 border-white/10 tabular-nums"
      />
    </div>
  )
}
