import { getTranslations } from "next-intl/server"
import { Calculator, Info } from "lucide-react"
import { DcfCalculator } from "@/components/dcf/DcfCalculator"
import { PageHeader, InfoNote } from "@/components/layout/PageHeader"

export default async function DcfPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>
}) {
  const t = await getTranslations("dcf")
  const resolvedParams = await searchParams
  const defaultTicker = resolvedParams.ticker

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Calculator className="h-6 w-6" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <InfoNote icon={<Info className="h-5 w-5" />}>{t("educationalWarning")}</InfoNote>

      <DcfCalculator defaultTicker={defaultTicker} />
    </div>
  )
}
