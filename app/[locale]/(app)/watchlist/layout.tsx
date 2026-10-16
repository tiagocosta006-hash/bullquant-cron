import { exigirPlanoProNaPagina } from "@/lib/api/planoPro"

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirPlanoProNaPagina()
  return children
}
