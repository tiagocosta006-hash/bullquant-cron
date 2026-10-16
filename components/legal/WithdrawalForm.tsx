"use client"

import * as React from "react"
import { useLocale } from "next-intl"
import { Button } from "@/components/ui/button"

/**
 * Função de retratação em linha: "Resolver o contrato aqui" → confirmar → confirmação por e-mail.
 * (Dir. (UE) 2023/2673 art. 11.º-A da Dir. 2011/83; DL 24/2014.)
 */
const T = {
  pt: {
    titulo: "Resolver o contrato aqui",
    ajuda: "Use este formulário para exercer o direito de livre resolução da subscrição PRO (14 dias). Indique o nome e o e-mail com que subscreveu. Receberá de imediato uma confirmação por e-mail.",
    nome: "Nome", email: "E-mail da subscrição",
    passo1: "Continuar",
    revisao: "Vai resolver o contrato de subscrição PRO da BullValue associado a este e-mail. O acesso PRO termina e será reembolsado o que lhe for devido (se pediu o início imediato, é retido o valor proporcional ao serviço já prestado).",
    confirmar: "Confirmar resolução do contrato",
    voltar: "Voltar",
    enviando: "A enviar…",
    ok: "Resolução recebida. Enviámos-lhe uma confirmação por e-mail. Se não a encontrar, veja o spam.",
    erro: "Não conseguimos registar o pedido. Envie a sua declaração por e-mail para",
  },
  en: {
    titulo: "Withdraw from the contract here",
    ajuda: "Use this form to exercise the 14-day right of withdrawal from the PRO subscription. Enter the name and e-mail you subscribed with. You will receive an immediate confirmation by e-mail.",
    nome: "Name", email: "Subscription e-mail",
    passo1: "Continue",
    revisao: "You are about to withdraw from the BullValue PRO subscription contract associated with this e-mail. PRO access ends and you will be refunded what is due (if you asked for immediate start, the proportionate amount for the service already provided is retained).",
    confirmar: "Confirm withdrawal",
    voltar: "Back",
    enviando: "Sending…",
    ok: "Withdrawal received. We sent you a confirmation by e-mail. If you cannot find it, check your spam folder.",
    erro: "We could not register the request. Please e-mail your statement to",
  },
} as const

export function WithdrawalForm({ supportEmail }: { supportEmail: string }) {
  const locale = useLocale() === "en" ? "en" : "pt"
  const t = T[locale]
  const [passo, setPasso] = React.useState<1 | 2 | 3>(1)
  const [nome, setNome] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [aEnviar, setAEnviar] = React.useState(false)
  const [erro, setErro] = React.useState(false)

  const valido = nome.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())

  const enviar = async () => {
    setAEnviar(true); setErro(false)
    try {
      const r = await fetch("/api/withdrawal", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nome.trim(), email: email.trim(), locale, confirm: true }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setPasso(3)
    } catch { setErro(true) } finally { setAEnviar(false) }
  }

  if (passo === 3) return <p role="status" className="rounded-xl border border-bull/40 bg-bull/10 p-4 text-sm font-medium">{t.ok}</p>

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card/40 p-6">
      <h2 className="text-xl font-bold">{t.titulo}</h2>
      {passo === 1 ? (
        <>
          <p className="text-sm text-muted-foreground">{t.ajuda}</p>
          <label className="block text-sm font-medium">{t.nome}
            <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={120}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block text-sm font-medium">{t.email}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <Button disabled={!valido} onClick={() => setPasso(2)}>{t.passo1}</Button>
        </>
      ) : (
        <>
          <p className="text-sm"><strong>{nome.trim()}</strong> · {email.trim()}</p>
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">{t.revisao}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPasso(1)} disabled={aEnviar}>{t.voltar}</Button>
            <Button onClick={enviar} disabled={aEnviar}>{aEnviar ? t.enviando : t.confirmar}</Button>
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{t.erro} <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>}
        </>
      )}
    </div>
  )
}
