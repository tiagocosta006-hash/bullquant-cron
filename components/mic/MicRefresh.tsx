"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { RefreshCw } from "lucide-react"
import { useRouter } from "@/i18n/routing"
import { Button } from "@/components/ui/button"

export function MicRefresh() {
  const t = useTranslations("mic")
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button variant="outline" disabled={pending} onClick={() => start(() => router.refresh())}>
      <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden="true" />{t("refresh")}
    </Button>
  )
}
