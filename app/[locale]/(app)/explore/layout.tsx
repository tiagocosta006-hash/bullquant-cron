import { Metadata } from "next"
import { BRAND } from "@/lib/brand"
import { getUser } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { isDevUnlocked } from "@/lib/devAccess"
import { ProGate } from "@/components/ui/ProGate"

export const metadata: Metadata = {
  title: `Explorar Mercado | ${BRAND.name}`,
  description: "Descubra novas empresas, explore setores e indústrias e encontre as melhores oportunidades de investimento baseadas em fundamentos sólidos.",
}

export default async function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  const dbUser = user ? await prisma.user.findUnique({ where: { id: user.id } }) : null
  const devUnlocked = isDevUnlocked()
  
  const isPro = dbUser?.plan === "PRO" || devUnlocked
  const isLoggedIn = !!user || devUnlocked

  return (
    <div className="relative min-h-[70vh]">
      {!isPro && (
        <ProGate isPro={isPro} isLoggedIn={isLoggedIn} />
      )}
      <div className={!isPro ? "pointer-events-none select-none" : ""}>
        {children}
      </div>
    </div>
  )
}
