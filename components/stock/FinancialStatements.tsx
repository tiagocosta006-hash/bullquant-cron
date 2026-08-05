"use client"

import React, { useState, useMemo, useCallback } from "react"
import {
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
  Layers,
  ArrowUpDown,
  Building2,
  DollarSign,
} from "lucide-react"
import { useTranslations } from "next-intl"

export type StatementType = "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW"
export type PeriodType = "ANNUAL" | "QUARTERLY" | "TTM"
export type DisplayMode = "ABSOLUTE" | "PERCENT_REVENUE" | "YOY_GROWTH"

export type FundamentalDataRow = {
  id?: string
  periodType?: string
  fiscalYear?: number
  fiscalQuarter?: number | null
  periodEnd?: string | Date
  filedAt?: string | Date | null
  label?: string
  // Income Statement
  revenue?: number | null
  costOfRevenue?: number | null
  grossProfit?: number | null
  operatingExpenses?: number | null
  researchAndDevelopment?: number | null
  sellingGeneralAndAdmin?: number | null
  operatingIncome?: number | null
  depreciationAndAmortization?: number | null
  ebitda?: number | null
  interestExpense?: number | null
  netInterestIncome?: number | null
  otherNonOperatingIncome?: number | null
  incomeBeforeTax?: number | null
  taxExpense?: number | null
  netIncome?: number | null
  epsDiluted?: number | null
  sharesOutstanding?: number | null
  dividendPerShare?: number | null
  // Balance Sheet
  cash?: number | null
  accountsReceivable?: number | null
  inventory?: number | null
  totalCurrentAssets?: number | null
  propertyPlantEquipment?: number | null
  goodwillAndIntangibles?: number | null
  totalAssets?: number | null
  accountsPayable?: number | null
  shortTermDebt?: number | null
  totalCurrentLiab?: number | null
  longTermDebt?: number | null
  totalDebt?: number | null
  totalLiabilities?: number | null
  retainedEarnings?: number | null
  totalEquity?: number | null
  // Cash Flow
  operatingCashFlow?: number | null
  capex?: number | null
  freeCashFlow?: number | null
  investingCashFlow?: number | null
  financingCashFlow?: number | null
  stockBasedCompensation?: number | null
  shareRepurchases?: number | null
  dividendsPaid?: number | null
  netChangeInCash?: number | null
}

interface StatementLineConfig {
  key: keyof FundamentalDataRow | string
  label: string
  isHeader?: boolean
  isSubtotal?: boolean
  isBold?: boolean
  indent?: number
  invertColor?: boolean
  isPerShare?: boolean
  isCount?: boolean
  getValue?: (row: FundamentalDataRow) => number | null
}

interface StatementGroup {
  id: string
  title: string
  lines: StatementLineConfig[]
}

// Format currency numbers compactly or fully
function formatMetricValue(
  val: number | null | undefined,
  mode: DisplayMode,
  rev: number | null | undefined,
  currencySymbol: string,
  isPerShare?: boolean,
  isCount?: boolean
): { text: string; rawText: string; colorClass: string } {
  if (val === null || val === undefined || isNaN(val)) {
    return { text: "—", rawText: "N/A", colorClass: "text-muted-foreground/60" }
  }

  if (mode === "PERCENT_REVENUE") {
    if (isPerShare || isCount) {
      return { text: "—", rawText: "N/A", colorClass: "text-muted-foreground/40" }
    }
    if (!rev || rev === 0) {
      return { text: "—", rawText: "N/A", colorClass: "text-muted-foreground/40" }
    }
    const pct = (val / Math.abs(rev)) * 100
    const text = `${pct.toFixed(1)}%`
    return {
      text,
      rawText: `${pct.toFixed(2)}% da Receita`,
      colorClass: pct < 0 ? "text-rose-500 font-medium" : "text-foreground font-medium",
    }
  }

  if (mode === "YOY_GROWTH") {
    const sign = val > 0 ? "+" : ""
    const text = `${sign}${val.toFixed(1)}%`
    let colorClass = "text-muted-foreground"
    if (val > 0.05) colorClass = "text-emerald-500 font-semibold"
    else if (val < -0.05) colorClass = "text-rose-500 font-semibold"
    return { text, rawText: `${sign}${val.toFixed(2)}% YoY`, colorClass }
  }

  // ABSOLUTE Mode
  if (isPerShare) {
    const text = `${currencySymbol}${val.toFixed(2)}`
    return {
      text,
      rawText: `${currencySymbol}${val.toFixed(4)}`,
      colorClass: val < 0 ? "text-rose-500" : "text-foreground font-medium",
    }
  }

  if (isCount) {
    const absVal = Math.abs(val)
    let text = ""
    if (absVal >= 1_000_000_000) {
      text = `${(val / 1_000_000_000).toFixed(2)}B`
    } else if (absVal >= 1_000_000) {
      text = `${(val / 1_000_000).toFixed(2)}M`
    } else if (absVal >= 1_000) {
      text = `${(val / 1_000).toFixed(1)}K`
    } else {
      text = val.toLocaleString()
    }
    return {
      text,
      rawText: val.toLocaleString(),
      colorClass: "text-foreground",
    }
  }

  const absVal = Math.abs(val)
  let text = ""
  if (absVal >= 1_000_000_000) {
    text = `${currencySymbol}${(val / 1_000_000_000).toFixed(2)}B`
  } else if (absVal >= 1_000_000) {
    text = `${currencySymbol}${(val / 1_000_000).toFixed(2)}M`
  } else if (absVal >= 1_000) {
    text = `${currencySymbol}${(val / 1_000).toFixed(1)}K`
  } else {
    text = `${currencySymbol}${val.toFixed(2)}`
  }

  return {
    text,
    rawText: `${currencySymbol}${val.toLocaleString()}`,
    colorClass: val < 0 ? "text-rose-400 font-medium" : "text-foreground font-medium",
  }
}

// Mini SVG Sparkline Component
const Sparkline: React.FC<{ data: (number | null)[]; isPositiveGood?: boolean }> = React.memo(
  ({ data, isPositiveGood = true }) => {
    const validData = data.filter((v): v is number => typeof v === "number" && !isNaN(v))
    if (validData.length < 2) {
      return <div className="w-16 h-4 flex items-center justify-center text-[10px] text-muted-foreground/40">—</div>
    }

    const min = Math.min(...validData)
    const max = Math.max(...validData)
    const range = max - min || 1
    const width = 64
    const height = 18
    const padding = 2

    const points = data
      .map((val, idx) => {
        if (val === null || isNaN(val)) return null
        const x = padding + (idx / (data.length - 1)) * (width - 2 * padding)
        const y = height - padding - ((val - min) / range) * (height - 2 * padding)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .filter(Boolean)
      .join(" ")

    const first = validData[0]
    const last = validData[validData.length - 1]
    const isGrowing = last >= first
    const strokeColor = isGrowing
      ? isPositiveGood
        ? "#10b981"
        : "#f43f5e"
      : isPositiveGood
      ? "#f43f5e"
      : "#10b981"

    return (
      <svg width={width} height={height} className="overflow-visible inline-block opacity-80 hover:opacity-100 transition-opacity">
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {validData.length > 0 && (
          <circle
            cx={padding + ((data.length - 1) / (data.length - 1)) * (width - 2 * padding)}
            cy={height - padding - ((last - min) / range) * (height - 2 * padding)}
            r="2"
            fill={strokeColor}
          />
        )}
      </svg>
    )
  }
)
Sparkline.displayName = "Sparkline"

export function FinancialStatements({
  ticker,
  data = [],
  currencySymbol = "$",
  defaultPeriod = "ANNUAL",
}: {
  ticker: string
  data: FundamentalDataRow[]
  currencySymbol?: string
  defaultPeriod?: PeriodType
}) {
  const t = useTranslations("financialStatements")
  const [statement, setStatement] = useState<StatementType>("INCOME_STATEMENT")
  const [period, setPeriod] = useState<PeriodType>(defaultPeriod)
  const [displayMode, setDisplayMode] = useState<DisplayMode>("ABSOLUTE")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    revenueGroup: true,
    opexGroup: true,
    operatingGroup: true,
    bottomLineGroup: true,
    perShareGroup: true,
    currentAssetsGroup: true,
    nonCurrentAssetsGroup: true,
    currentLiabGroup: true,
    nonCurrentLiabGroup: true,
    equityGroup: true,
    ocfGroup: true,
    icfGroup: true,
    fcfGroup: true,
    summaryGroup: true,
  })

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }, [])

  const [sortOrder, setSortOrder] = useState<"DESC" | "ASC">("DESC")

  const periodsList = useMemo(() => {
    if (!data || data.length === 0) return []

    let filtered: FundamentalDataRow[] = []

    if (period === "ANNUAL") {
      filtered = data
        .filter(d => d.periodType === "ANNUAL")
        .map(a => ({
          ...a,
          label: `FY${a.fiscalYear}`,
        }))
    } else if (period === "QUARTERLY") {
      filtered = data
        .filter(d => d.periodType === "QUARTERLY")
        .map(q => ({
          ...q,
          label: `Q${q.fiscalQuarter} '${String(q.fiscalYear).slice(2)}`,
        }))
    } else if (period === "TTM") {
      const qs = data
        .filter(d => d.periodType === "QUARTERLY")
        .sort((a, b) => new Date(a.periodEnd || 0).getTime() - new Date(b.periodEnd || 0).getTime())

      const ttmRows: FundamentalDataRow[] = []
      const sumKeys: (keyof FundamentalDataRow)[] = [
        "revenue", "costOfRevenue", "grossProfit", "operatingExpenses",
        "researchAndDevelopment", "sellingGeneralAndAdmin", "operatingIncome",
        "depreciationAndAmortization", "ebitda", "interestExpense", "netInterestIncome",
        "otherNonOperatingIncome", "incomeBeforeTax", "taxExpense", "netIncome",
        "operatingCashFlow", "capex", "freeCashFlow", "investingCashFlow",
        "financingCashFlow", "stockBasedCompensation", "shareRepurchases",
        "dividendsPaid", "netChangeInCash", "dividendPerShare", "epsDiluted",
      ]

      for (let i = 3; i < qs.length; i++) {
        const window4 = qs.slice(i - 3, i + 1)
        const latest = window4[3]
        const row: FundamentalDataRow = {
          ...latest,
          periodType: "TTM",
          label: `TTM Q${latest.fiscalQuarter} '${String(latest.fiscalYear).slice(2)}`,
        }

        sumKeys.forEach(k => {
          const vals = window4.map(w => w[k]).filter((v): v is number => typeof v === "number")
          if (vals.length > 0) {
            (row as Record<string, unknown>)[k] = vals.reduce((a, b) => a + b, 0)
          }
        })
        ttmRows.push(row)
      }
      filtered = ttmRows
    }

    filtered.sort((a, b) => {
      const dateA = new Date(a.periodEnd || 0).getTime()
      const dateB = new Date(b.periodEnd || 0).getTime()
      return sortOrder === "DESC" ? dateB - dateA : dateA - dateB
    })

    return filtered.slice(0, period === "ANNUAL" ? 11 : 16)
  }, [data, period, sortOrder])

  const getYoYGrowth = useCallback(
    (row: FundamentalDataRow, key: keyof FundamentalDataRow, getValue?: (r: FundamentalDataRow) => number | null): number | null => {
      const currentVal = getValue ? getValue(row) : (row[key] as number | null | undefined)
      if (currentVal === null || currentVal === undefined) return null

      let prevRow: FundamentalDataRow | undefined
      if (period === "ANNUAL") {
        prevRow = data.find(d => d.periodType === "ANNUAL" && d.fiscalYear === (row.fiscalYear || 0) - 1)
      } else if (period === "QUARTERLY") {
        prevRow = data.find(
          d =>
            d.periodType === "QUARTERLY" &&
            d.fiscalQuarter === row.fiscalQuarter &&
            d.fiscalYear === (row.fiscalYear || 0) - 1
        )
      } else if (period === "TTM") {
        const qs = data.filter(d => d.periodType === "QUARTERLY")
        const prevQuarter = qs.find(
          d =>
            d.fiscalQuarter === row.fiscalQuarter &&
            d.fiscalYear === (row.fiscalYear || 0) - 1
        )
        if (prevQuarter) {
          prevRow = prevQuarter
        }
      }

      if (!prevRow) return null
      const prevVal = getValue ? getValue(prevRow) : (prevRow[key] as number | null | undefined)
      if (prevVal === null || prevVal === undefined || prevVal === 0) return null

      return ((currentVal - prevVal) / Math.abs(prevVal)) * 100
    },
    [data, period]
  )

  const incomeStatementGroups: StatementGroup[] = useMemo(
    () => [
      {
        id: "revenueGroup",
        title: t("sections.revenueGrossProfit"),
        lines: [
          { key: "revenue", label: t("metrics.revenue"), isBold: true },
          { key: "costOfRevenue", label: t("metrics.costOfRevenue"), indent: 1 },
          { key: "grossProfit", label: t("metrics.grossProfit"), isSubtotal: true, isBold: true },
        ],
      },
      {
        id: "opexGroup",
        title: t("sections.operatingExpenses"),
        lines: [
          { key: "researchAndDevelopment", label: t("metrics.researchAndDevelopment"), indent: 1 },
          { key: "sellingGeneralAndAdmin", label: t("metrics.sellingGeneralAndAdmin"), indent: 1 },
          {
            key: "operatingExpenses",
            label: t("metrics.operatingExpensesTotal"),
            isSubtotal: true,
            getValue: r => {
              if (r.operatingExpenses != null) return r.operatingExpenses
              const rd = r.researchAndDevelopment || 0
              const sga = r.sellingGeneralAndAdmin || 0
              return rd + sga > 0 ? rd + sga : null
            },
          },
        ],
      },
      {
        id: "operatingGroup",
        title: t("sections.operatingIncomeEbitda"),
        lines: [
          { key: "operatingIncome", label: t("metrics.operatingIncome"), isBold: true },
          { key: "depreciationAndAmortization", label: t("metrics.depreciationAndAmortization"), indent: 1 },
          {
            key: "ebitda",
            label: t("metrics.ebitda"),
            isSubtotal: true,
            isBold: true,
            getValue: r => {
              if (r.ebitda != null) return r.ebitda
              if (r.operatingIncome != null && r.depreciationAndAmortization != null) {
                return r.operatingIncome + r.depreciationAndAmortization
              }
              return null
            },
          },
        ],
      },
      {
        id: "bottomLineGroup",
        title: t("sections.netIncomeBeforeTax"),
        lines: [
          { key: "interestExpense", label: t("metrics.interestExpense"), indent: 1 },
          { key: "netInterestIncome", label: t("metrics.netInterestIncome"), indent: 1 },
          { key: "otherNonOperatingIncome", label: t("metrics.otherNonOperatingIncome"), indent: 1 },
          { key: "incomeBeforeTax", label: t("metrics.incomeBeforeTax"), isSubtotal: true },
          { key: "taxExpense", label: t("metrics.taxExpense"), indent: 1 },
          { key: "netIncome", label: t("metrics.netIncome"), isBold: true, isSubtotal: true },
        ],
      },
      {
        id: "perShareGroup",
        title: t("sections.perShareData"),
        lines: [
          { key: "epsDiluted", label: t("metrics.epsDiluted"), isPerShare: true, isBold: true },
          { key: "sharesOutstanding", label: t("metrics.sharesOutstanding"), isCount: true },
          { key: "dividendPerShare", label: t("metrics.dividendPerShare"), isPerShare: true },
        ],
      },
    ],
    [t]
  )

  const balanceSheetGroups: StatementGroup[] = useMemo(
    () => [
      {
        id: "currentAssetsGroup",
        title: t("sections.currentAssets"),
        lines: [
          { key: "cash", label: t("metrics.cashAndEquivalents"), indent: 1 },
          { key: "accountsReceivable", label: t("metrics.accountsReceivable"), indent: 1 },
          { key: "inventory", label: t("metrics.inventory"), indent: 1 },
          { key: "totalCurrentAssets", label: t("metrics.totalCurrentAssets"), isSubtotal: true, isBold: true },
        ],
      },
      {
        id: "nonCurrentAssetsGroup",
        title: t("sections.nonCurrentAssets"),
        lines: [
          { key: "propertyPlantEquipment", label: t("metrics.propertyPlantEquipment"), indent: 1 },
          { key: "goodwillAndIntangibles", label: t("metrics.goodwillAndIntangibles"), indent: 1 },
          { key: "totalAssets", label: t("metrics.totalAssets"), isBold: true, isSubtotal: true },
        ],
      },
      {
        id: "currentLiabGroup",
        title: t("sections.currentLiabilities"),
        lines: [
          { key: "accountsPayable", label: t("metrics.accountsPayable"), indent: 1 },
          { key: "shortTermDebt", label: t("metrics.shortTermDebt"), indent: 1 },
          { key: "totalCurrentLiab", label: t("metrics.totalCurrentLiabilities"), isSubtotal: true },
        ],
      },
      {
        id: "nonCurrentLiabGroup",
        title: t("sections.nonCurrentLiabilities"),
        lines: [
          { key: "longTermDebt", label: t("metrics.longTermDebt"), indent: 1 },
          { key: "totalDebt", label: t("metrics.totalDebt"), isSubtotal: true },
          {
            key: "netDebt",
            label: t("metrics.netDebt"),
            isSubtotal: true,
            getValue: r => {
              if (r.totalDebt != null && r.cash != null) {
                return r.totalDebt - r.cash
              }
              return null
            },
          },
          { key: "totalLiabilities", label: t("metrics.totalLiabilities"), isBold: true, isSubtotal: true },
        ],
      },
      {
        id: "equityGroup",
        title: t("sections.stockholdersEquity"),
        lines: [
          { key: "retainedEarnings", label: t("metrics.retainedEarnings"), indent: 1 },
          { key: "totalEquity", label: t("metrics.totalEquity"), isBold: true, isSubtotal: true },
        ],
      },
    ],
    [t]
  )

  const cashFlowGroups: StatementGroup[] = useMemo(
    () => [
      {
        id: "ocfGroup",
        title: t("sections.operatingActivities"),
        lines: [
          { key: "netIncome", label: t("metrics.netIncome"), indent: 1 },
          { key: "depreciationAndAmortization", label: t("metrics.depreciationAndAmortization"), indent: 1 },
          { key: "stockBasedCompensation", label: t("metrics.stockBasedCompensation"), indent: 1 },
          { key: "operatingCashFlow", label: t("metrics.operatingCashFlowTotal"), isBold: true, isSubtotal: true },
        ],
      },
      {
        id: "icfGroup",
        title: t("sections.investingActivities"),
        lines: [
          { key: "capex", label: t("metrics.capex"), indent: 1 },
          { key: "investingCashFlow", label: t("metrics.investingCashFlowTotal"), isBold: true, isSubtotal: true },
        ],
      },
      {
        id: "fcfGroup",
        title: t("sections.financingActivities"),
        lines: [
          { key: "shareRepurchases", label: t("metrics.shareRepurchases"), indent: 1 },
          { key: "dividendsPaid", label: t("metrics.dividendsPaid"), indent: 1 },
          { key: "financingCashFlow", label: t("metrics.financingCashFlowTotal"), isBold: true, isSubtotal: true },
        ],
      },
      {
        id: "summaryGroup",
        title: t("sections.cashSummaryFreeCashFlow"),
        lines: [
          { key: "netChangeInCash", label: t("metrics.netChangeInCash"), isSubtotal: true },
          { key: "freeCashFlow", label: t("metrics.freeCashFlow"), isBold: true, isSubtotal: true },
        ],
      },
    ],
    [t]
  )

  const activeGroups = useMemo(() => {
    if (statement === "INCOME_STATEMENT") return incomeStatementGroups
    if (statement === "BALANCE_SHEET") return balanceSheetGroups
    return cashFlowGroups
  }, [statement, incomeStatementGroups, balanceSheetGroups, cashFlowGroups])

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return activeGroups
    const q = searchQuery.toLowerCase().trim()
    return activeGroups
      .map(group => {
        const matchingLines = group.lines.filter(l => l.label.toLowerCase().includes(q))
        return matchingLines.length > 0 ? { ...group, lines: matchingLines } : null
      })
      .filter((g): g is StatementGroup => g !== null)
  }, [activeGroups, searchQuery])

  const exportToCSV = useCallback(() => {
    if (periodsList.length === 0) return

    const headers = ["Métrica / Período", ...periodsList.map(p => p.label || `${p.fiscalYear}`)]
    const rows: string[][] = [headers]

    activeGroups.forEach(group => {
      rows.push([`--- ${group.title.toUpperCase()} ---`, ...periodsList.map(() => "")])
      group.lines.forEach(line => {
        const rowData = [line.label]
        periodsList.forEach(p => {
          const val = line.getValue ? line.getValue(p) : (p[line.key as keyof FundamentalDataRow] as number | null | undefined)
          if (val === null || val === undefined || isNaN(val)) {
            rowData.push("")
          } else {
            rowData.push(String(val))
          }
        })
        rows.push(rowData)
      })
    })

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `${ticker}_${statement}_${period}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [periodsList, activeGroups, ticker, statement, period])

  return (
    <div className="space-y-6">
      {/* Top Glassmorphism Controls Card */}
      <div className="bg-card/70 backdrop-blur-md border border-border/50 rounded-xl p-4 shadow-sm flex flex-col gap-4">
        {/* Row 1: Statement Selector + Period Pills */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Statement Tabs */}
          <div className="flex bg-muted/60 p-1 rounded-lg border border-border/40 overflow-x-auto">
            <button
              onClick={() => setStatement("INCOME_STATEMENT")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                statement === "INCOME_STATEMENT"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span>{t("tabs.incomeStatement")}</span>
            </button>

            <button
              onClick={() => setStatement("BALANCE_SHEET")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                statement === "BALANCE_SHEET"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="w-4 h-4 text-sky-500" />
              <span>{t("tabs.balanceSheet")}</span>
            </button>

            <button
              onClick={() => setStatement("CASH_FLOW")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                statement === "CASH_FLOW"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              <span>{t("tabs.cashFlow")}</span>
            </button>
          </div>

          {/* Right Side: Frequency (Annual / Quarterly / TTM) & Export */}
          <div className="flex items-center gap-2 flex-wrap justify-between lg:justify-end">
            <div className="flex bg-muted/60 p-1 rounded-lg border border-border/40">
              {(["ANNUAL", "QUARTERLY", "TTM"] as PeriodType[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    period === p
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "ANNUAL" ? t("periods.annual") : p === "QUARTERLY" ? t("periods.quarterly") : "TTM"}
                </button>
              ))}
            </div>

            <button
              onClick={exportToCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border/60 bg-muted/40 hover:bg-muted/80 text-foreground transition-all hover:shadow-sm"
              title={t("actions.exportCsv")}
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">{t("actions.exportCsv")}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Search + Display Mode */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-border/30">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("actions.searchPlaceholder")}
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-background/80 rounded-lg border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium mr-1 hidden sm:inline">
              {t("displayMode.label")}:
            </span>
            <div className="flex bg-muted/60 p-1 rounded-lg border border-border/40">
              <button
                onClick={() => setDisplayMode("ABSOLUTE")}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                  displayMode === "ABSOLUTE"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("displayMode.absolute")}
              </button>

              {statement === "INCOME_STATEMENT" && (
                <button
                  onClick={() => setDisplayMode("PERCENT_REVENUE")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                    displayMode === "PERCENT_REVENUE"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("displayMode.percentRevenue")}
                </button>
              )}

              <button
                onClick={() => setDisplayMode("YOY_GROWTH")}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                  displayMode === "YOY_GROWTH"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("displayMode.yoyGrowth")}
              </button>
            </div>

            <button
              onClick={() => setSortOrder(prev => (prev === "DESC" ? "ASC" : "DESC"))}
              className="p-1.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
              title={sortOrder === "DESC" ? t("actions.sortDesc") : t("actions.sortAsc")}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Financial Table Container */}
      <div className="bg-card/60 backdrop-blur-md border border-border/50 rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold">
                <th className="py-3 px-4 sticky left-0 z-20 bg-muted/95 backdrop-blur-md min-w-[220px] sm:min-w-[280px] border-r border-border/30">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span>{t("headers.lineItem")}</span>
                  </div>
                </th>
                <th className="py-3 px-3 text-center min-w-[80px] border-r border-border/30 text-xs font-medium">
                  {t("headers.trend")}
                </th>
                {periodsList.map(periodRow => (
                  <th
                    key={periodRow.id || periodRow.label}
                    className="py-3 px-3 text-right font-semibold text-foreground min-w-[105px] border-r border-border/20 last:border-r-0"
                  >
                    <div className="text-xs sm:text-sm">{periodRow.label}</div>
                    {periodRow.periodEnd && (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {String(periodRow.periodEnd).slice(0, 7)}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-border/20">
              {filteredGroups.map(group => {
                const isExpanded = expandedGroups[group.id] ?? true
                return (
                  <React.Fragment key={group.id}>
                    <tr
                      onClick={() => toggleGroup(group.id)}
                      className="bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors select-none"
                    >
                      <td
                        colSpan={periodsList.length + 2}
                        className="py-2 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground/90 sticky left-0 z-10 bg-muted/40"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                          <span>{group.title}</span>
                        </div>
                      </td>
                    </tr>

                    {isExpanded &&
                      group.lines.map(line => {
                        const sparklineData = periodsList.map(p =>
                          line.getValue
                            ? line.getValue(p)
                            : (p[line.key as keyof FundamentalDataRow] as number | null | undefined) ?? null
                        )

                        return (
                          <tr
                            key={line.key}
                            className={`group hover:bg-muted/20 transition-colors ${
                              line.isSubtotal
                                ? "bg-muted/10 font-semibold border-t border-border/40"
                                : ""
                            }`}
                          >
                            <td
                              className={`py-2 px-4 sticky left-0 z-10 bg-background/95 backdrop-blur-md border-r border-border/30 whitespace-nowrap ${
                                line.indent === 1 ? "pl-8 text-muted-foreground" : ""
                              } ${line.isBold ? "font-bold text-foreground" : "text-foreground/90"}`}
                            >
                              <div className="flex items-center gap-1.5">
                                {line.isSubtotal && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/70 mr-1" />
                                )}
                                <span>{line.label}</span>
                              </div>
                            </td>

                            <td className="py-2 px-2 text-center border-r border-border/30 bg-muted/5">
                              <Sparkline
                                data={sortOrder === "DESC" ? [...sparklineData].reverse() : sparklineData}
                                isPositiveGood={!line.invertColor}
                              />
                            </td>

                            {periodsList.map(periodRow => {
                              let value = line.getValue
                                ? line.getValue(periodRow)
                                : (periodRow[line.key as keyof FundamentalDataRow] as number | null | undefined)

                              if (displayMode === "YOY_GROWTH") {
                                value = getYoYGrowth(periodRow, line.key as keyof FundamentalDataRow, line.getValue)
                              }

                              const formatted = formatMetricValue(
                                value,
                                displayMode,
                                periodRow.revenue,
                                currencySymbol,
                                line.isPerShare,
                                line.isCount
                              )

                              return (
                                <td
                                  key={periodRow.id || periodRow.label}
                                  className={`py-2 px-3 text-right border-r border-border/20 last:border-r-0 tabular-nums ${
                                    formatted.colorClass
                                  } ${line.isBold ? "font-bold" : ""}`}
                                  title={formatted.rawText}
                                >
                                  {formatted.text}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredGroups.length === 0 && (
          <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
            <Search className="w-8 h-8 opacity-40" />
            <p className="text-sm font-medium">{t("actions.noResults")}</p>
          </div>
        )}
      </div>

      {/* Footer Notes */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/80 px-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
          <span>{t("footer.sourceNote")}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{t("footer.unitsNote", { symbol: currencySymbol })}</span>
        </div>
      </div>
    </div>
  )
}
