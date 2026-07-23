import { getTranslations } from "next-intl/server"
import { TrendingUp, Info } from "lucide-react"
import { CompoundInterestCalculator } from "@/components/calculators/CompoundInterestCalculator"
import { PageHeader, InfoNote } from "@/components/layout/PageHeader"

export default async function CompoundInterestPage() {
  const t = await getTranslations("compound")

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<TrendingUp className="h-6 w-6" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <CompoundInterestCalculator />
    </div>
  )
}
