import { Metadata } from "next"
import { BRAND } from "@/lib/brand"

export const metadata: Metadata = {
  title: `Explorar Mercado | ${BRAND.name}`,
  description: "Descubra novas empresas, explore setores e indústrias e encontre as melhores oportunidades de investimento baseadas em fundamentos sólidos.",
  alternates: {
    canonical: `${BRAND.siteUrl}/explore`,
  },
}

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
