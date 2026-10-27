import { BRAND } from "@/lib/brand"

/**
 * Identificação do prestador e dados de contacto legais — fonte única.
 *
 * Os dados da entidade que explora a plataforma (denominação, NIPC, sede, registo)
 * vêm de variáveis de ambiente públicas, para se preencherem sem tocar no código:
 *
 *   NEXT_PUBLIC_LEGAL_ENTITY_NAME      denominação social
 *   NEXT_PUBLIC_LEGAL_NIPC             NIPC
 *   NEXT_PUBLIC_LEGAL_ADDRESS          sede (morada completa)
 *   NEXT_PUBLIC_LEGAL_REGISTRY         conservatória / registo comercial (opcional)
 *   NEXT_PUBLIC_LEGAL_EMAIL            e-mail de contacto (por omissão suporte@…)
 *   NEXT_PUBLIC_COMPLAINTS_BOOK_URL    ligação ao Livro de Reclamações Eletrónico
 *   NEXT_PUBLIC_ADR_NAME / _URL        entidade de RAL a que se adere (opcional)
 *
 * Nada aqui é inventado: o que não está preenchido não aparece.
 * ⚠️ Antes de abrir ao público a denominação, o NIPC e a sede têm de estar preenchidos
 * (DL 7/2004 art. 10.º; DL 24/2014 art. 4.º n.º 1 a)). `lacunasIdentificacao()` lista o que falta.
 */

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

export const LEGAL = {
  /** Marca que o público vê. */
  marca: BRAND.name,
  /** Estúdio do grupo. */
  grupo: BRAND.parent,
  site: BRAND.siteUrl,
  dominio: BRAND.domain,
  email: env(process.env.NEXT_PUBLIC_LEGAL_EMAIL) ?? "suporte@thebullvalue.com",
  entidade: {
    nome: env(process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME),
    nipc: env(process.env.NEXT_PUBLIC_LEGAL_NIPC),
    sede: env(process.env.NEXT_PUBLIC_LEGAL_ADDRESS),
    registo: env(process.env.NEXT_PUBLIC_LEGAL_REGISTRY),
  },
  livroReclamacoes: env(process.env.NEXT_PUBLIC_COMPLAINTS_BOOK_URL),
  ral: { nome: env(process.env.NEXT_PUBLIC_ADR_NAME), url: env(process.env.NEXT_PUBLIC_ADR_URL) },
  /** Subscrição: paga e gerida na Whop. */
  whopUrl: env(process.env.NEXT_PUBLIC_WHOP_URL),
  /** @deprecated os preços vivem em lib/planos.ts (dois planos). */
  preco: { valor: "7", moeda: "EUR", simbolo: "€" },
  /** Prazo de livre resolução (DL 24/2014). */
  diasResolucao: 14,
} as const

/** Datas FIXAS (não `new Date()`): a data de uma versão jurídica tem de ficar parada. */
export const VERSOES = {
  termos: "2026-10-27",
  privacidade: "2026-10-16",
  reembolso: "2026-10-16",
  cookies: "2026-10-16",
  avisoLegal: "2026-10-16",
} as const

export type ChaveDocumento = keyof typeof VERSOES

export function lacunasIdentificacao(): string[] {
  const f: string[] = []
  if (!LEGAL.entidade.nome) f.push("NEXT_PUBLIC_LEGAL_ENTITY_NAME")
  if (!LEGAL.entidade.nipc) f.push("NEXT_PUBLIC_LEGAL_NIPC")
  if (!LEGAL.entidade.sede) f.push("NEXT_PUBLIC_LEGAL_ADDRESS")
  if (!LEGAL.livroReclamacoes) f.push("NEXT_PUBLIC_COMPLAINTS_BOOK_URL")
  return f
}

export function formatarData(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"))
}
