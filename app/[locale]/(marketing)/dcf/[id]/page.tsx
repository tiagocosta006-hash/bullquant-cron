import { notFound } from "next/navigation"
import { Metadata } from "next"
import { Link } from '@/i18n/routing';
import { getTranslations } from "next-intl/server"
import { ArrowRight, Calculator } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { runDcf } from "@/lib/finance/dcf"
import { DcfResults } from "@/components/dcf/DcfResults"
import { BrandMark } from "@/components/brand/BrandMark"
import { buttonVariants } from "@/components/ui/button"
import { DownloadDcfImageButton } from "@/components/dcf/DownloadDcfImageButton"
import { cn } from "@/lib/utils"
import { BRAND } from "@/lib/brand"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  const analysis = await prisma.dcfAnalysis.findUnique({
    where: { id },
    include: { company: true },
  })

  if (!analysis || !analysis.isPublic) {
    return { title: "Análise não encontrada | BullValue" }
  }

  const ticker = analysis.company.ticker
  const title = `Cenário DCF: ${ticker} | ${BRAND.name}`
  const description = `Cenário de DCF da ${ticker} criado por um utilizador da ${BRAND.name}, com os pressupostos dele. Não é recomendação de investimento.`

  // Use the OpenGraph dynamic image endpoint that we will create next
  const ogUrl = new URL(`${BRAND.siteUrl}/api/og/dcf/${id}`)

  return {
    title,
    description,
    // Conteúdo de um utilizador: não se indexa nos motores de pesquisa.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      images: [
        {
          url: ogUrl.toString(),
          width: 1200,
          height: 630,
          alt: `Análise DCF de ${ticker}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl.toString()],
    },

  }
}

export default async function PublicDcfPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const analysis = await prisma.dcfAnalysis.findUnique({
    where: { id },
    include: { company: true, user: true },
  })

  if (!analysis || !analysis.isPublic) {
    notFound()
  }

  const t = await getTranslations("dcf")

  // Reconstruct the result object
  const inputs = {
    fcf0: Number(analysis.fcf0),
    growthStage1: Number(analysis.growthStage1),
    growthStage2: Number(analysis.growthStage2),
    wacc: Number(analysis.wacc),
    terminalGrowth: Number(analysis.terminalGrowth),
    shares: Number(analysis.shares),
    netDebt: Number(analysis.netDebt),
    currentPrice: Number(analysis.priceAtSave ?? 0),
    mode: (analysis.fcfMode as "FCFF" | "FCFE") ?? "FCFF",
  }

  const result = runDcf(inputs)
  const currency = analysis.company.currency === "EUR" ? "€" : "$"

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 md:py-20 flex flex-col items-center">
      
      {/* Header */}
      <div className="mb-10 text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <BrandMark className="h-10 w-10 rounded-xl" />
          <h1 className="text-3xl font-bold tracking-tight">
            {analysis.company.name} <span className="text-muted-foreground">({analysis.company.ticker})</span>
          </h1>
        </div>
        <p className="text-muted-foreground">
          {analysis.label ? `"${analysis.label}"` : "Cenário criado por um utilizador"}
        </p>
        <div className="pt-2">
          <DownloadDcfImageButton id={id} ticker={analysis.company.ticker} />
        </div>
      </div>

      {/* Results Card */}
      <div className="w-full mb-12">
        <DcfResults result={result} currency={currency} mode={inputs.mode} />
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t("sharedNotice")}{" "}
          <a href={`mailto:suporte@thebullvalue.com?subject=${encodeURIComponent(`Denúncia de conteúdo: DCF ${id}`)}`} className="underline underline-offset-4">{t("reportContent")}</a>
        </p>
      </div>

      {/* Assumptions Grid */}
      <div className="w-full bg-card/40 border border-border/50 rounded-2xl p-6 mb-12">
        <h3 className="text-sm font-semibold mb-6 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          Premissas do Modelo
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Assumption label="Crescimento (Anos 1-5)" value={`${(inputs.growthStage1 * 100).toFixed(1)}%`} />
          <Assumption label="Crescimento (Anos 6-10)" value={`${(inputs.growthStage2 * 100).toFixed(1)}%`} />
          <Assumption label="WACC (Taxa Desconto)" value={`${(inputs.wacc * 100).toFixed(2)}%`} />
          <Assumption label="Cresc. Terminal" value={`${(inputs.terminalGrowth * 100).toFixed(1)}%`} />
        </div>
      </div>

      {/* CTA Section */}
      <div className="glass rounded-3xl p-8 text-center flex flex-col items-center gap-4 w-full">
        <h2 className="text-xl font-bold">Cria as tuas próprias análises</h2>
        <p className="text-muted-foreground max-w-[40ch] text-sm">
          O BullValue permite-te aceder a 10 anos de dados financeiros da SEC e calcular modelos DCF em segundos.
        </p>
        <Link
          href="/pricing"
          className={cn(buttonVariants({ size: "lg" }), "mt-4 font-semibold px-8")}
        >
          Subscrever PRO <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </div>

    </div>
  )
}

function Assumption({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
