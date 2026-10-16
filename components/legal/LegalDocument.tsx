import { Link } from "@/i18n/routing"
import { LEGAL, VERSOES, formatarData, type ChaveDocumento } from "@/lib/legal/config"
import type { Documento } from "@/lib/legal/tipos"

const OUTROS: Array<{ href: "/terms" | "/privacy" | "/refund" | "/cookies" | "/legal"; chave: Record<"pt" | "en", string> }> = [
  { href: "/terms", chave: { pt: "Termos de Serviço", en: "Terms of Service" } },
  { href: "/privacy", chave: { pt: "Privacidade", en: "Privacy" } },
  { href: "/refund", chave: { pt: "Reembolso e livre resolução", en: "Refunds and withdrawal" } },
  { href: "/cookies", chave: { pt: "Cookies", en: "Cookies" } },
  { href: "/legal", chave: { pt: "Aviso legal e metodologia", en: "Legal notice and methodology" } },
]

/** Quem presta o serviço. Só mostra o que está preenchido (ver lib/legal/config.ts). */
export function Identificacao({ locale }: { locale: "pt" | "en" }) {
  const pt = locale === "pt"
  const { entidade } = LEGAL
  const linhas: Array<[string, string]> = []
  if (entidade.nome) linhas.push([pt ? "Denominação" : "Company", entidade.nome])
  if (entidade.nipc) linhas.push(["NIPC", entidade.nipc])
  if (entidade.sede) linhas.push([pt ? "Sede" : "Registered office", entidade.sede])
  if (entidade.registo) linhas.push([pt ? "Registo comercial" : "Commercial registry", entidade.registo])
  linhas.push([pt ? "Marca" : "Brand", `${LEGAL.marca} (${LEGAL.grupo})`])
  linhas.push(["E-mail", LEGAL.email])
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-sm">
      <p className="mb-2 font-semibold">{pt ? "Identificação do prestador" : "Provider identification"}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {linhas.map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {LEGAL.livroReclamacoes && (
          <a href={LEGAL.livroReclamacoes} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-4 hover:underline">
            {pt ? "Livro de Reclamações Eletrónico" : "Electronic Complaints Book"}
          </a>
        )}
        {LEGAL.ral.nome && LEGAL.ral.url && (
          <a href={LEGAL.ral.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-4 hover:underline">
            {pt ? `Entidade de RAL: ${LEGAL.ral.nome}` : `ADR body: ${LEGAL.ral.nome}`}
          </a>
        )}
      </p>
    </div>
  )
}

export function LegalDocument({ doc, chave, locale, comIdentificacao = true }: { doc: Documento; chave: ChaveDocumento; locale: "pt" | "en"; comIdentificacao?: boolean }) {
  const pt = locale === "pt"
  return (
    <div className="container mx-auto max-w-4xl px-4 py-16 text-foreground">
      <h1 className="mb-3 text-4xl font-extrabold tracking-tight">{doc.titulo}</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        {pt ? "Versão em vigor desde" : "Version in force since"} {formatarData(VERSOES[chave], locale)}
      </p>

      {comIdentificacao && <div className="mb-8"><Identificacao locale={locale} /></div>}

      <div className="space-y-8 leading-relaxed">
        {doc.intro?.map((t) => <p key={t}>{t}</p>)}
        {doc.blocos.map((b, i) => (
          <section key={b.h ?? i}>
            {b.h && <h2 className="mb-3 text-2xl font-bold">{b.h}</h2>}
            {b.p?.map((t) => <p key={t} className="mb-3">{t}</p>)}
            {b.destaque && <p className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-[15px] font-medium">{b.destaque}</p>}
            {b.ul && <ul className="mb-3 list-disc space-y-2 pl-6">{b.ul.map((t) => <li key={t}>{t}</li>)}</ul>}
            {b.ol && <ol className="mb-3 list-decimal space-y-2 pl-6">{b.ol.map((t) => <li key={t}>{t}</li>)}</ol>}
            {b.tabela && (
              <div className="mb-3 overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="bg-muted/40"><tr>{b.tabela.cabecalho.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
                  <tbody>
                    {b.tabela.linhas.map((l) => (
                      <tr key={l[0]} className="border-t border-border/40 align-top">
                        {l.map((c, j) => <td key={j} className={`px-3 py-2 ${j === 0 ? "font-medium" : "text-muted-foreground"}`}>{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>

      <nav aria-label={pt ? "Documentos legais" : "Legal documents"} className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-border/50 pt-6 text-sm">
        {OUTROS.map((o) => <Link key={o.href} href={o.href} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{o.chave[locale]}</Link>)}
        <Link href="/withdrawal" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{pt ? "Retratação" : "Withdrawal"}</Link>
      </nav>
    </div>
  )
}
