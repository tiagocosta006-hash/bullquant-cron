import { getTranslations } from 'next-intl/server'
import { CalendarDays, Info } from 'lucide-react'
import { EarningsCalendar } from '@/components/calendar/EarningsCalendar'
import { PageHeader, InfoNote } from '@/components/layout/PageHeader'
import { type Metadata } from 'next'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: `Calendário de Resultados | ${BRAND.name}`,
  description: `Acompanha as datas de apresentação de resultados (earnings) das 500 maiores empresas americanas. Nunca percas um earnings call do S&P 500 com o ${BRAND.name}.`,
  alternates: {
    canonical: `${BRAND.siteUrl}/calendar`,
  },
}

export default async function CalendarPage() {
  const t = await getTranslations('calendar')

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<CalendarDays className="h-6 w-6" />}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <InfoNote icon={<Info className="h-5 w-5" />}>{t('disclaimer')}</InfoNote>

      <EarningsCalendar />
    </div>
  )
}
