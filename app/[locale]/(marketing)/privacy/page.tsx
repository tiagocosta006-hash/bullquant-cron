import { getLocale } from "next-intl/server"
import { LegalDocument } from "@/components/legal/LegalDocument"
import { PRIVACIDADE } from "@/lib/legal/privacidade"
import { LEGAL } from "@/lib/legal/config"

async function idioma(): Promise<"pt" | "en"> {
  return (await getLocale()) === "en" ? "en" : "pt"
}

export async function generateMetadata() {
  const d = PRIVACIDADE[await idioma()]
  return { title: `${d.titulo} | ${LEGAL.marca}`, description: d.descricao }
}

export default async function Page() {
  const locale = await idioma()
  return <LegalDocument doc={PRIVACIDADE[locale]} chave="privacidade" locale={locale} comIdentificacao={true} />
}
