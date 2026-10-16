import { getLocale } from "next-intl/server"
import { LegalDocument } from "@/components/legal/LegalDocument"
import { COOKIES } from "@/lib/legal/cookies"
import { LEGAL } from "@/lib/legal/config"

async function idioma(): Promise<"pt" | "en"> {
  return (await getLocale()) === "en" ? "en" : "pt"
}

export async function generateMetadata() {
  const d = COOKIES[await idioma()]
  return { title: `${d.titulo} | ${LEGAL.marca}`, description: d.descricao }
}

export default async function Page() {
  const locale = await idioma()
  return <LegalDocument doc={COOKIES[locale]} chave="cookies" locale={locale} comIdentificacao={false} />
}
