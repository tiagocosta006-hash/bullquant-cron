import { getLocale } from "next-intl/server"
import { LegalDocument } from "@/components/legal/LegalDocument"
import { AVISO_LEGAL } from "@/lib/legal/avisoLegal"
import { LEGAL } from "@/lib/legal/config"

async function idioma(): Promise<"pt" | "en"> {
  return (await getLocale()) === "en" ? "en" : "pt"
}

export async function generateMetadata() {
  const d = AVISO_LEGAL[await idioma()]
  return { title: `${d.titulo} | ${LEGAL.marca}`, description: d.descricao }
}

export default async function Page() {
  const locale = await idioma()
  return <LegalDocument doc={AVISO_LEGAL[locale]} chave="avisoLegal" locale={locale} comIdentificacao={true} />
}
