import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PeerComparisonDashboard } from '@/components/compare/PeerComparisonDashboard'

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>
}) {
  const resolvedParams = await searchParams
  const { ticker } = resolvedParams

  if (!ticker) {
    // Se não houver ticker, redirecionamos ou mostramos um ecrã para escolher
    return (
      <div className="container max-w-7xl mx-auto py-16 px-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight mb-4">Batalha de Pares (Peer Comparison)</h1>
        <p className="text-muted-foreground">Por favor, aceda a esta página a partir de uma empresa para iniciar a comparação com a sua indústria.</p>
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

  // Busca todos os concorrentes diretos (mesma industry)
  const allPeers = await prisma.company.findMany({
    where: {
      industry: baseCompany.industry,
      ticker: {
        not: baseCompany.ticker
      }
    },
    orderBy: {
      name: 'asc'
    }
  })

  // Busca os dados fundamentais para a empresa base
  const baseFundamentals = await prisma.fundamental.findMany({
    where: {
      companyId: baseCompany.id,
      periodType: 'ANNUAL'
    },
    orderBy: {
      periodEnd: 'asc'
    }
  })

  // Busca os dados fundamentais dos pares (apenas os necessários para a lista inicial, ou todos se a lista for pequena)
  // Para otimizar, o Dashboard vai fazer o fetch do peer selecionado no lado do cliente, ou passamos tudo de uma vez.
  // Como as indústrias podem ter entre 2 a 15 empresas, vamos passar os peers (nome, ticker) e o dashboard faz fetch dos fundamentais.
  
  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Análise de Pares: {baseCompany.industry}</h1>
        <p className="text-muted-foreground">
          Comparação direta de múltiplos e desempenho dentro da mesma sub-indústria GICS.
        </p>
      </div>

      <PeerComparisonDashboard 
        baseCompany={baseCompany} 
        baseFundamentals={baseFundamentals}
        availablePeers={allPeers}
      />
    </div>
  )
}
