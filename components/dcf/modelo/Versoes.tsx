"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Loader2, Trash2, History } from "lucide-react"
import { correrCenarios, type ConjuntoCenarios } from "@/lib/finance/modelo"
import type { ContextoSeparador } from "./Separadores"
import { useFormatos } from "./TabelaModelo"

/**
 * Versões guardadas do modelo na base de dados (por utilizador e empresa).
 * Cada gravação é uma versão nova; carregar uma versão substitui o rascunho
 * atual, por isso pede confirmação se houver alterações por guardar.
 */

type Versao = {
  id: string; versao: number; titulo: string | null; tese: string | null; cenarioAtivo: string
  valorPorAcao: number | null; valorEsperado: number | null; precoAoGuardar: number | null; createdAt: string
}

export function VersoesGuardadas({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo.versoes")
  const { fmt } = useFormatos()
  const [versoes, setVersoes] = React.useState<Versao[] | null>(null)
  const [titulo, setTitulo] = React.useState("")
  const [a, setA] = React.useState<string | null>(null)
  const [msg, setMsg] = React.useState<{ ok: boolean; texto: string } | null>(null)

  const [recarga, setRecarga] = React.useState(0)
  const carregarLista = async () => setRecarga((n) => n + 1)
  React.useEffect(() => {
    let vivo = true
    fetch(`/api/dcf/modelos?ticker=${encodeURIComponent(c.ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ versoes?: Versao[] }>) : null))
      .then((d) => { if (vivo) setVersoes(d ? d.versoes ?? [] : null) })
      .catch(() => { if (vivo) setVersoes(null) })
    return () => { vivo = false }
  }, [c.ticker, recarga])

  const guardar = async () => {
    setA("guardar"); setMsg(null)
    try {
      const base = c.historico[c.historico.length - 1]
      const cen = correrCenarios(base, c.conjunto, c.mercado, c.fracaoAno1, c.anosAteFimAno1)
      const r = await fetch("/api/dcf/modelos", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: c.ticker, titulo: titulo.trim() || undefined, conjunto: c.conjunto,
          valorPorAcao: c.avaliacao.valido ? c.avaliacao.valorPorAcao : null, valorEsperado: cen.esperado, preco: c.mercado.preco || null,
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const d = (await r.json()) as { versao: number }
      setTitulo(""); setMsg({ ok: true, texto: t("guardada", { n: d.versao }) })
      await carregarLista()
    } catch { setMsg({ ok: false, texto: t("erroGuardar") }) } finally { setA(null) }
  }

  const abrir = async (v: Versao) => {
    if (!window.confirm(t("confirmarCarregar", { n: v.versao }))) return
    setA(v.id); setMsg(null)
    try {
      const r = await fetch(`/api/dcf/modelos/${v.id}`, { cache: "no-store" })
      if (!r.ok) throw new Error(String(r.status))
      const d = (await r.json()) as { conjunto: ConjuntoCenarios }
      c.onCarregarConjunto(d.conjunto)
      setMsg({ ok: true, texto: t("carregada", { n: v.versao }) })
    } catch { setMsg({ ok: false, texto: t("erroCarregar") }) } finally { setA(null) }
  }

  const apagar = async (v: Versao) => {
    if (!window.confirm(t("confirmarApagar", { n: v.versao }))) return
    setA(v.id)
    try {
      await fetch(`/api/dcf/modelos/${v.id}`, { method: "DELETE" })
      await carregarLista()
    } finally { setA(null) }
  }

  // Sem sessão PRO a lista não existe; o resto do Summary continua a funcionar.
  if (versoes === null) return null

  return (
    <section className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold tracking-tight">{t("titulo")}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{t("ajuda")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} placeholder={t("nomePlaceholder")}
          className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
        <button type="button" onClick={guardar} disabled={a !== null}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">
          {a === "guardar" && <Loader2 className="h-4 w-4 animate-spin" />}{t("guardar")}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-bull" : "text-bear"}`}>{msg.texto}</span>}
      </div>
      {versoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("vazio")}</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {versoes.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">v{v.versao}{v.titulo ? ` · ${v.titulo}` : ""}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.createdAt).toLocaleDateString()} · {t("valia", { valor: v.valorPorAcao === null ? "N/A" : `$${fmt(v.valorPorAcao, "anos")}`, preco: v.precoAoGuardar === null ? "N/A" : `$${fmt(v.precoAoGuardar, "anos")}` })}
                </p>
                {v.tese && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{v.tese}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => abrir(v)} disabled={a !== null} className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted/60 disabled:opacity-60">{t("abrir")}</button>
                <button type="button" onClick={() => apagar(v)} disabled={a !== null} aria-label={t("apagar")} className="rounded-md p-1.5 text-muted-foreground hover:text-bear disabled:opacity-60"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
