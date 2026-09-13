/**
 * O nome do CEO como o yfinance o dá, e como deve aparecer.
 *
 * O `ingest_ceos.py` grava o que vem do Yahoo em bruto, e o que vem é assim:
 *
 *   "Mr. Lip-Bu  Tan"
 *   "Dr. Albert  Bourla D.V.M., Ph.D."
 *   "Mr. Charles Victor Magro B.Sc. (Chem), MBA"
 *   "Dr. Robert P. Mauch Ph.D., PharmD"
 *   "Mr. John W. Chidsey III, J.D."
 *
 * Tratamento à frente, habilitações atrás, espaços a dobrar no meio (o Yahoo
 * junta primeiro e último nome com um campo do meio vazio) — e, no fim, um
 * sufixo geracional que É nome e tem de ficar.
 *
 * A primeira versão disto tinha uma LISTA de habilitações a remover. Passada
 * pelos 492 nomes reais, falhou em sete: PharmD, CMT, FASN, B.Sc., C.I.C.,
 * B.A. e um "(Chem)" entre parênteses. Uma lista de abreviaturas académicas
 * nunca fica completa, e cada falha deixava um nome com lixo colado.
 *
 * Por isso não se nomeiam: reconhece-se a FORMA. Corta-se na primeira vírgula
 * (o Yahoo põe-nas sempre entre nome e habilitações, nunca dentro do nome) e
 * tira-se do fim o que tem cara de pós-nominal — abreviatura pontuada, sigla
 * em maiúsculas, ou parêntesis. Um sufixo geracional interrompe a limpeza, e
 * nunca se desce abaixo de duas palavras.
 *
 * Isto vive aqui, e não em cada sítio que mostra um CEO, porque são vários: a
 * Visão geral da página de ação, o separador Empresa, a folha de perfil do
 * explorador. Com a limpeza só num deles, a mesma página mostrava
 * "Lip-Bu Tan" num separador e "Mr. Lip-Bu  Tan" no outro.
 */

/** Mr., Mrs., Ms., Dr., Prof. — à frente do nome. */
const TRATAMENTO = /^(mr|mrs|ms|miss|dr|prof)\.?\s+/i

/** Jr., Sr., II, III… — isto É nome, e interrompe a limpeza do fim. */
const GERACIONAL = /^(jr|sr|ii|iii|iv|v)\.?$/i

/**
 * Cara de pós-nominal: "(Chem)", "J.D.", "C.I.C.", "Esq.", "FASN", "MBA".
 * Abreviatura pontuada, sigla em maiúsculas, ou parêntesis.
 */
const POSNOMINAL = /^(\(.*\)|[A-Za-z]\.(?:[A-Za-z]\.)*|[A-Za-z]{1,4}\.|[A-Z]{2,})$/

/**
 * "BSc", "MEng", "PharmD", "B.Sc." — maiúscula a meio e curtos. É isto que
 * distingue uma habilitação de um apelido: a "NeCastro" e a "McMillon"
 * também têm maiúscula a meio, mas têm oito letras. Nenhum grau académico
 * passa das cinco.
 */
function eSiglaCurta(palavra: string): boolean {
  // Apóstrofo ou hífen são marca de NOME, nunca de grau: "O'Day", "Lip-Bu",
  // "Fox-Martin", "D'Angelo". Sem esta linha, o apelido do CEO da Gilead
  // ("O'Day" — quatro letras, duas maiúsculas) era apagado como se fosse um
  // "BSc", e ficava "Daniel Patrick".
  if (/['’-]/.test(palavra)) return false
  const letras = palavra.replace(/[^A-Za-z]/g, "")
  return letras.length <= 5 && (letras.match(/[A-Z]/g)?.length ?? 0) >= 2
}

export function nomeDeCeoLimpo(bruto: string | null | undefined): string | null {
  if (!bruto) return null

  const semHabilitacoes = bruto.split(",")[0]
  const partes = semHabilitacoes
    .replace(TRATAMENTO, "")
    .split(/\s+/)
    .filter(Boolean)

  // Nunca abaixo de duas palavras: primeiro e último nome ficam sempre, por
  // mais que a última pareça uma sigla.
  while (partes.length > 2) {
    const ultima = partes[partes.length - 1]
    if (GERACIONAL.test(ultima)) break
    if (!POSNOMINAL.test(ultima) && !eSiglaCurta(ultima)) break
    partes.pop()
  }

  return partes.join(" ") || null
}
