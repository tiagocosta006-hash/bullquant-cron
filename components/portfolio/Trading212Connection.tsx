"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Link2, Loader2, RefreshCw, Unlink, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

type ConnectionState = {
  broker: string
  lastSyncedAt: string | null
  lastSyncError: string | null
} | null

interface Trading212ConnectionProps {
  onSynced: () => void
}

export function Trading212Connection({ onSynced }: Trading212ConnectionProps) {
  const t = useTranslations("portfolio.trading212")
  const [connection, setConnection] = useState<ConnectionState>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ synced: number; unsupported: number } | null>(null)

  const fetchConnection = async () => {
    try {
      const res = await fetch('/api/broker/trading212/connection')
      if (res.ok) {
        const data = await res.json()
        setConnection(data.connection)
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchConnection()
  }, [])

  const handleConnect = async () => {
    if (!apiKey || !apiSecret) return
    setIsConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/broker/trading212/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, apiSecret }),
      })
      if (!res.ok) {
        setError(t('invalidCredentials'))
        return
      }
      setApiKey("")
      setApiSecret("")
      setIsFormOpen(false)
      await fetchConnection()
      await handleSync()
    } catch {
      setError(t('connectError'))
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    await fetch('/api/broker/trading212/connection', { method: 'DELETE' })
    setConnection(null)
    setSyncResult(null)
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/broker/trading212/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('syncError'))
        await fetchConnection()
        return
      }
      const synced = data.results.filter((r: { status: string }) => r.status === "synced").length
      const unsupported = data.results.filter((r: { status: string }) => r.status === "unsupported").length
      setSyncResult({ synced, unsupported })
      await fetchConnection()
      onSynced()
    } catch {
      setError(t('syncError'))
    } finally {
      setIsSyncing(false)
    }
  }

  if (isLoading) return null

  if (!connection) {
    return (
      <div className="bg-card border border-border/60 rounded-2xl p-4">
        {!isFormOpen ? (
          <Button variant="outline" onClick={() => setIsFormOpen(true)} className="gap-2">
            <Link2 className="w-4 h-4" />
            {t('connectTrigger')}
          </Button>
        ) : (
          <div className="space-y-3 max-w-sm">
            <p className="text-sm text-muted-foreground">{t('connectDescription')}</p>
            <input
              type="text"
              placeholder={t('apiKeyPlaceholder')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <input
              type="password"
              placeholder={t('apiSecretPlaceholder')}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            {error && <p className="text-sm text-bear">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsFormOpen(false)}>{t('cancel')}</Button>
              <Button onClick={handleConnect} disabled={isConnecting || !apiKey || !apiSecret} className="gap-2">
                {isConnecting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('connectSubmit')}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4 text-bull" />
          {t('connectedLabel')}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing} className="gap-1.5">
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {t('syncNow')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDisconnect} className="gap-1.5 text-muted-foreground">
            <Unlink className="w-3.5 h-3.5" />
            {t('disconnect')}
          </Button>
        </div>
      </div>
      {connection.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          {t('lastSynced')} {new Date(connection.lastSyncedAt).toLocaleString()}
        </p>
      )}
      {syncResult && (
        <p className="text-xs text-muted-foreground">
          {t('syncSummary', { synced: syncResult.synced, unsupported: syncResult.unsupported })}
        </p>
      )}
      {(error || connection.lastSyncError) && (
        <p className="text-xs text-bear flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error || connection.lastSyncError}
        </p>
      )}
    </div>
  )
}
