"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, TrendingUp, TrendingDown, Info, AlertTriangle } from "lucide-react"
import { formatPercent } from "@/lib/finance/format"

/** Resposta de GET /api/portfolio/xirr. */
type XirrResponse = {
  connected: boolean
  needsSync?: boolean
  backfillDone?: boolean
  currency?: string
  xirr?: number | null
  totalDeposited?: number
  totalWithdrawn?: number
  currentValue?: number
  absoluteGain?: number
  totalReturn?: number | null
  foreignCurrencyCount?: number
  cashFlows?: { date: string; amount: number }[]
}

/**
 * Nº máximo de rondas de importação encadeadas num único carregamento da
 * página. Cada ronda traz até 300 movimentos, logo 4 cobrem 1200 — mais do que
 * qualquer conta retail típica. O limite existe para que uma conta anormalmente
 * grande (ou um bug de paginação do lado da corretora) não deixe o browser a
 * chamar a API indefinidamente; o resto é importado na visita seguinte.
 */
const MAX_SYNC_ROUNDS = 4

function formatMoney(value: number | undefined, currency: string): string {
  if (value === undefined || !Number.isFinite(value)) return "N/A"
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function PortfolioReturn() {
  const t = useTranslations("portfolio.annualReturn")
  const [data, setData] = useState<XirrResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  // Evita que o StrictMode do React (duplo mount em dev) dispare duas
  // importações em paralelo e gaste o rate limit da corretora a dobrar.
  const hasStarted = useRef(false)

  const load = useCallback(async (): Promise<XirrResponse | null> => {
    const res = await fetch("/api/portfolio/xirr")
    if (res.status === 401) return null
    if (!res.ok) throw new Error(String(res.status))
    return res.json()
  }, [])

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    let cancelled = false

    const run = async () => {
      try {
        let current = await load()
        if (cancelled || !current) { setIsLoading(false); return }
        setData(current)

        // Sem corretora ligada não há nada a importar.
        if (!current.connected) { setIsLoading(false); return }

        // Importa o histórico enquanto faltar — a primeira visita de uma conta
        // com muito histórico precisa de mais do que uma ronda.
        let rounds = 0
        while (!cancelled && (current.needsSync || current.backfillDone === false) && rounds < MAX_SYNC_ROUNDS) {
          rounds++
          setIsSyncing(true)
          const syncRes = await fetch("/api/broker/trading212/cashflows", { method: "POST" })
          if (!syncRes.ok) {
            // 429 = rate limit. O que já foi importado continua a servir para
            // um cálculo parcial; não tratamos isto como falha total.
            if (syncRes.status !== 429) throw new Error(String(syncRes.status))
            break
          }
          const next = await load()
          if (cancelled || !next) break
          current = next
          setData(next)
        }
      } catch {
        if (!cancelled) setError(t("error"))
      } finally {
        if (!cancelled) { setIsSyncing(false); setIsLoading(false) }
      }
    }

    run()
    return () => { cancelled = true }
  }, [load, t])

  if (isLoading || isSyncing) {
    return (
      <div className="glass rounded-2xl p-5 md:p-6 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {isSyncing ? t("importing") : t("loading")}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass rounded-2xl p-5 md:p-6">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  // Sem corretora ligada: não mostramos nada. A ligação já é oferecida pelo
  // PortfolioManageBar logo abaixo — repetir o convite aqui seria ruído.
  if (!data || !data.connected) return null

  if (data.xirr === null || data.xirr === undefined) {
    return (
      <div className="glass rounded-2xl p-5 md:p-6">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
          {t("title")}
        </p>
        <p className="text-sm text-muted-foreground">{t("notEnoughData")}</p>
      </div>
    )
  }

  const currency = data.currency || "EUR"
  const isPositive = data.xirr >= 0
  const cashFlows = data.cashFlows ?? []

  return (
    <div className="glass rounded-2xl p-5 md:p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="col-span-2 md:col-span-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1 flex items-center gap-1.5">
            {t("title")}
            <span title={t("tooltip")}>
              <Info className="w-3.5 h-3.5 opacity-60" />
            </span>
          </p>
          <p className={`nums text-2xl font-extrabold tracking-tight flex items-center gap-1.5 ${isPositive ? "text-bull" : "text-bear"}`}>
            {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            {isPositive ? "+" : ""}{formatPercent(data.xirr, 2)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("perYear")}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
            {t("invested")}
          </p>
          <p className="nums text-2xl font-extrabold tracking-tight">
            {formatMoney(data.totalDeposited, currency)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
            {t("currentValue")}
          </p>
          <p className="nums text-2xl font-extrabold tracking-tight">
            {formatMoney(data.currentValue, currency)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
            {t("totalReturn")}
          </p>
          <p className="nums text-2xl font-extrabold tracking-tight">
            {data.totalReturn != null ? formatPercent(data.totalReturn, 2) : "N/A"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("notAnnualized")}</p>
        </div>
      </div>

      {data.backfillDone === false && (
        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {t("partialHistory")}
        </p>
      )}

      {!!data.foreignCurrencyCount && (
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {t("foreignCurrency", { count: data.foreignCurrencyCount })}
        </p>
      )}

      {cashFlows.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/60">
          <button
            type="button"
            onClick={() => setShowDetails(v => !v)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {showDetails ? t("hideCashFlows") : t("showCashFlows", { count: cashFlows.length })}
          </button>

          {showDetails && (
            <ul className="mt-3 space-y-1 max-h-64 overflow-y-auto">
              {cashFlows.map((flow, index) => (
                <li
                  key={`${flow.date}-${index}`}
                  className="flex items-center justify-between text-sm tabular-nums"
                >
                  <span className="text-muted-foreground">
                    {new Date(flow.date).toLocaleDateString("pt-PT")}
                  </span>
                  <span className={flow.amount < 0 ? "text-muted-foreground" : "text-bull font-semibold"}>
                    {formatMoney(flow.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
