import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Explorar Mercado | BullQuant",
  description: "Descubra novas empresas, explore setores e indústrias e encontre as melhores oportunidades de investimento baseadas em fundamentos sólidos.",
}

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
