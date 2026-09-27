import { getTranslations } from "next-intl/server"
import { Calculator } from "lucide-react"
import { DcfCalculator } from "@/components/dcf/DcfCalculator"
import { ModeloDcf } from "@/components/dcf/modelo/ModeloDcf"
import { DcfSimples } from "@/components/dcf/simples/DcfSimples"
import { EspacoDcf } from "@/components/dcf/EspacoDcf"
import { PageHeader } from "@/components/layout/PageHeader"
import { getUser } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { isDevUnlocked } from "@/lib/devAccess"
import { ProGate } from "@/components/ui/ProGate"

export default async function DcfPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string; modo?: string }>
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
  // DCF simples (estilo Qualtrim) por omissão; o modelo avançado (FMVA) ao
  // lado. A calculadora rápida antiga sai do menu mas continua por URL
  // (?modo=rapida), porque os DCFs guardados abrem nela.
  const modo = resolvedParams.modo === "modelo" ? "modelo" : resolvedParams.modo === "rapida" ? "rapida" : "simples"
  const tModo = await getTranslations("dcfModelo")
  const hrefModo = (m: "simples" | "modelo") => ({
    pathname: "/dcf" as const,
    query: { ...(m === "modelo" ? { modo: "modelo" } : {}), ...(defaultTicker ? { ticker: defaultTicker } : {}) } as Record<string, string>,
  })

  return (
    <div className="space-y-6 relative min-h-[70vh]">
      <PageHeader
        icon={<Calculator className="h-6 w-6" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {!isPro && (
        <ProGate isPro={isPro} isLoggedIn={isLoggedIn} />
      )}
      {/* O aviso educativo é obrigatório (CLAUDE.md §10.5): sai da caixa do
          topo para uma linha discreta no fim, a pedido do Costa. */}
      <EspacoDcf
        modo={modo}
        hrefs={{ simples: hrefModo("simples"), modelo: hrefModo("modelo") }}
        rotulos={{
          modos: { simples: tModo("modos.simples"), modelo: tModo("modos.modelo") },
          entrar: tModo("ecraInteiro.entrar"),
          sair: tModo("ecraInteiro.sair"),
          titulo: tModo("ecraInteiro.titulo"),
        }}
        aviso={t("educationalWarning")}
      >
        <div className={!isPro ? "pointer-events-none select-none" : ""}>
          {modo === "simples" && <DcfSimples defaultTicker={defaultTicker} locked={locked} />}
          {modo === "modelo" && <ModeloDcf defaultTicker={defaultTicker} locked={locked} />}
          {modo === "rapida" && <DcfCalculator defaultTicker={defaultTicker} locked={locked} />}
        </div>
      </EspacoDcf>
    </div>
  )
}
