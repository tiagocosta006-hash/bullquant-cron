import { getTranslations } from "next-intl/server"
import { Calculator, Info } from "lucide-react"
import { DcfCalculator } from "@/components/dcf/DcfCalculator"
import { PageHeader, InfoNote } from "@/components/layout/PageHeader"
import { getUser } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { isDevUnlocked } from "@/lib/devAccess"
import { ProGate } from "@/components/ui/ProGate"

export default async function DcfPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>
}) {
  const t = await getTranslations("dcf")
  const resolvedParams = await searchParams
  const user = await getUser()

  // Demo pública: anónimo usa a calculadora à vontade, mas trancada à Apple —
  // ignora qualquer ?ticker= da query, força sempre AAPL.
  const locked = !user
  const defaultTicker = locked ? "AAPL" : resolvedParams.ticker

  const dbUser = user ? await prisma.user.findUnique({ where: { id: user.id } }) : null
  const devUnlocked = isDevUnlocked()
  
  const isPro = dbUser?.plan === "PRO" || devUnlocked
  const isLoggedIn = !!user || devUnlocked

  return (
    <div className="space-y-6 relative min-h-[70vh]">
      <PageHeader
        icon={<Calculator className="h-6 w-6" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <InfoNote icon={<Info className="h-5 w-5" />}>{t("educationalWarning")}</InfoNote>

      {!isPro && (
        <ProGate isPro={isPro} isLoggedIn={isLoggedIn} />
      )}
      <div className={!isPro ? "pointer-events-none select-none" : ""}>
        <DcfCalculator defaultTicker={defaultTicker} locked={locked} />
      </div>
    </div>
  )
}
