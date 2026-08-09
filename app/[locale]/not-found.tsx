"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { ArrowLeft, Compass } from "lucide-react"

export default function NotFoundPage() {
  const t = useTranslations("notFound")

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-8 flex items-center justify-center rounded-full bg-primary/10 px-6 py-2 text-primary">
        <span className="font-semibold tracking-widest">{t("title")}</span>
      </div>
      
      <h1 className="mb-4 text-4xl font-extrabold tracking-[-0.02em] sm:text-5xl md:text-6xl">
        {t("heading")}
      </h1>
      
      <p className="mx-auto mb-10 max-w-[50ch] text-lg text-muted-foreground leading-relaxed">
        {t("description")}
      </p>
      
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 sm:w-auto"
        >
          <ArrowLeft size={18} />
          {t("backHome")}
        </Link>
        <Link
          href="/explore"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-6 py-3.5 font-semibold text-foreground transition-all hover:bg-muted hover:scale-105 active:scale-95 sm:w-auto"
        >
          <Compass size={18} />
          {t("explore")}
        </Link>
      </div>
    </div>
  )
}
