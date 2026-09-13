"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { ArrowLeft, RotateCcw } from "lucide-react"

/**
 * Fronteira de erro do segmento de idioma.
 *
 * Não havia nenhuma — nem aqui nem em lado nenhum da app. Quando um Server
 * Component rebentava, o visitante ficava com a página crua do Next: fundo
 * branco, "Application error: a server-side exception has occurred", sem
 * marca, sem navegação e sem forma de tentar outra vez. Foi assim que as
 * rotas /fotos e /tamanho apareceram durante a auditoria — o erro era outro,
 * mas o que o utilizador via era isto.
 *
 * O `reset()` que o Next passa volta a montar o segmento sem recarregar a
 * página inteira, o que resolve a maioria dos casos transitórios (uma query
 * que expirou, uma leitura falhada) sem perder o estado do resto da app.
 *
 * O `digest` é o identificador que o Next põe no log do servidor. Mostra-se
 * porque é a única coisa que liga o que a pessoa viu ao que ficou registado
 * — sem ele, um relato de "deu erro" não se consegue investigar. Não expõe
 * nada: a mensagem real fica no servidor, de propósito.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations("errorPage")

  useEffect(() => {
    console.error("[error boundary]", error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-8 flex items-center justify-center rounded-full bg-destructive/10 px-6 py-2 text-destructive">
        <span className="font-semibold tracking-widest">{t("title")}</span>
      </div>

      <h1 className="mb-4 text-4xl font-extrabold tracking-[-0.02em] sm:text-5xl md:text-6xl">
        {t("heading")}
      </h1>

      <p className="mx-auto mb-10 max-w-[50ch] text-lg leading-relaxed text-muted-foreground">
        {t("description")}
      </p>

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <button
          onClick={reset}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition-all hover:scale-105 hover:bg-primary/90 active:scale-95 sm:w-auto"
        >
          <RotateCcw size={18} />
          {t("retry")}
        </button>
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-6 py-3.5 font-semibold text-foreground transition-all hover:scale-105 hover:bg-muted active:scale-95 sm:w-auto"
        >
          <ArrowLeft size={18} />
          {t("backHome")}
        </Link>
      </div>

      {error.digest && (
        <p className="mt-10 font-mono text-xs text-muted-foreground/60">
          {error.digest}
        </p>
      )}
    </div>
  )
}
