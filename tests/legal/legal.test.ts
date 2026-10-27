import { describe, it, expect } from "vitest"
import pt from "@/messages/pt.json"
import en from "@/messages/en.json"
import { TERMOS } from "@/lib/legal/termos"
import { PRIVACIDADE } from "@/lib/legal/privacidade"
import { REEMBOLSO } from "@/lib/legal/reembolso"
import { COOKIES } from "@/lib/legal/cookies"
import { AVISO_LEGAL } from "@/lib/legal/avisoLegal"
import { PLANOS } from "@/lib/planos"
import { VERSOES, LEGAL, lacunasIdentificacao } from "@/lib/legal/config"
import { lerPrefs } from "@/lib/legal/cookiePrefs"
import { POST as retratacao } from "@/app/api/withdrawal/route"

const DOCS = { TERMOS, PRIVACIDADE, REEMBOLSO, COOKIES, AVISO_LEGAL }

function textos(o: unknown, caminho = "", out: Array<[string, string]> = []) {
  if (typeof o === "string") out.push([caminho, o])
  else if (Array.isArray(o)) o.forEach((x, i) => textos(x, `${caminho}[${i}]`, out))
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) textos(v, caminho ? `${caminho}.${k}` : k, out)
  return out
}

describe("documentos legais", () => {
  for (const [nome, doc] of Object.entries(DOCS)) {
    it(`${nome}: PT e EN têm a mesma estrutura`, () => {
      expect(doc.pt.blocos.length).toBe(doc.en.blocos.length)
      doc.pt.blocos.forEach((b, i) => {
        const e = doc.en.blocos[i]
        expect(!!b.tabela).toBe(!!e.tabela)
        expect(b.ul?.length ?? 0).toBe(e.ul?.length ?? 0)
        expect(b.ol?.length ?? 0).toBe(e.ol?.length ?? 0)
        expect(!!b.destaque).toBe(!!e.destaque)
        if (b.tabela && e.tabela) {
          expect(b.tabela.linhas.length).toBe(e.tabela.linhas.length)
          expect(b.tabela.cabecalho.length).toBe(e.tabela.cabecalho.length)
          b.tabela.linhas.forEach((l) => expect(l.length).toBe(b.tabela!.cabecalho.length))
        }
      })
    })
  }

  it("as versões são datas fixas, válidas e não futuras", () => {
    for (const d of Object.values(VERSOES)) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(d + "T00:00:00Z").getTime()).toBeLessThanOrEqual(Date.now())
    }
  })

  it("os Termos e o Reembolso falam dos 14 dias de livre resolução e da página Retratação", () => {
    const t = JSON.stringify(TERMOS.pt) + JSON.stringify(REEMBOLSO.pt)
    expect(t).toContain("14 dias")
    expect(t).toMatch(/Retratação/)
    expect(JSON.stringify(REEMBOLSO.pt)).not.toMatch(/Não-Reembolso|não efetua reembolsos/i)
  })

  it("não se afirma que a plataforma é gratuita nem que o acesso é por plano free", () => {
    const todo = JSON.stringify([TERMOS, PRIVACIDADE, REEMBOLSO, AVISO_LEGAL])
    expect(todo).not.toMatch(/plano gratuito para sempre|free forever/i)
    expect(TERMOS.pt.blocos.some((b) => /Não existe, nesta fase, plano gratuito/.test((b.p ?? []).join(" ")))).toBe(true)
  })

  it("a identificação só mostra o que está preenchido; lacunas são listadas", () => {
    expect(Array.isArray(lacunasIdentificacao())).toBe(true)
    expect(LEGAL.email).toMatch(/@/)
  })
})

describe("linguagem do produto (sem plano gratuito, sem veredictos)", () => {
  const todos = (m: unknown) => textos(m).filter(([c]) => !/^(glossary|legal)/.test(c))
  const ignorar = /free cash|freecash|fcf|risk-free|free float|free cash/i

  for (const [loc, msgs] of [["pt", pt], ["en", en]] as const) {
    it(`${loc}: nada de 'grátis/free plan' nos textos de acesso`, () => {
      const ns = ["pricing", "marketing", "header", "login", "register"] as const
      for (const n of ns) {
        for (const [c, v] of textos((msgs as Record<string, unknown>)[n])) {
          // Os dias grátis do plano com comunidade só podem vir de lib/planos.ts
          // ({dias}, igual ao trial da Whop): tira-se a frase que os usa e o
          // resto continua sem promessas de acesso grátis.
          const semTrial = v.replace(/[^.·]*\{dias\}[^.·]*/g, "")
          expect(semTrial, `${loc}.${n}.${c}`).not.toMatch(/gr[aá]tis|gratuit|free plan|free account|sign up for free|start free|7 dias|7 days|sem cart[aã]o|no credit card/i)
          if (v.includes("{dias}")) expect(PLANOS.comunidade.diasGratis, `${loc}.${n}.${c} usa {dias}`).toBeGreaterThan(0)
        }
      }
    })
    it(`${loc}: sem 'valor justo / fair value / subavaliada / sobreavaliada' nas mensagens`, () => {
      for (const [c, v] of todos(msgs)) {
        if (ignorar.test(v)) continue
        expect(v, `${loc}.${c}`).not.toMatch(/fair value|valor justo|pre[cç]o justo|subavalia|sobreavalia|undervalued|overvalued/i)
      }
    })
  }
})

describe("cookies e retratação", () => {
  it("lerPrefs aceita só o formato versionado; o cookie antigo não vale como consentimento", () => {
    expect(lerPrefs("v1.a1m0")).toEqual({ analytics: true, marketing: false })
    expect(lerPrefs("v1.a0m0")).toEqual({ analytics: false, marketing: false })
    expect(lerPrefs("true")).toBeNull()
    expect(lerPrefs(undefined)).toBeNull()
    expect(lerPrefs("v1.a2m1")).toBeNull()
  })

  const pedido = (corpo: unknown) => new Request("http://x/api/withdrawal", { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } })

  it("retratação rejeita pedidos sem confirmação ou com e-mail inválido", async () => {
    expect((await retratacao(pedido({ name: "Ana", email: "ana@x.pt", locale: "pt" }))).status).toBe(400)
    expect((await retratacao(pedido({ name: "Ana", email: "não-é-email", locale: "pt", confirm: true }))).status).toBe(400)
    expect((await retratacao(pedido({ name: "A", email: "ana@x.pt", locale: "pt", confirm: true }))).status).toBe(400)
  })

  it("sem fornecedor de e-mail NÃO responde sucesso (a confirmação é a prova de receção)", async () => {
    const r = await retratacao(pedido({ name: "Ana Silva", email: "ana@x.pt", locale: "pt", confirm: true }))
    expect(r.status).toBe(502)
    expect((await r.json()).fallbackEmail).toBe(LEGAL.email)
  })
})
