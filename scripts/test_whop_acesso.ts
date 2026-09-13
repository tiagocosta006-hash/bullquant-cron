/**
 * Teste ponta-a-ponta do acesso PRO via Whop.
 *
 * Corre contra a BD LOCAL e um servidor local, nunca contra produção — cria e
 * apaga uma conta de teste em `@exemplo.invalid`.
 *
 *   npx next dev -p 3070 &
 *   set -a; . ./.env.local; set +a
 *   npx tsx scripts/test_whop_acesso.ts
 *
 * Cobre os seis caminhos que decidem quem tem acesso pago:
 *
 *   1-2. conta que existe e está FREE paga → fica PRO na hora, sem ter de
 *        voltar a entrar (o plano é lido do Prisma a cada pedido). Cobre
 *        também o email em MAIÚSCULAS, que o Whop pode mandar tal como a
 *        pessoa o escreveu.
 *   3.   cancela → volta a FREE, mesmo quando o evento vem SEM email (é o que
 *        acontece enquanto faltar a permissão `member:email:read` no painel).
 *   4.   voltar a entrar não devolve o acesso.
 *   5.   pagamento que chega ANTES de a conta existir fica pendente e é
 *        resgatado no registo — uma vez só.
 *   6.   o caminho que estava aberto: pagar antes da conta, resgatar,
 *        cancelar sem email e voltar a entrar devolvia o PRO para sempre.
 *        A linha pendente sobrevivia ao cancelamento e o resgate olhava para
 *        o status dela, não para o `claimedAt`.
 */
import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'

const p = new PrismaClient()
const BASE = process.env.BASE ?? 'http://localhost:3070'
const SEGREDO = process.env.WHOP_WEBHOOK_SECRET!

function assinar(corpo: string) {
  const id = `msg_${crypto.randomUUID()}`
  const ts = Math.floor(Date.now() / 1000).toString()
  const mac = crypto.createHmac('sha256', Buffer.from(SEGREDO, 'utf8'))
    .update(`${id}.${ts}.${corpo}`, 'utf8').digest('base64')
  return { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${mac}` }
}

async function enviar(evento: unknown) {
  const corpo = JSON.stringify(evento)
  const r = await fetch(`${BASE}/api/webhooks/whop`, { method: 'POST', headers: assinar(corpo), body: corpo })
  return { status: r.status, corpo: await r.text() }
}

const plano = async (email: string) =>
  (await p.user.findUnique({ where: { email }, select: { plan: true, whopStatus: true } }))

let falhas = 0
const verificar = (nome: string, real: unknown, esperado: unknown) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? '  OK  ' : ' FALHA'} ${nome}${ok ? '' : ` — esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`}`)
}

const EMAIL = 'despromovido.teste@exemplo.invalid'
const MEM = 'mem_teste_despromovido'
const WUID = 'user_teste_despromovido'

async function limpar() {
  await p.whopPendingMembership.deleteMany({ where: { OR: [{ email: EMAIL }, { membershipId: MEM }] } })
  await p.user.deleteMany({ where: { email: EMAIL } })
}

async function main() {
  await limpar()

  // Conta que já existe e está FREE — exactamente o estado das cinco.
  const u = await p.user.create({ data: { id: crypto.randomUUID(), email: EMAIL, name: 'Teste', plan: 'FREE' } })
  console.log(`\n1) Conta existente em FREE, sem nada do Whop`)
  verificar('parte em FREE', (await plano(EMAIL))?.plan, 'FREE')

  console.log(`\n2) Paga no Whop com o MESMO email`)
  let r = await enviar({ id: 'evt_1', type: 'membership.activated', data: { id: MEM, status: 'active', user: { id: WUID, email: EMAIL.toUpperCase() } } })
  verificar('webhook aceite', r.status, 200)
  verificar('ficou PRO', (await plano(EMAIL))?.plan, 'PRO')
  verificar('sem pendente a sobrar', await p.whopPendingMembership.count({ where: { OR: [{ email: EMAIL }, { membershipId: MEM }] } }), 0)

  console.log(`\n3) Cancela — evento SEM email (sem member:email:read)`)
  r = await enviar({ id: 'evt_2', type: 'membership.deactivated', data: { id: MEM, status: 'canceled', user: { id: WUID } } })
  verificar('webhook aceite', r.status, 200)
  verificar('voltou a FREE', (await plano(EMAIL))?.plan, 'FREE')

  console.log(`\n4) Volta a fazer login — não pode recuperar o PRO sozinho`)
  const { resgatarPagamentoWhop } = await import('../lib/whop')
  const resgatou = await resgatarPagamentoWhop(u.id, EMAIL)
  verificar('o resgate recusa', resgatou, false)
  verificar('continua FREE', (await plano(EMAIL))?.plan, 'FREE')

  console.log(`\n5) Pagamento que chega ANTES de existir conta`)
  await limpar()
  r = await enviar({ id: 'evt_3', type: 'membership.activated', data: { id: MEM, status: 'active', user: { id: WUID, email: EMAIL } } })
  verificar('fica pendente', r.status, 200)
  verificar('linha gravada', await p.whopPendingMembership.count({ where: { membershipId: MEM } }), 1)
  const u2 = await p.user.create({ data: { id: crypto.randomUUID(), email: EMAIL, name: 'Teste', plan: 'FREE' } })
  verificar('o registo resgata', await resgatarPagamentoWhop(u2.id, EMAIL), true)
  verificar('ficou PRO', (await plano(EMAIL))?.plan, 'PRO')
  verificar('segundo resgate não repete', await resgatarPagamentoWhop(u2.id, EMAIL), false)

  console.log(`\n6) O caminho real do buraco: pagou antes da conta, resgatou, cancelou sem email, volta a entrar`)
  // A linha pendente existe (cenário 5) e está marcada como resgatada.
  r = await enviar({ id: 'evt_4', type: 'membership.deactivated', data: { id: MEM, status: 'canceled', user: { id: WUID } } })
  verificar('cancelamento aceite', r.status, 200)
  verificar('voltou a FREE', (await plano(EMAIL))?.plan, 'FREE')
  verificar('o pendente foi apagado', await p.whopPendingMembership.count({ where: { membershipId: MEM } }), 0)
  verificar('o login não devolve o PRO', await resgatarPagamentoWhop(u2.id, EMAIL), false)
  verificar('continua FREE', (await plano(EMAIL))?.plan, 'FREE')

  await limpar()
  console.log(`\n${falhas === 0 ? 'TODOS OS CENÁRIOS PASSARAM' : `${falhas} FALHA(S)`}\n`)
  process.exitCode = falhas === 0 ? 0 : 1
}

main().finally(() => p.$disconnect())
