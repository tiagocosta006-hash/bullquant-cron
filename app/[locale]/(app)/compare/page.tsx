import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { GitCompareArrows } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { PeerComparisonDashboard } from '@/components/compare/PeerComparisonDashboard'
import { PageHeader } from '@/components/layout/PageHeader'
import { getUser } from "@/lib/supabase/server"
import { isDevUnlocked } from "@/lib/devAccess"
import { ProGate } from "@/components/ui/ProGate"

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>
}) {
  const t = await getTranslations('compare')
  const resolvedParams = await searchParams
  const { ticker } = resolvedParams

  if (!ticker) {
    // Se não houver ticker, mostramos um ecrã para escolher a partir de uma empresa
    return (
      <div className="glass mx-auto max-w-2xl rounded-3xl p-12 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <GitCompareArrows className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight mb-3">{t('emptyTitle')}</h1>
        <p className="text-muted-foreground">{t('emptyDesc')}</p>
      </div>
    )
  }

  // Busca a empresa base
  const baseCompany = await prisma.company.findUnique({
    where: {
      ticker: ticker.toUpperCase(),
    },
  })

  if (!baseCompany) {
    notFound()
  }

  // Paraleliza as queries pesadas e seleciona apenas o necessário para os peers
  const [allPeers, baseFundamentals] = await Promise.all([
    prisma.company.findMany({
      where: {
        industry: baseCompany.industry,
        ticker: { not: baseCompany.ticker }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.fundamental.findMany({
      where: {
        companyId: baseCompany.id,
        periodType: 'ANNUAL'
      },
      orderBy: { periodEnd: 'asc' }
    })
  ])

  // Busca os dados fundamentais dos pares (apenas os necessários para a lista inicial, ou todos se a lista for pequena)
  // Para otimizar, o Dashboard vai fazer o fetch do peer selecionado no lado do cliente, ou passamos tudo de uma vez.
  // Como as indústrias podem ter entre 2 a 15 empresas, vamos passar os peers (nome, ticker) e o dashboard faz fetch dos fundamentais.
  
  const user = await getUser()
  const dbUser = user ? await prisma.user.findUnique({ where: { id: user.id } }) : null
  const devUnlocked = isDevUnlocked()
  
  const isPro = dbUser?.plan === "PRO" || devUnlocked
  const isLoggedIn = !!user || devUnlocked

  return (
    <div className="space-y-8 relative min-h-[70vh]">
      <PageHeader
        icon={<GitCompareArrows className="h-6 w-6" />}
        title={t('title', { industry: baseCompany.industry ?? '' })}
        subtitle={t('subtitle')}
      />

      {!isPro && (
        <ProGate isPro={isPro} isLoggedIn={isLoggedIn} />
      )}
      <div className={!isPro ? "pointer-events-none select-none" : ""}>
        <PeerComparisonDashboard
          baseCompany={baseCompany} 
          baseFundamentals={baseFundamentals}
          availablePeers={allPeers}
        />
      </div>
    </div>
  )
}
