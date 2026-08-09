import { getTranslations } from 'next-intl/server'
import { CalendarDays, Info } from 'lucide-react'
import { EarningsCalendar } from '@/components/calendar/EarningsCalendar'
import { PageHeader, InfoNote } from '@/components/layout/PageHeader'
import { type Metadata } from 'next'
import { BRAND } from '@/lib/brand'
import { getUser } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { isDevUnlocked } from "@/lib/devAccess"
import { ProGate } from "@/components/ui/ProGate"

export const metadata: Metadata = {
  title: `Calendário de Resultados | ${BRAND.name}`,
  description: `Acompanha as datas de apresentação de resultados (earnings) das 500 maiores empresas americanas. Nunca percas um earnings call do S&P 500 com o ${BRAND.name}.`,
}

export default async function CalendarPage() {
  const t = await getTranslations('calendar')

  const user = await getUser()
  const dbUser = user ? await prisma.user.findUnique({ where: { id: user.id } }) : null
  const devUnlocked = isDevUnlocked()
  
  const isPro = dbUser?.plan === "PRO" || devUnlocked
  const isLoggedIn = !!user || devUnlocked

  return (
    <div className="space-y-6 relative min-h-[60vh]">
      <PageHeader
        icon={<CalendarDays className="h-6 w-6" />}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <InfoNote icon={<Info className="h-5 w-5" />}>{t('disclaimer')}</InfoNote>

      {!isPro && (
        <ProGate isPro={isPro} isLoggedIn={isLoggedIn} />
      )}
      <div className={!isPro ? "pointer-events-none select-none" : ""}>
        <EarningsCalendar />
      </div>
    </div>
  )
}
