"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeft, FolderOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { CompanyCard } from "@/components/explore/CompanyCard"

type WatchlistMeta = { id: string; name: string; count: number; createdAt: string }

// Espelha o shape que CompanyCard espera (id/ticker/name/... + métricas do
// último anual) — o mesmo formato devolvido por /api/explore e /api/watchlists/[id].
// Exportado para o explore/page.tsx tipar o estado partilhado (selectedCompany,
// lista de resultados de pesquisa) sem repetir o shape.
export type ExploreCompany = {
  id: string
  ticker: string
  name: string
  logoUrl: string | null
  sector: string
  industry: string
  description: string | null
  revenue: number | null
  netMargin: number | null
  roic: number | null
  ceo: string | null
  revenueSegments: unknown
  geographicFocus?: string | null
  bullCase?: string | null
  bearCase?: string | null
  swot?: unknown
  extraInfo?: string | null
}

type WatchlistDetail = { id: string; name: string; companies: ExploreCompany[] }

/**
 * OthersPanel — hub do card "Outros" no explore: empresas sem setor
 * atribuído (fix do bug de facet vs filtro em app/api/explore/route.ts) +
 * multi-watchlists nomeadas pelo utilizador (criar/renomear/apagar/ver).
 * Exceção aprovada ao "1 portfólio por user" do CLAUDE.md — aqui é
 * deliberadamente N listas por user, à parte do WatchlistItem flat do
 * botão "Seguir" (esse continua a viver em /api/watchlist).
 */
export function OthersPanel({
  onCompanyClick,
}: {
  onCompanyClick: (company: ExploreCompany) => void
}) {
  const t = useTranslations("explore.others")
  const tExplore = useTranslations("explore")

  const [companies, setCompanies] = useState<ExploreCompany[]>([])
  const [lists, setLists] = useState<WatchlistMeta[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedList, setSelectedList] = useState<WatchlistDetail | null>(null)
  const [listLoading, setListLoading] = useState(false)

  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const createInputRef = useRef<HTMLInputElement>(null)

  const loadHub = async () => {
    try {
      const [companiesRes, listsRes] = await Promise.all([
        fetch("/api/explore?sector=Unknown"),
        fetch("/api/watchlists"),
      ])
      const companiesJson = companiesRes.ok ? await companiesRes.json() : { companies: [] }
      const listsJson = listsRes.ok ? await listsRes.json() : { watchlists: [] }
      setCompanies(companiesJson.companies ?? [])
      setLists(listsJson.watchlists ?? [])
    } catch (err) {
      console.error("Failed to load 'Outros' hub", err)
      setCompanies([])
      setLists([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHub()
  }, [])

  const openList = async (id: string) => {
    setListLoading(true)
    try {
      const res = await fetch(`/api/watchlists/${id}`)
      if (res.ok) {
        setSelectedList(await res.json())
      }
    } catch (err) {
      console.error("Failed to load watchlist", err)
    } finally {
      setListLoading(false)
    }
  }

  const backToHub = () => setSelectedList(null)

  const createList = async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const res = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        setNewName("")
        await loadHub()
      }
    } catch (err) {
      console.error("Failed to create watchlist", err)
    } finally {
      setCreating(false)
    }
  }

  const startRename = (list: WatchlistMeta) => {
    setRenamingId(list.id)
    setRenameValue(list.name)
  }

  const confirmRename = async (id: string) => {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    try {
      await fetch(`/api/watchlists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      await loadHub()
    } catch (err) {
      console.error("Failed to rename watchlist", err)
    }
  }

  const deleteList = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm(t("deleteConfirm"))) return
    try {
      await fetch(`/api/watchlists/${id}`, { method: "DELETE" })
      if (selectedList?.id === id) setSelectedList(null)
      await loadHub()
    } catch (err) {
      console.error("Failed to delete watchlist", err)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Vista de uma lista específica
  if (selectedList) {
    return (
      <div className="space-y-6">
        <button
          onClick={backToHub}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} /> {t("backToHub")}
        </button>
        <h2 className="text-2xl font-semibold text-foreground">{selectedList.name}</h2>
        {listLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : selectedList.companies.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {selectedList.companies.map((c) => (
              <CompanyCard key={c.id} company={c} onClick={onCompanyClick} />
            ))}
          </div>
        ) : (
          <div className="glass rounded-xl p-8 text-center text-muted-foreground">{t("listEmpty")}</div>
        )}
      </div>
    )
  }

  const hasCompanies = companies.length > 0
  const hasLists = lists.length > 0

  return (
    <div className="space-y-10">
      {!hasCompanies && !hasLists && (
        <div className="glass space-y-3 rounded-2xl p-10 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">{t("emptyTitle")}</h3>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{t("emptyDesc")}</p>
          <button
            onClick={() => createInputRef.current?.focus()}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("create")}
          </button>
        </div>
      )}

      {hasCompanies && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground/90">{t("companiesTitle")}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {companies.map((c) => (
              <CompanyCard key={c.id} company={c} onClick={onCompanyClick} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-foreground/90">{t("watchlistsTitle")}</h3>
        <div className="space-y-2">
          {lists.map((list) => (
            <div
              key={list.id}
              className="glass flex items-center gap-3 rounded-xl px-4 py-3"
            >
              {renamingId === list.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename(list.id)
                    if (e.key === "Escape") setRenamingId(null)
                  }}
                  onBlur={() => confirmRename(list.id)}
                  maxLength={60}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
              ) : (
                <button
                  onClick={() => openList(list.id)}
                  className="flex-1 truncate text-left text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  {list.name}
                </button>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {tExplore("companiesCount", { count: list.count })}
              </span>
              <button
                onClick={() => startRename(list)}
                title={t("rename")}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => deleteList(list.id)}
                title={t("delete")}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-bear/10 hover:text-bear"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Row de criação — sempre visível no fim da lista */}
          <div className="glass flex items-center gap-2 rounded-xl px-4 py-3">
            <input
              ref={createInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createList()}
              placeholder={t("createPlaceholder")}
              maxLength={60}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <button
              onClick={createList}
              disabled={creating || !newName.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {t("createCta")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
