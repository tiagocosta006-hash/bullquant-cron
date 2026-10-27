import crypto from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Webhook da Whop (app/api/webhooks/whop/route.ts) com a BD e a API da Whop
 * simuladas. Cobre o funil novo: a conta vem na metadata do checkout, e o
 * acesso decide-se pelo estado ATUAL das subscrições da pessoa, não pelo tipo
 * do evento.
 */

type Conta = { id: string; email: string; plan: "FREE" | "PRO"; whopUserId: string | null; whopMembershipId: string | null; whopProductId: string | null; whopStatus: string | null }
const contas = new Map<string, Conta>()
const pendentes: Record<string, unknown>[] = []

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: Partial<Conta> }) => {
        if (where.id) return contas.get(where.id) ?? null
        for (const c of contas.values()) {
          if (where.whopUserId && c.whopUserId === where.whopUserId) return c
          if (where.email && c.email === where.email) return c
        }
        return null
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Conta> }) => {
        const c = contas.get(where.id)!
        if (data.whopUserId && [...contas.values()].some((o) => o.id !== c.id && o.whopUserId === data.whopUserId)) {
          throw Object.assign(new Error("Unique constraint failed on whopUserId"), { code: "P2002" })
        }
        Object.assign(c, data)
        return c
      }),
    },
    whopPendingMembership: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => { pendentes.push(create); return create }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}))

// Subscrições que a "API da Whop" devolve para cada utilizador da Whop.
let subscricoes: Record<string, { status: string; product_id: string; user_id: string }[]> = {}
let apiEmBaixo = false

const SEGREDO = "ws_" + "ab".repeat(32)

function pedido(tipo: string, data: Record<string, unknown>) {
  const corpo = JSON.stringify({ id: "evt_" + Math.random(), type: tipo, data })
  const id = "msg_" + Math.random()
  const ts = Math.floor(Date.now() / 1000)
  const sig = crypto.createHmac("sha256", Buffer.from("ab".repeat(32), "hex")).update(`${id}.${ts}.${corpo}`).digest("base64")
  return new Request("https://thebullvalue.com/api/webhooks/whop", {
    method: "POST",
    headers: { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${sig}` },
    body: corpo,
  })
}

const conta = (c: Partial<Conta> & { id: string }) =>
  contas.set(c.id, { email: `${c.id}@exemplo.pt`, plan: "FREE", whopUserId: null, whopMembershipId: null, whopProductId: null, whopStatus: null, ...c })

beforeEach(() => {
  contas.clear()
  pendentes.length = 0
  subscricoes = {}
  apiEmBaixo = false
  process.env.WHOP_WEBHOOK_SECRET = SEGREDO
  process.env.WHOP_API_KEY = "apik_teste"
  process.env.WHOP_PRODUCT_ID = "prod_bv,prod_comunidade"
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (apiEmBaixo) return new Response("erro", { status: 503 })
    const u = new URL(url).searchParams.get("user_id") ?? ""
    return Response.json({ data: subscricoes[u] ?? [] })
  }))
})

const { POST } = await import("@/app/api/webhooks/whop/route")

describe("webhook da Whop", () => {
  it("liga o pagamento à conta pela metadata do checkout, mesmo com outro email na Whop", async () => {
    conta({ id: "u1", email: "ana@gmail.com" })
    subscricoes.whop_ana = [{ status: "active", product_id: "prod_bv", user_id: "whop_ana" }]
    const r = await POST(pedido("membership.activated", { id: "mem_1", status: "active", product: { id: "prod_bv" }, user: { id: "whop_ana", email: "outro@hotmail.com" }, metadata: { bv_user_id: "u1" } }))
    expect(r.status).toBe(200)
    expect(contas.get("u1")!.plan).toBe("PRO")
    expect(pendentes).toHaveLength(0)
  })

  it("cancelar uma subscrição não tira o PRO se outra (a comunidade) continua ativa", async () => {
    conta({ id: "u1", plan: "PRO", whopUserId: "whop_ana", whopMembershipId: "mem_bv" })
    subscricoes.whop_ana = [
      { status: "canceled", product_id: "prod_bv", user_id: "whop_ana" },
      { status: "active", product_id: "prod_comunidade", user_id: "whop_ana" },
    ]
    await POST(pedido("membership.deactivated", { id: "mem_bv", status: "canceled", product: { id: "prod_bv" }, user: { id: "whop_ana" } }))
    expect(contas.get("u1")!.plan).toBe("PRO")
  })

  it("um 'activated' atrasado não devolve o PRO a quem já cancelou tudo", async () => {
    conta({ id: "u1", plan: "FREE", whopUserId: "whop_ana" })
    subscricoes.whop_ana = [{ status: "canceled", product_id: "prod_bv", user_id: "whop_ana" }]
    await POST(pedido("membership.activated", { id: "mem_bv", status: "active", product: { id: "prod_bv" }, user: { id: "whop_ana" }, metadata: { bv_user_id: "u1" } }))
    expect(contas.get("u1")!.plan).toBe("FREE")
  })

  it("sem resposta da API, decide pelo tipo do evento (como antes)", async () => {
    conta({ id: "u1" })
    apiEmBaixo = true
    await POST(pedido("membership.activated", { id: "mem_1", product: { id: "prod_bv" }, user: { id: "whop_ana" }, metadata: { bv_user_id: "u1" } }))
    expect(contas.get("u1")!.plan).toBe("PRO")
    await POST(pedido("membership.deactivated", { id: "mem_1", product: { id: "prod_bv" }, user: { id: "whop_ana" }, metadata: { bv_user_id: "u1" } }))
    expect(contas.get("u1")!.plan).toBe("FREE")
  })

  it("a mesma pessoa da Whop a pagar uma segunda conta: fica PRO e responde 200 (sem conflito no whopUserId)", async () => {
    conta({ id: "conta_a", plan: "PRO", whopUserId: "whop_ana" })
    conta({ id: "conta_b" })
    subscricoes.whop_ana = [{ status: "active", product_id: "prod_bv", user_id: "whop_ana" }]
    const r = await POST(pedido("membership.activated", { id: "mem_b", product: { id: "prod_bv" }, user: { id: "whop_ana" }, metadata: { bv_user_id: "conta_b" } }))
    expect(r.status).toBe(200)
    expect(contas.get("conta_b")!.plan).toBe("PRO")
    expect(contas.get("conta_b")!.whopUserId).toBeNull()
    expect(contas.get("conta_a")!.whopUserId).toBe("whop_ana")
  })

  it("ignora produtos que não dão PRO", async () => {
    conta({ id: "u1" })
    const r = await POST(pedido("membership.activated", { id: "mem_x", product: { id: "prod_outro" }, user: { id: "whop_ana" }, metadata: { bv_user_id: "u1" } }))
    expect(await r.json()).toMatchObject({ ignorado: "outro produto" })
    expect(contas.get("u1")!.plan).toBe("FREE")
  })

  it("recusa pedidos sem assinatura válida", async () => {
    const r = await POST(new Request("https://thebullvalue.com/api/webhooks/whop", { method: "POST", body: "{}" }))
    expect(r.status).toBe(401)
  })
})
