"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { InfoIcon, ChevronUp, ChevronDown } from "lucide-react"
import { getIndexCagr } from "@/lib/finance/indexReturns"

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)

function LabelWithTooltip({ label, tooltip }: { label: string, tooltip?: string }) {
  if (!tooltip) return <label className="text-xs font-medium text-muted-foreground">{label}</label>
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <label>{label}</label>
      <Tooltip>
        <TooltipTrigger type="button" className="cursor-help focus:outline-none">
          <InfoIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px] text-xs">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function CompoundInterestCalculator() {
  const t = useTranslations("compound")

  const [principal, setPrincipal] = React.useState<string>("20000")
  const [contribution, setContribution] = React.useState<string>("1000")
  const [interestRate, setInterestRate] = React.useState<string>("6")
  const [years, setYears] = React.useState<string>("10")

  const [compoundFreq, setCompoundFreq] = React.useState<string>("1") // Annually
  const [contribFreq, setContribFreq] = React.useState<string>("12") // Monthly
  const [contribTiming, setContribTiming] = React.useState<string>("end") // 'beginning' or 'end'

  const [presetIndex, setPresetIndex] = React.useState<string>("GSPC")
  const [presetLookback, setPresetLookback] = React.useState<string>("10")

  // Set sensible defaults when preset changes
  React.useEffect(() => {
    if (presetIndex === "GSPC" || presetIndex === "IXIC" || presetIndex === "DJI") {
      setCompoundFreq("1") // O mercado acionista cresce de forma agregada ao ano (CAGR)
      setContribFreq("12") // DCA Mensal (Estratégia comum)
      setContribTiming("beginning")
    } else if (presetIndex === "conservative") {
      setCompoundFreq("12") // Contas poupança/certificados costumam capitalizar mensal ou diariamente
      setContribFreq("12")
      setContribTiming("end")
    }
  }, [presetIndex])

  // Autopreenche a taxa a partir do CAGR histórico curado do índice + janela.
  // (Constantes em lib/finance/indexReturns.ts — os níveis de preço dos índices
  // não estão na BD, por isso não há fetch nem 404; ver notas no ficheiro.)
  React.useEffect(() => {
    if (presetIndex === "custom") return
    if (presetIndex === "conservative") {
      setInterestRate("3")
      return
    }
    const cagr = getIndexCagr(presetIndex, parseInt(presetLookback))
    if (cagr !== null) setInterestRate(cagr.toString())
  }, [presetIndex, presetLookback])

  const data = React.useMemo(() => {
    const result = []
    const startPrincipal = Number(principal) || 0
    let currentPrincipal = startPrincipal
    let totalContributions = 0
    let totalInterest = 0

    result.push({
      year: 0,
      principal: currentPrincipal,
      contributions: totalContributions,
      interest: totalInterest,
      total: currentPrincipal,
    })

    const r = (Number(interestRate) || 0) / 100
    const f = parseInt(contribFreq)
    const pmt = Number(contribution) || 0

    // Equivalent rate per contribution period
    let rate_p = 0
    if (compoundFreq === "continuously") {
      rate_p = Math.exp(r / f) - 1
    } else {
      const n = parseInt(compoundFreq)
      rate_p = Math.pow(1 + r / n, n / f) - 1
    }

    const maxYears = Number(years) || 0

    for (let y = 1; y <= maxYears; y++) {
      let yearInterest = 0

      for (let p = 1; p <= f; p++) {
        if (contribTiming === "beginning") {
          currentPrincipal += pmt
          totalContributions += pmt
        }

        const periodInterest = currentPrincipal * rate_p
        yearInterest += periodInterest
        totalInterest += periodInterest
        currentPrincipal += periodInterest

        if (contribTiming === "end") {
          currentPrincipal += pmt
          totalContributions += pmt
        }
      }

      result.push({
        year: y,
        principal: startPrincipal,
        contributions: totalContributions,
        interest: totalInterest,
        total: currentPrincipal,
      })
    }

    return result
  }, [principal, contribution, interestRate, years, compoundFreq, contribFreq, contribTiming])

  const finalYear = data[data.length - 1]

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover/95 backdrop-blur-md border border-border/50 p-4 rounded-xl shadow-xl space-y-3 min-w-[200px]">
          <div className="font-bold text-foreground">
            {t("chart.yearAxis", { value: label })}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{t("chart.principal")}</span>
              <span className="font-medium text-emerald-500">{formatCurrency(payload[0].payload.principal)}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{t("chart.contributions")}</span>
              <span className="font-medium text-emerald-500/70">{formatCurrency(payload[0].payload.contributions)}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{t("chart.interest")}</span>
              <span className="font-medium text-blue-500">{formatCurrency(payload[0].payload.interest)}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm pt-2 border-t border-border/50 font-bold">
              <span className="text-foreground">{t("chart.total")}</span>
              <span className="text-foreground">{formatCurrency(payload[0].payload.total)}</span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <TooltipProvider delay={200}>
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Inputs Panel */}
        <Card className="p-6 space-y-8 lg:col-span-1">

          {/* Section 1: Investment */}
          <div className="space-y-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <div className="h-5 w-1 bg-emerald-500 rounded-full"></div>
              {t("sections.investment")}
            </h3>

            <NumberField
              label={t("initialAmount")}
              tooltip={t("tooltips.initialAmount")}
              value={principal}
              onChange={setPrincipal}
              step={100}
              suffix="$"
              min={0}
            />

            <NumberField
              label={t("monthlyContribution")}
              tooltip={t("tooltips.monthlyContribution")}
              value={contribution}
              onChange={setContribution}
              step={50}
              suffix="$"
              min={0}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <LabelWithTooltip label={t("contribFreqLabel")} tooltip={t("tooltips.contribFreq")} />
              <Select value={contribFreq} onValueChange={(val) => val && setContribFreq(val)}>
      <SelectTrigger className="w-full bg-input/30 border-input/30">
        <SelectValue>
          {contribFreq === "12" ? t("contribFreqOptions.monthly") : t("contribFreqOptions.annually")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="12">{t("contribFreqOptions.monthly")}</SelectItem>
        <SelectItem value="1">{t("contribFreqOptions.annually")}</SelectItem>
      </SelectContent>
    </Select>
  </div>
    <div className="space-y-1.5">
      <LabelWithTooltip label={t("contribTimingLabel")} tooltip={t("tooltips.contribTiming")} />
              <Select value={contribTiming} onValueChange={(val) => val && setContribTiming(val)}>
      <SelectTrigger className="w-full bg-input/30 border-input/30">
        <SelectValue>
          {contribTiming === "beginning" ? t("contribTimingOptions.beginning") : t("contribTimingOptions.end")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="beginning">{t("contribTimingOptions.beginning")}</SelectItem>
        <SelectItem value="end">{t("contribTimingOptions.end")}</SelectItem>
      </SelectContent>
    </Select>
  </div>
          </div >

    <NumberField
      label={t("years")}
      tooltip={t("tooltips.years")}
      value={years}
      onChange={setYears}
      step={1}
      suffix={t("yearsSuffix")}
      min={0}
    />
        </div >

    <div className="h-px bg-border/50" />

  {/* Section 2: Returns & Compounding */ }
  <div className="space-y-5">
    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
      <div className="h-5 w-1 bg-blue-500 rounded-full"></div>
      {t("sections.return")}
    </h3>

    <div className="space-y-1.5 mb-2">
      <LabelWithTooltip label={t("presetLabel")} tooltip={t("tooltips.preset")} />
      <div className="flex gap-2">
              <Select value={presetIndex} onValueChange={(val) => val && setPresetIndex(val)}>
      <SelectTrigger className="flex-1 bg-input/30 border-input/30">
        <SelectValue>
          {presetIndex === "GSPC" ? t("presets.sp500") :
            presetIndex === "IXIC" ? t("presets.nasdaq") :
              presetIndex === "DJI" ? t("presets.dow") :
                presetIndex === "conservative" ? t("presets.conservative") :
                  t("presets.custom")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="custom">{t("presets.custom")}</SelectItem>
        <SelectItem value="GSPC">{t("presets.sp500")}</SelectItem>
        <SelectItem value="IXIC">{t("presets.nasdaq")}</SelectItem>
        <SelectItem value="DJI">{t("presets.dow")}</SelectItem>
        <SelectItem value="conservative">{t("presets.conservative")}</SelectItem>
      </SelectContent>
    </Select>
  </div>
          </div >

    { presetIndex !== "custom" && presetIndex !== "conservative" && (
      <div className="space-y-1.5 mb-2">
        <LabelWithTooltip label={t("lookbackLabel")} tooltip={t("tooltips.lookback")} />
        <div className="flex gap-2">
                <Select value={presetLookback} onValueChange={(val) => val && setPresetLookback(val)}>
      <SelectTrigger className="flex-1 bg-input/30 border-input/30">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="1">{t("lookbackOptions.1")}</SelectItem>
        <SelectItem value="3">{t("lookbackOptions.3")}</SelectItem>
        <SelectItem value="5">{t("lookbackOptions.5")}</SelectItem>
        <SelectItem value="10">{t("lookbackOptions.10")}</SelectItem>
        <SelectItem value="20">{t("lookbackOptions.20")}</SelectItem>
        <SelectItem value="30">{t("lookbackOptions.30")}</SelectItem>
        <SelectItem value="50">{t("lookbackOptions.50")}</SelectItem>
      </SelectContent>
    </Select>
  </div>
            </div >
          )
}

          <NumberField
            label={t("interestRate")}
            tooltip={t("tooltips.interestRate")}
            value={interestRate}
            onChange={(val) => {
              setInterestRate(val)
              setPresetIndex("custom")
            }}
            step={0.1}
            suffix="%"
          />

          <div className="space-y-1.5">
            <LabelWithTooltip label={t("compoundLabel")} tooltip={t("tooltips.compound")} />
            <Select value={compoundFreq} onValueChange={(val) => val && setCompoundFreq(val)}>
    <SelectTrigger className="w-full bg-input/30 border-input/30">
      <SelectValue>
        {compoundFreq === "1" && t("compoundOptions.annually")}
        {compoundFreq === "2" && t("compoundOptions.semi")}
        {compoundFreq === "4" && t("compoundOptions.quarterly")}
        {compoundFreq === "12" && t("compoundOptions.monthly")}
        {compoundFreq === "24" && t("compoundOptions.semimonthly")}
        {compoundFreq === "26" && t("compoundOptions.biweekly")}
        {compoundFreq === "52" && t("compoundOptions.weekly")}
        {compoundFreq === "365" && t("compoundOptions.daily")}
        {compoundFreq === "continuously" && t("compoundOptions.continuously")}
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="1">{t("compoundOptions.annually")}</SelectItem>
      <SelectItem value="2">{t("compoundOptions.semi")}</SelectItem>
      <SelectItem value="4">{t("compoundOptions.quarterly")}</SelectItem>
      <SelectItem value="12">{t("compoundOptions.monthly")}</SelectItem>
      <SelectItem value="24">{t("compoundOptions.semimonthly")}</SelectItem>
      <SelectItem value="26">{t("compoundOptions.biweekly")}</SelectItem>
      <SelectItem value="52">{t("compoundOptions.weekly")}</SelectItem>
      <SelectItem value="365">{t("compoundOptions.daily")}</SelectItem>
      <SelectItem value="continuously">{t("compoundOptions.continuously")}</SelectItem>
    </SelectContent>
  </Select>
</div>
        </div >
      </Card >

  {/* Results Panel */ }
  < div className = "space-y-6 lg:col-span-2" >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="text-sm font-medium text-muted-foreground mb-1">
              {t("summary.finalBalance")}
            </div>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(finalYear.total)}
            </div>
          </Card>
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
            <div className="text-sm font-medium text-muted-foreground mb-1">
              {t("summary.totalContributions")}
            </div>
            <div className="text-2xl font-bold text-emerald-500">
              {formatCurrency(finalYear.principal + finalYear.contributions)}
            </div>
          </Card>
          <Card className="p-4 bg-blue-500/5 border-blue-500/20">
            <div className="text-sm font-medium text-muted-foreground mb-1">
              {t("summary.totalInterest")}
            </div>
            <div className="text-2xl font-bold text-blue-500">
              {formatCurrency(finalYear.interest)}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="colorInterest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => t("chart.yearAxis", { value: val })}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => {
                    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
                    if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`
                    return `$${val}`
                  }}
                />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="principal"
                  stackId="1"
                  stroke="#10b981"
                  fill="url(#colorPrincipal)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="contributions"
                  stackId="1"
                  stroke="#34d399"
                  fill="#34d399"
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="interest"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="url(#colorInterest)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        </div >
      </div >
    </TooltipProvider >
  )
}

function NumberField({
  label,
  tooltip,
  value,
  onChange,
  step,
  suffix,
  min,
}: {
  label: string
  tooltip?: string
  value: string
  onChange: (v: string) => void
  step: number
  suffix?: string
  min?: number
}) {
  const handleIncrement = () => {
    const current = Number(value) || 0
    const next = parseFloat((current + step).toFixed(4))
    onChange(next.toString())
  }

  const handleDecrement = () => {
    const current = Number(value) || 0
    let next = parseFloat((current - step).toFixed(4))
    if (min !== undefined && next < min) {
      next = min
    }
    onChange(next.toString())
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <LabelWithTooltip label={label} tooltip={tooltip} />
        {suffix && <span className="text-xs text-muted-foreground/60">{suffix}</span>}
      </div>
      <div className="relative">
        <Input
          type="number"
          step={step}
          min={min}
          value={value}
          onChange={(e) => {
            let val = e.target.value
            
            if (val.length > 1 && val.startsWith("0") && !val.startsWith("0.")) {
              val = val.replace(/^0+/, "")
              if (val === "") val = "0"
            }

            if (min !== undefined && val !== "" && Number(val) < min) {
              val = min.toString()
            }
            onChange(val)
          }}
          className="bg-input/30 border-input/30 tabular-nums pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
          <button
            type="button"
            onClick={handleIncrement}
            className="text-muted-foreground hover:text-foreground hover:bg-muted p-0.5 rounded transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleDecrement}
            className="text-muted-foreground hover:text-foreground hover:bg-muted p-0.5 rounded transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
