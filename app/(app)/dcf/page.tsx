import { getTranslations } from "next-intl/server"
import { Info } from "lucide-react"
import { DcfCalculator } from "@/components/dcf/DcfCalculator"

export default async function DcfPage() {
  const t = await getTranslations("dcf")

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground leading-relaxed">{t("educationalWarning")}</p>
      </div>

      <DcfCalculator />
    </div>
  )
}
