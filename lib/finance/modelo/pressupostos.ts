import { resumo } from "./historico"
import type { AnoHistorico, Driver, Pressupostos, PressupostosAvaliacao, RaciosAno, ReceitaSegmentos } from "./tipos"

/**
 * Pressupostos com que um modelo abre — um ponto de partida defensável, que
 * o analista depois muda. Cada regra está aqui escrita para se poder explicar
 * a um cliente de onde vem cada número.
 *
 *   Receita     anos com consenso de analistas → o crescimento que o
 *               consenso implica; depois desce em linha reta até g + 1,5 pp
 *               no último ano (as empresas abrandam à medida que crescem).
 *               Sem consenso: parte da mediana dos últimos 5 anos.
 *   Margem EBIT anos com consenso → a margem do consenso (EBIT ÷ receita),
 *               limitada ao intervalo dos últimos 5 anos ± 5 pp: o "EBIT" do
 *               consenso da FMP às vezes inclui ganhos não operacionais (a
 *               Amazon aparecia com 22% em 2026 contra 11% real em 2025).
 *               Depois mantém a última. Sem consenso: mediana de 5 anos.
 *   Capex, D&A  → o ÚLTIMO ano, constante: a média de 3 anos escondia ciclos
 *               de investimento em curso (Amazon 13,5% vs ~18% em 2025).
 *   Restantes   (margem bruta, dias de fundo de maneio, imposto)
 *               → média dos últimos 3 anos, constante.
 *   Beta        → ajustado de Blume (0,67 × β + 0,33), o da Bloomberg: os
 *               betas tendem para 1 ao longo do tempo (Nvidia 2,2 → 1,8).
 */

export type EstimativaModelo = {
  fiscalYear: number
  revenueAvg: number
  ebitAvg: number | null
  analistas: number
  revenueLow?: number
  revenueHigh?: number
  ebitdaAvg?: number | null
  epsAvg?: number
}

export type ContextoMercado = {
  rf: number | null
  beta: number | null
  /** Juros ÷ dívida total, dos últimos 12 meses. */
  custoDivida: number | null
  /** EV/EBITDA atual, para o múltiplo de saída por omissão. */
  evEbitdaAtual: number | null
}

export const RF_POR_OMISSAO = 0.043
export const ERP_POR_OMISSAO = 0.05
export const G_POR_OMISSAO = 0.025

const lim = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Linha reta de `de` até `ate` em `n` passos, incluindo os extremos. */
function linha(de: number, ate: number, n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [ate]
  return Array.from({ length: n }, (_, i) => de + ((ate - de) * i) / (n - 1))
}

export function pressupostosIniciais(
  hist: AnoHistorico[],
  rs: RaciosAno[],
  estimativas: EstimativaModelo[],
  ctx: ContextoMercado,
  // 10 anos por omissão: com 5, o crescimento de uma empresa como a Nvidia
  // caía de 60% para 4% em cinco anos e o valor terminal pesava ~75% do EV.
  anos = 10,
): Pressupostos {
  const base = hist[hist.length - 1]
  const med3 = (k: Driver, reserva: number) => resumo(rs, k, 3).media ?? reserva
  const g = G_POR_OMISSAO

  // Consenso para os anos a seguir ao último real, por ordem, sem saltos.
  const cons: EstimativaModelo[] = []
  for (let fy = base.fiscalYear + 1; ; fy++) {
    const e = estimativas.find((x) => x.fiscalYear === fy && x.revenueAvg > 0)
    if (!e || cons.length >= Math.min(3, anos)) break
    cons.push(e)
  }

  // ── Receita ────────────────────────────────────────────────────────────
  const crescimento: number[] = []
  let receitaAnt = base.revenue ?? 0
  for (const e of cons) {
    crescimento.push(receitaAnt > 0 ? lim(e.revenueAvg / receitaAnt - 1, -0.3, 0.6) : 0)
    receitaAnt = e.revenueAvg
  }
  const partida = crescimento.length
    ? crescimento[crescimento.length - 1]
    : lim(resumo(rs, "crescimentoReceita", 5).mediana ?? 0.05, -0.05, 0.25)
  const destino = g + 0.015
  const resto = anos - crescimento.length
  if (resto > 0) {
    // Com consenso, o primeiro ano sem consenso já desce um passo; sem
    // consenso, o ano 1 é a própria partida.
    const l = crescimento.length ? linha(partida, destino, resto + 1).slice(1) : linha(partida, destino, resto)
    crescimento.push(...l)
  }

  // ── Margem EBIT ────────────────────────────────────────────────────────
  const margemHist = resumo(rs, "margemEbit", 5).mediana ?? 0.15
  const margens5 = rs.slice(-5).map((r) => r.margemEbit).filter((v): v is number => v !== null)
  const minM = margens5.length ? Math.min(...margens5) - 0.05 : -0.5
  const maxM = margens5.length ? Math.max(...margens5) + 0.05 : 0.8
  const margens: number[] = cons.map((e) =>
    e.ebitAvg !== null && e.revenueAvg > 0 ? lim(e.ebitAvg / e.revenueAvg, minM, maxM) : margemHist,
  )
  const ultimaMargem = margens.length ? margens[margens.length - 1] : margemHist
  while (margens.length < anos) margens.push(ultimaMargem)

  const constante = (v: number) => Array.from({ length: anos }, () => v)
  const taxa = lim(resumo(rs, "taxaImposto", 3).mediana ?? 0.21, 0.1, 0.35)

  const avaliacao: PressupostosAvaliacao = {
    rf: ctx.rf ?? RF_POR_OMISSAO,
    erp: ERP_POR_OMISSAO,
    beta: ctx.beta !== null && ctx.beta > 0 ? Math.round((0.67 * lim(ctx.beta, 0.2, 3) + 0.33) * 100) / 100 : 1,
    custoDivida: lim(ctx.custoDivida ?? (ctx.rf ?? RF_POR_OMISSAO) + 0.015, 0.02, 0.12),
    taxaImpostoWacc: taxa,
    waccManual: null,
    g,
    // O múltiplo atual é o ponto de partida mais honesto, mas múltiplos de
    // crescimento não duram para sempre: limita-se a [6x, 20x].
    multiploSaida: Math.round(lim(ctx.evEbitdaAtual ?? 12, 6, 20) * 10) / 10,
    metodoTerminal: "gordon",
    meioDoAno: true,
  }

  return {
    anos,
    modoReceita: "total",
    receitaSegmentos: segmentosIniciais(hist, crescimento),
    drivers: {
      crescimentoReceita: crescimento,
      margemBruta: constante(lim(med3("margemBruta", 1), -1, 1)),
      margemEbit: margens,
      daPctReceita: constante(lim(resumo(rs, "daPctReceita", 3).ultimo ?? med3("daPctReceita", 0.04), 0, 0.5)),
      capexPctReceita: constante(lim(resumo(rs, "capexPctReceita", 3).ultimo ?? med3("capexPctReceita", 0.05), 0, 0.6)),
      dso: constante(lim(med3("dso", 45), 0, 365)),
      dio: constante(lim(med3("dio", 0), 0, 365)),
      dpo: constante(lim(med3("dpo", 30), 0, 365)),
      taxaImposto: constante(taxa),
    },
    avaliacao,
  }
}

/** Muda o horizonte mantendo o que o analista já escreveu nos anos comuns. */
export function mudarHorizonte(p: Pressupostos, anos: number): Pressupostos {
  const drivers = Object.fromEntries(
    Object.entries(p.drivers).map(([k, v]) => {
      const out = v.slice(0, anos)
      while (out.length < anos) out.push(out[out.length - 1] ?? 0)
      return [k, out]
    }),
  ) as Pressupostos["drivers"]
  const estender = (v: number[]) => { const o = v.slice(0, anos); while (o.length < anos) o.push(o[o.length - 1] ?? 0); return o }
  const receitaSegmentos = p.receitaSegmentos
    ? { ...p.receitaSegmentos, segmentos: p.receitaSegmentos.segmentos.map((s) => ({ ...s, crescimento: estender(s.crescimento) })) }
    : p.receitaSegmentos
  return { ...p, anos, drivers, receitaSegmentos }
}

/** Preenche um driver em linha reta do ano `de` ao último, até `valorFinal`. */
export function interpolar(valores: number[], de: number, valorFinal: number): number[] {
  const out = [...valores]
  const n = out.length - de
  if (n <= 0) return out
  const l = linha(out[de], valorFinal, n)
  for (let i = 0; i < n; i++) out[de + i] = l[i]
  return out
}

/**
 * Segmentos para o Revenue Build, a partir do histórico.
 *
 * Usa o eixo de produto se o último ano tiver pelo menos 2 segmentos, senão
 * o geográfico. Os segmentos são os do ÚLTIMO ano: as empresas reorganizam-
 * se (a Microsoft trocou "Office" por "Microsoft 365") e projetar nomes que já
 * não existem não faz sentido.
 *
 * Crescimento por omissão: o CAGR de 3 anos de cada segmento (ou o último ano,
 * se só houver 2), CALIBRADO ao crescimento total do ano 1 — soma-se a cada
 * segmento a diferença entre o crescimento total e a média ponderada dos
 * segmentos. Assim, mudar para o modo por segmento não altera o valor até o
 * analista mexer. Depois converge em linha reta para o mesmo destino da
 * receita total.
 */
export function segmentosIniciais(hist: AnoHistorico[], crescimentoTotal: number[]): ReceitaSegmentos | null {
  const ult = hist[hist.length - 1]
  const escolher = (eixo: "product" | "geography") => {
    const m = ult?.segmentos?.[eixo]
    return m && Object.keys(m).length >= 2 ? m : null
  }
  const eixo: "product" | "geography" | null = escolher("product") ? "product" : escolher("geography") ? "geography" : null
  if (!eixo || !ult.revenue) return null
  const atual = escolher(eixo)!
  const n = crescimentoTotal.length
  const nomes = Object.keys(atual).filter((k) => atual[k] > 0)
  if (nomes.length < 2) return null

  const cagrDe = (nome: string): number | null => {
    const serie = hist.map((a) => a.segmentos?.[eixo]?.[nome] ?? null)
    const fim = serie[serie.length - 1]
    for (const anos of [3, 2, 1]) {
      const ini = serie[serie.length - 1 - anos]
      if (ini && ini > 0 && fim && fim > 0) return Math.pow(fim / ini, 1 / anos) - 1
    }
    return null
  }
  const soma = nomes.reduce((s, k) => s + atual[k], 0)
  const cagrs = nomes.map((k) => cagrDe(k) ?? crescimentoTotal[0])
  const media = nomes.reduce((s, k, i) => s + (atual[k] / soma) * cagrs[i], 0)
  const ajuste = crescimentoTotal[0] - media
  const destino = crescimentoTotal[n - 1]

  return {
    eixo,
    outros: ult.revenue - soma,
    segmentos: nomes.map((k, i) => ({
      nome: k,
      base: atual[k],
      crescimento: linha(lim(cagrs[i] + ajuste, -0.3, 0.6), destino, n),
    })),
  }
}
