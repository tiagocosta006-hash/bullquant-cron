/**
 * Repara os SWOT: um formato só, e sem texto de encher.
 *
 * ── O que se encontrou em produção ──────────────────────────────────────
 *
 * TRÊS formatos guardados na mesma coluna, e o painel do explorador só lê um:
 *
 *   422  {forcas, fraquezas, oportunidades, ameacas}   ← o único que aparece
 *    81  {strengths, weaknesses, opportunities, threats}
 *    27  [{type, description}, …]
 *
 * As 108 últimas mostravam a caixa do SWOT com os quatro títulos e NADA por
 * baixo — o `?.map` de uma chave que não existe não rende nada, e a secção não
 * tinha guarda que a escondesse.
 *
 * Pior do que o formato era o conteúdo. A Google, a Goldman Sachs e a Home
 * Depot tinham o SWOT IGUAL, palavra por palavra:
 *
 *   forças        Marca forte globalmente / Liderança na quota de mercado
 *   fraquezas     Dependência de ciclos económicos / Custos operacionais elevados
 *   oportunidades Expansão para mercados emergentes / Novos lançamentos
 *   ameaças       Concorrência intensa no setor / Regulações restritivas
 *
 * Numa plataforma de análise, a mesma análise para um motor de busca, um banco
 * de investimento e uma loja de bricolage não é um defeito de apresentação: é
 * dizer ao utilizador uma coisa que não é verdade sobre nenhuma das três.
 *
 * ── O critério ──────────────────────────────────────────────────────────
 *
 * Uma frase que aparece em três ou mais empresas não descreve nenhuma delas.
 * São 95 frases em 2.202, e é isso que se remove. O que sobreviver fica: uma
 * empresa com duas forças verdadeiras e nenhuma ameaça mostra duas forças,
 * que é melhor do que quatro categorias inventadas.
 *
 * Ficando tudo vazio, a coluna vai a NULL e o painel deixa de mostrar a
 * secção — a mesma regra do CEO: quando não há, não se inventa.
 *
 *   npx tsx scripts/reparar_swot.ts            (simulação, não escreve)
 *   npx tsx scripts/reparar_swot.ts --aplicar  (grava, com cópia antes)
 */
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'

const prisma = new PrismaClient()
const APLICAR = process.argv.includes('--aplicar')

/** Aparecer em 3+ empresas é deixar de ser sobre alguma delas. */
const LIMITE_GENERICA = 3

type Swot = { forcas: string[]; fraquezas: string[]; oportunidades: string[]; ameacas: string[] }

const CATEGORIAS: Record<string, keyof Swot> = {
  forcas: 'forcas', strengths: 'forcas', strength: 'forcas',
  fraquezas: 'fraquezas', weaknesses: 'fraquezas', weakness: 'fraquezas',
  oportunidades: 'oportunidades', opportunities: 'oportunidades', opportunity: 'oportunidades',
  ameacas: 'ameacas', threats: 'ameacas', threat: 'ameacas',
}

/** Os três formatos entram, um só sai. */
function normalizar(bruto: unknown): Swot | null {
  const fora: Swot = { forcas: [], fraquezas: [], oportunidades: [], ameacas: [] }
  const juntar = (cat: string | undefined, valor: unknown) => {
    const chave = CATEGORIAS[String(cat ?? '').toLowerCase().trim()]
    if (!chave) return
    for (const v of Array.isArray(valor) ? valor : [valor]) {
      if (typeof v === 'string' && v.trim()) fora[chave].push(v.trim())
    }
  }
  if (Array.isArray(bruto)) {
    for (const item of bruto) {
      if (item && typeof item === 'object') juntar((item as Record<string, string>).type, (item as Record<string, string>).description)
    }
  } else if (bruto && typeof bruto === 'object') {
    for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) juntar(k, v)
  }
  return Object.values(fora).some((l) => l.length) ? fora : null
}

async function main() {
  const linhas = await prisma.$queryRawUnsafe<Array<{ ticker: string; nome: string; swot: unknown }>>(
    `SELECT ticker, name AS nome, swot FROM companies WHERE "isActive"=TRUE AND swot IS NOT NULL ORDER BY ticker`
  )

  /**
   * Conta-se com o NOME DA EMPRESA apagado.
   *
   * Sem isto, um molde com o nome lá dentro passa por específico porque a
   * string é única: "HSBC HOLDINGS PLC has a strong market position." aparece
   * uma vez, mas "… has a strong market position." aparece em dezenas. É o
   * mesmo texto com a etiqueta trocada, e era assim que a Nvidia ficava com
   * "Nvidia has strong brand recognition in its sector" como única força.
   */
  const mascarar = (frase: string, ticker: string, nome: string) => {
    const pedacos = [ticker, nome, ...nome.split(/[\s,.]+/).filter((w) => w.length > 3)]
    let f = frase
    for (const p of pedacos) {
      if (!p) continue
      f = f.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ")
    }
    return f.replace(/\s+/g, " ").trim().toLowerCase()
  }

  const contagem = new Map<string, number>()
  for (const l of linhas) {
    const s = normalizar(l.swot)
    if (!s) continue
    for (const frase of Object.values(s).flat()) {
      const chave = mascarar(frase, l.ticker, l.nome)
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
    }
  }
  const eGenerica = (f: string, ticker: string, nome: string) =>
    (contagem.get(mascarar(f, ticker, nome)) ?? 0) >= LIMITE_GENERICA

  const paraNull: string[] = []
  const paraEscrever: Array<{ ticker: string; swot: Swot }> = []
  let intactos = 0
  let perderamFrases = 0

  for (const l of linhas) {
    const s = normalizar(l.swot)
    if (!s) { paraNull.push(l.ticker); continue }
    const limpo: Swot = { forcas: [], fraquezas: [], oportunidades: [], ameacas: [] }
    for (const [k, v] of Object.entries(s) as Array<[keyof Swot, string[]]>) {
      limpo[k] = v.filter((f) => !eGenerica(f, l.ticker, l.nome))
    }
    /**
     * Um mínimo para aquilo ainda ser um SWOT.
     *
     * Depois de tirar os moldes sobrava, em vários casos, uma linha só numa
     * categoria — a HSBC ficou com "HSBC HOLDINGS PLC has a strong market
     * position." e mais nada. Quatro títulos, três vazios e uma frase que não
     * diz nada é pior do que não haver secção: parece uma análise a meio.
     *
     * Duas categorias com conteúdo e três itens no total. Abaixo disso, NULL.
     */
    const categoriasComConteudo = Object.values(limpo).filter((x) => x.length).length
    const totalItens = Object.values(limpo).flat().length
    if (categoriasComConteudo < 2 || totalItens < 3) { paraNull.push(l.ticker); continue }
    const antes = Object.values(s).flat().length
    const depois = Object.values(limpo).flat().length
    if (depois < antes) perderamFrases++
    else intactos++
    paraEscrever.push({ ticker: l.ticker, swot: limpo })
  }

  console.log(`empresas com swot: ${linhas.length}`)
  console.log(`  ficam a NULL (só texto de encher): ${paraNull.length}`)
  console.log(`  perderam frases genéricas: ${perderamFrases}`)
  console.log(`  ficam iguais no conteúdo (só se uniformiza o formato): ${intactos}`)
  console.log(`  total a reescrever: ${paraEscrever.length}`)
  console.log(`\nfrases distintas: ${contagem.size}  |  genéricas (${LIMITE_GENERICA}+ empresas): ${[...contagem.values()].filter((n) => n >= LIMITE_GENERICA).length}`)
  console.log(`\na anular: ${paraNull.slice(0, 25).join(' ')}${paraNull.length > 25 ? ' …' : ''}`)

  if (!APLICAR) { console.log('\n(simulação — nada foi escrito. Usa --aplicar)'); return }

  const dir = path.join(__dirname, 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const ficheiro = path.join(dir, `swot_pre_reparacao_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`)
  fs.writeFileSync(ficheiro, JSON.stringify(linhas, null, 1))
  console.log(`\ncópia de segurança: ${ficheiro}`)

  for (const t of paraNull) {
    await prisma.$executeRawUnsafe(`UPDATE companies SET swot = NULL, "updatedAt" = NOW() WHERE ticker = $1`, t)
  }
  for (const { ticker, swot } of paraEscrever) {
    await prisma.$executeRawUnsafe(`UPDATE companies SET swot = $1::json, "updatedAt" = NOW() WHERE ticker = $2`, JSON.stringify(swot), ticker)
  }
  console.log(`\nescrito: ${paraNull.length} anulados, ${paraEscrever.length} reescritos.`)
}

main().finally(() => prisma.$disconnect())
