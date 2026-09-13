/**
 * Passa `nomeDeCeoLimpo` por TODOS os nomes de CEO que estão na base de dados,
 * e não por uma amostra escolhida a dedo. O risco de uma expressão regular que
 * corta habilitações é cortar um nome a sério — "Esq" dentro de um apelido, um
 * "MD" que é iniciais — e isso só se vê olhando para o conjunto todo.
 *
 *   set -a; . ./.env.local; set +a; npx tsx scripts/test_ceo_limpo.ts
 */
import { PrismaClient } from '@prisma/client'
import { nomeDeCeoLimpo } from '../lib/ceo'

const p = new PrismaClient()

const CASOS: Array<[string, string]> = [
  ['Mr. Lip-Bu  Tan', 'Lip-Bu Tan'],
  ['Dr. Albert  Bourla D.V.M., Ph.D.', 'Albert Bourla'],
  ['Mr. Nikesh  Arora C.F.A.', 'Nikesh Arora'],
  ['Dr. Alexander C. Karp J.D.', 'Alexander C. Karp'],
  ['Dr. Robert P. Mauch Ph.D., PharmD', 'Robert P. Mauch'],
  ['Mr. Charles Victor Magro B.Sc. (Chem), MBA', 'Charles Victor Magro'],
  ['Mr. John W. Chidsey III, J.D.', 'John W. Chidsey III'],
  ['Dr. Reshma  Kewalramani FASN, M.D.', 'Reshma Kewalramani'],
  ['Mr. Timothy Gerard NeCastro C.I.C., CPA', 'Timothy Gerard NeCastro'],
  ['Mr. Stephen Allen Schwarzman B.A., M.B.A.', 'Stephen Allen Schwarzman'],
  ['Mr. James Duncan Farley Jr.', 'James Duncan Farley Jr.'],
  ['Ms. Kristin C. Peck', 'Kristin C. Peck'],
  ["Mr. Daniel Patrick  O'Day", "Daniel Patrick O'Day"],
  ['Mr. William L. Meaney BSc, MEng, MSIA', 'William L. Meaney'],
  ['Mr. Strauss H. Zelnick Esq., J.D.', 'Strauss H. Zelnick'],
  ['Ms. Natascha  Viljoen BEng (PrEng), EMBA', 'Natascha Viljoen'],
  ['Ms. Adaire Rita Fox-Martin', 'Adaire Rita Fox-Martin'],
]

async function main() {
  let falhas = 0

  for (const [entrada, esperado] of CASOS) {
    const obtido = nomeDeCeoLimpo(entrada)
    const ok = obtido === esperado
    if (!ok) falhas++
    console.log(`${ok ? '  OK  ' : ' FALHA'} "${entrada}" → "${obtido}"${ok ? '' : ` (esperado "${esperado}")`}`)
  }

  const empresas = await p.company.findMany({
    where: { NOT: { ceo: null } },
    select: { ticker: true, ceo: true },
    orderBy: { ticker: 'asc' },
  })

  console.log(`\nA passar ${empresas.length} nomes reais pela limpeza...`)
  // O que a limpeza NUNCA pode fazer, dito como contrato e não como palpite:
  //
  //   - descer abaixo de duas palavras
  //   - deitar fora uma palavra com apóstrofo ou hífen ("O'Day", "Lip-Bu")
  //   - deitar fora uma palavra com mais de cinco letras ("Meaney",
  //     "Stockfish", "NeCastro") — nenhum grau académico é tão comprido
  //   - inventar uma palavra que não estava no original
  //
  // Deixar cair "Esq.", "BEng" ou "Ph.D." é o trabalho dela, não uma falha.
  // Só se exige isto ANTES da primeira vírgula: o que vem depois é
  // deliberadamente descartado.
  const temDeSobreviver = (w: string) =>
    /['’-]/.test(w) || w.replace(/[^A-Za-z]/g, "").length > 5
  const palavras = (n: string) =>
    n.split(/\s+/).filter(Boolean).map((w) => w.replace(/,$/, ""))

  const suspeitos: string[] = []
  for (const e of empresas) {
    const limpo = nomeDeCeoLimpo(e.ceo)
    if (!limpo) {
      suspeitos.push(`${e.ticker}: "${e.ceo}" → vazio`)
      continue
    }
    const antesDaVirgula = palavras(e.ceo!.split(",")[0]).filter((w) => !/^\(.*\)$/.test(w))
    const ficaram = palavras(limpo)
    const perdidas = antesDaVirgula.filter((w) => temDeSobreviver(w) && !ficaram.includes(w))
    const inventadas = ficaram.filter((w) => !palavras(e.ceo!).includes(w))
    const curtoDemais = ficaram.length < 2 && antesDaVirgula.length >= 2
    if (perdidas.length > 0 || inventadas.length > 0 || curtoDemais) {
      suspeitos.push(
        `${e.ticker}: "${e.ceo}" → "${limpo}"` +
        (perdidas.length ? ` | perdeu: ${perdidas.join(", ")}` : "") +
        (inventadas.length ? ` | inventou: ${inventadas.join(", ")}` : "") +
        (curtoDemais ? " | ficou com menos de duas palavras" : "")
      )
    }
  }

  if (suspeitos.length === 0) {
    console.log('Nenhum apelido se perdeu, nada foi inventado, nada ficou com uma palavra só.')
  } else {
    falhas += suspeitos.length
    console.log(`${suspeitos.length} suspeitos:`)
    for (const s of suspeitos) console.log('  ' + s)
  }

  const mudados = empresas.filter((e) => nomeDeCeoLimpo(e.ceo) !== e.ceo).length
  console.log(`${mudados} de ${empresas.length} nomes foram alterados pela limpeza.`)
  console.log(`\n${falhas === 0 ? 'PASSOU' : `${falhas} FALHA(S)`}\n`)
  process.exitCode = falhas === 0 ? 0 : 1
}

main().finally(() => p.$disconnect())
