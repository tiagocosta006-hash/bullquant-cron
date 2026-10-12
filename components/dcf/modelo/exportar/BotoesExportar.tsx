"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react"
import type { ContextoSeparador } from "../Separadores"
import { useFormatos } from "../TabelaModelo"

/** PDF e Excel só são carregados ao clicar: o @react-pdf e o exceljs são pesados. */
export function BotoesExportar({ c }: { c: ContextoSeparador }) {
  const t = useTranslations("dcfModelo")
  const { fmt } = useFormatos()
  const [a, setA] = React.useState<"pdf" | "xlsx" | null>(null)
  const [erro, setErro] = React.useState(false)
  const nome = `${c.ticker.toLowerCase()}-dcf-${c.cenario}`

  const guardar = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob)
    const el = document.createElement("a")
    el.href = url
    el.download = `${nome}.${ext}`
    el.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const tt = (k: string, v?: Record<string, string | number>) => t(k, v)

  const pdf = async () => {
    setA("pdf"); setErro(false)
    try {
      const [{ pdf }, { ResumoPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./ResumoPdf")])
      const blob = await pdf(<ResumoPdf c={c} t={tt} fmt={fmt} geradoEm={new Date().toISOString().slice(0, 10)} />).toBlob()
      guardar(blob, "pdf")
    } catch { setErro(true) } finally { setA(null) }
  }
  const xlsx = async () => {
    setA("xlsx"); setErro(false)
    try {
      const { exportarExcel } = await import("./excel")
      guardar(await exportarExcel(c, tt), "xlsx")
    } catch { setErro(true) } finally { setA(null) }
  }
  const cls = "flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/60 disabled:opacity-60"
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={pdf} disabled={a !== null} className={cls}>
        {a === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{t("resumo.exportarPdf")}
      </button>
      <button type="button" onClick={xlsx} disabled={a !== null} className={cls}>
        {a === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}{t("resumo.exportarExcel")}
      </button>
      {erro && <span className="text-xs text-bear">{t("resumo.erroExportar")}</span>}
    </div>
  )
}
