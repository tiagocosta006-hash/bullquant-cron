"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save, AlertCircle, CheckCircle2 } from "lucide-react"

const COMMENTARY_TYPES = [
  { id: "WEEKLY_BRIEFING", label: "Briefing Semanal (Topo da Página)" },
  { id: "YIELD_CURVE", label: "Nota: Curva de Rendimentos" },
  { id: "CPI", label: "Nota: Inflação (CPI)" },
  { id: "GDP", label: "Nota: Crescimento (PIB)" },
  { id: "UNEMPLOYMENT", label: "Nota: Desemprego" },
  { id: "VIX", label: "Nota: Volatilidade (VIX)" }
]

export default function MacroAdminPage() {
  const [data, setData] = useState<Record<string, { content: string; updatedAt: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  useEffect(() => {
    fetch("/api/macro/commentary")
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  const handleSave = async (type: string, content: string) => {
    setSaving(type)
    setStatus(null)
    try {
      const res = await fetch("/api/macro/commentary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content }),
      })
      if (!res.ok) throw new Error("Failed to save")
      
      const updated = await res.json()
      setData(prev => ({
        ...prev,
        [type]: { content: updated.content, updatedAt: updated.updatedAt }
      }))
      setStatus({ type: "success", msg: "Guardado com sucesso!" })
      setTimeout(() => setStatus(null), 3000)
    } catch (err) {
      setStatus({ type: "error", msg: "Erro ao guardar. Tenta novamente." })
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Macro Backoffice</h1>
        <p className="text-muted-foreground mt-2">
          Gere os teus textos e opiniões económicas. As alterações feitas aqui refletem-se instantaneamente na página Macro para todos os utilizadores.
        </p>
      </div>

      {status && (
        <div className={`mb-6 flex items-center gap-2 rounded-lg p-4 text-sm font-medium ${status.type === 'success' ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
          {status.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {status.msg}
        </div>
      )}

      <div className="space-y-8">
        {COMMENTARY_TYPES.map((ct) => {
          const currentContent = data[ct.id]?.content || ""
          const isSaving = saving === ct.id

          return (
            <div key={ct.id} className="glass rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{ct.label}</h3>
                {data[ct.id]?.updatedAt && (
                  <span className="text-xs text-muted-foreground">
                    Última atualização: {new Date(data[ct.id].updatedAt).toLocaleString()}
                  </span>
                )}
              </div>
              <textarea
                className="w-full min-h-[150px] rounded-md border border-border bg-background/50 p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                defaultValue={currentContent}
                placeholder="Escreve a tua análise aqui..."
                id={`textarea-${ct.id}`}
              />
              <div className="flex justify-end">
                <button
                  disabled={isSaving}
                  onClick={() => {
                    const el = document.getElementById(`textarea-${ct.id}`) as HTMLTextAreaElement
                    if (el) handleSave(ct.id, el.value)
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? "A guardar..." : "Publicar"}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
