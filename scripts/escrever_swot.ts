/**
 * Escreve SWOT autorados à mão, com as mesmas regras de qualidade do
 * `reparar_swot.ts` a valer à entrada.
 *
 * Os 374 que ficaram sem SWOT ficaram porque o que lá estava era molde
 * repetido, formato ilegível ou meia análise. Repô-los com mais do mesmo não
 * resolvia nada — por isso o que entra aqui é escrito empresa a empresa, e
 * passa pelos mesmos filtros antes de chegar à base:
 *
 *   - as QUATRO categorias, com dois a três itens cada
 *   - nenhuma frase repetida noutra empresa (o teste do molde)
 *   - nenhuma frase cortada a meio
 *   - nada de vago: "concorrência crescente" serve para 500 empresas e por
 *     isso não serve para nenhuma
 *
 * O que não passar é RECUSADO e dito em voz alta, em vez de ser gravado.
 *
 *   npx tsx scripts/escrever_swot.ts lote.json            (verifica)
 *   npx tsx scripts/escrever_swot.ts lote.json --aplicar  (grava)
 */
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'

const prisma = new PrismaClient()
const APLICAR = process.argv.includes('--aplicar')
const FICHEIRO = process.argv[2]

const CATEGORIAS = ['forcas', 'fraquezas', 'oportunidades', 'ameacas'] as const
type Swot = Record<(typeof CATEGORIAS)[number], string[]>

const CORTADA_A_MEIO =
  /(?:^|\s)(de|da|do|das|dos|em|no|na|nos|nas|com|para|por|e|ou|que|ao|à|aos|às|um|uma|pelo|pela|entre|sobre|sem|até)$/i

async function main() {
  if (!FICHEIRO) { console.error('Falta o ficheiro do lote.'); process.exit(1) }
  const lote: Record<string, Swot> = JSON.parse(fs.readFileSync(FICHEIRO, 'utf8'))
  const tickers = Object.keys(lote)

  // Corpus de frases JÁ EM PRODUÇÃO, para o teste do molde valer contra tudo
  // e não só contra o lote.
  const existentes = await prisma.$queryRawUnsafe<Array<{ swot: Swot | null }>>(
    `SELECT swot FROM companies WHERE swot IS NOT NULL`
  )
  const contagem = new Map<string, number>()
  const registar = (f: string) => contagem.set(f.toLowerCase(), (contagem.get(f.toLowerCase()) ?? 0) + 1)
  for (const e of existentes) if (e.swot) for (const f of Object.values(e.swot).flat()) registar(f)
  for (const s of Object.values(lote)) for (const f of Object.values(s).flat()) registar(f)

  const naBase = await prisma.$queryRawUnsafe<Array<{ ticker: string }>>(
    `SELECT ticker FROM companies WHERE ticker = ANY($1)`, tickers
  )
  const conhecidos = new Set(naBase.map((x) => x.ticker))

  const ok: Array<{ ticker: string; swot: Swot }> = []
  const recusados: string[] = []

  for (const [ticker, swot] of Object.entries(lote)) {
    const queixas: string[] = []
    if (!conhecidos.has(ticker)) queixas.push('não existe na base')
    for (const c of CATEGORIAS) {
      const itens = swot?.[c]
      if (!Array.isArray(itens) || itens.length < 2) { queixas.push(`${c}: menos de 2 itens`); continue }
      for (const i of itens) {
        if (typeof i !== 'string' || !i.trim()) { queixas.push(`${c}: item vazio`); continue }
        if (CORTADA_A_MEIO.test(i.trim().replace(/[.!?]$/, ''))) queixas.push(`${c}: "${i}" acaba a meio`)
        if ((contagem.get(i.toLowerCase()) ?? 0) > 1) queixas.push(`${c}: "${i}" repete-se noutra empresa`)
      }
    }
    if (queixas.length) { recusados.push(`${ticker}: ${queixas.join('; ')}`); continue }
    ok.push({ ticker, swot })
  }

  console.log(`no lote: ${tickers.length}  |  aceites: ${ok.length}  |  recusados: ${recusados.length}`)
  for (const r of recusados) console.log(`  RECUSADO ${r}`)

  if (!APLICAR) { console.log('\n(verificação — nada foi escrito. Usa --aplicar)'); return }

  for (const { ticker, swot } of ok) {
    await prisma.$executeRawUnsafe(
      `UPDATE companies SET swot = $1::json, "updatedAt" = NOW() WHERE ticker = $2`,
      JSON.stringify(swot), ticker
    )
  }
  const [{ com }] = await prisma.$queryRawUnsafe<Array<{ com: bigint }>>(
    `SELECT count(swot) com FROM companies WHERE "isActive"=TRUE`
  )
  console.log(`\nescritos: ${ok.length}.  Total com SWOT na plataforma: ${com}`)
}

main().finally(() => prisma.$disconnect())
