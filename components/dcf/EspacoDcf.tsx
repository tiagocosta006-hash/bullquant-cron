"use client"

import * as React from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import { Link } from "@/i18n/routing"

/**
 * O "espaço" do DCF: seletor de modo (Simple / Advanced), botão de ecrã
 * inteiro e o aviso educativo no fim.
 *
 * Em ecrã inteiro o DCF cobre o site (menu incluído), como uma secção à
 * parte. O estado fica na sessão do browser para sobreviver à mudança de
 * modo, que é uma navegação. Esc sai.
 */

type Modo = "simples" | "modelo"
const CHAVE = "bv-dcf-fullscreen"

export function EspacoDcf({
  modo, hrefs, rotulos, aviso, children,
}: {
  modo: Modo | "rapida"
  hrefs: Record<Modo, { pathname: "/dcf"; query: Record<string, string> }>
  rotulos: { modos: Record<Modo, string>; entrar: string; sair: string; titulo: string }
  aviso: string
  children: React.ReactNode
}) {
  const [ecraInteiro, setEcraInteiro] = React.useState(false)

  React.useEffect(() => {
    try { setEcraInteiro(sessionStorage.getItem(CHAVE) === "1") } catch { /* sem armazenamento */ }
  }, [])

  const mudar = React.useCallback((v: boolean) => {
    setEcraInteiro(v)
    try { v ? sessionStorage.setItem(CHAVE, "1") : sessionStorage.removeItem(CHAVE) } catch { /* */ }
  }, [])

  React.useEffect(() => {
    if (!ecraInteiro) return
    const antes = document.body.style.overflow
    document.body.style.overflow = "hidden"
    // Fase de captura: outros atalhos globais do site consomem o Esc antes
    // de ele chegar a um ouvinte normal. Um Esc dentro de um campo em edição
    // fica para o campo (cancela a edição).
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return
      mudar(false)
    }
    window.addEventListener("keydown", tecla, true)
    return () => { document.body.style.overflow = antes; window.removeEventListener("keydown", tecla, true) }
  }, [ecraInteiro, mudar])

  const seletor = (
    <div className="flex w-fit gap-1 rounded-xl border border-border/50 bg-muted/40 p-1">
      {(["simples", "modelo"] as const).map((m) => (
        <Link key={m} href={hrefs[m]}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${modo === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          {rotulos.modos[m]}
        </Link>
      ))}
    </div>
  )
  const botao = (
    <button type="button" onClick={() => mudar(!ecraInteiro)}
      className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      title={ecraInteiro ? `${rotulos.sair} (Esc)` : rotulos.entrar}>
      {ecraInteiro ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      {ecraInteiro ? rotulos.sair : rotulos.entrar}
    </button>
  )
  const rodape = <p className="pt-2 text-xs leading-relaxed text-muted-foreground/70">{aviso}</p>

  if (ecraInteiro) {
    return (
      <div data-dcf-ecra-inteiro className="fixed inset-0 z-[100] overflow-y-auto bg-background">
        <div className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="flex items-center gap-4">
              <span className="text-base font-bold tracking-tight">{rotulos.titulo}</span>
              {seletor}
            </div>
            {botao}
          </div>
        </div>
        <div className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
          {children}
          {rodape}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {seletor}
        {botao}
      </div>
      {children}
      {rodape}
    </div>
  )
}
