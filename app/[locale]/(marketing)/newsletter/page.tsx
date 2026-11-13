import { Link } from "@/i18n/routing"
import { getTranslations } from "next-intl/server"
import { CheckCircle2, MailX, XCircle } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { EmpresaDaSemanaForm } from "@/components/marketing/EmpresaDaSemanaForm"
import { cn } from "@/lib/utils"

export const metadata = { title: "A empresa da semana", robots: { index: false } }

/**
 * Destino dos links de confirmar e de sair (app/api/newsletter/*), e página
 * simples para quem quer inscrever-se. Sem estado: só o formulário.
 */
export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>
}) {
  const { estado = "" } = await searchParams
  const t = await getTranslations("newsletter.page")
  const conhecido = estado === "confirmado" || estado === "saiu" || estado === "invalido"
  const Icone = estado === "confirmado" ? CheckCircle2 : estado === "saiu" ? MailX : XCircle

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      {conhecido && (
        <div className="flex flex-col items-center gap-3">
          <Icone className={cn("h-10 w-10", estado === "confirmado" ? "text-bull" : "text-muted-foreground")} />
          <h1 className="text-2xl font-extrabold tracking-tight">{t(`${estado}Title`)}</h1>
          <p className="text-muted-foreground">{t(`${estado}Text`)}</p>
          {estado === "confirmado" && (
            <Link href="/stock/AAPL" className={cn(buttonVariants(), "mt-2 font-semibold")}>
              {t("ctaDemo")}
            </Link>
          )}
        </div>
      )}
      {estado !== "confirmado" && <EmpresaDaSemanaForm origem="newsletter" className="w-full" />}
    </main>
  )
}
