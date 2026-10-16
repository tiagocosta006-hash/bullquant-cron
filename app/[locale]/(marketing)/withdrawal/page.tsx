import { getLocale } from "next-intl/server"
import { Link } from "@/i18n/routing"
import { WithdrawalForm } from "@/components/legal/WithdrawalForm"
import { LEGAL } from "@/lib/legal/config"

export async function generateMetadata() {
  const pt = (await getLocale()) !== "en"
  return { title: `${pt ? "Retratação" : "Withdrawal"} | ${LEGAL.marca}`, description: pt ? "Resolva o contrato de subscrição dentro dos 14 dias." : "Withdraw from the subscription contract within 14 days." }
}

export default async function Page() {
  const pt = (await getLocale()) !== "en"
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <h1 className="mb-3 text-4xl font-extrabold tracking-tight">{pt ? "Retratação" : "Withdrawal"}</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        {pt ? "Direito de livre resolução de 14 dias. Condições completas na " : "14-day right of withdrawal. Full conditions in the "}
        <Link href="/refund" className="underline underline-offset-4">{pt ? "Política de Reembolso" : "Refund Policy"}</Link>.
      </p>
      <WithdrawalForm supportEmail={LEGAL.email} />
    </div>
  )
}
