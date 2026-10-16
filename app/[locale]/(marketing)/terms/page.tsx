import { getLocale } from "next-intl/server"
import { LegalDocument } from "@/components/legal/LegalDocument"
import { TERMOS } from "@/lib/legal/termos"
import { LEGAL } from "@/lib/legal/config"

async function idioma(): Promise<"pt" | "en"> {
  return (await getLocale()) === "en" ? "en" : "pt"
}

export async function generateMetadata() {
  const d = TERMOS[await idioma()]
  return { title: `${d.titulo} | ${LEGAL.marca}`, description: d.descricao }
}

export default async function Page() {
  const locale = await idioma()
  return <LegalDocument doc={TERMOS[locale]} chave="termos" locale={locale} comIdentificacao={true} />
}
