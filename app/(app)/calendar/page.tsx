import { getTranslations } from 'next-intl/server'
import { CalendarDays, Info } from 'lucide-react'
import { EarningsCalendar } from '@/components/calendar/EarningsCalendar'

export default async function CalendarPage() {
  const t = await getTranslations('calendar')

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground leading-relaxed">{t('disclaimer')}</p>
      </div>

      <EarningsCalendar />
    </div>
  )
}
