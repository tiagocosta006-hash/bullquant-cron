import {
  grelhaWaccG, grelhaWaccMultiplo, grelhaCrescimentoMargem, correrCenarios, DRIVERS,
  type Grelha,
} from "@/lib/finance/modelo"
import type { ContextoSeparador } from "../Separadores"

/**
 * Exporta o modelo para Excel (.xlsx): Summary, Assumptions, Projections,
 * Valuation (com a ponte EV → valor por ação em fórmulas vivas) e Sensitivity.
 * O resto são valores: não é uma réplica do modelo em fórmulas, é uma fotografia
 * do cenário ativo, com os pressupostos à vista.
 *
 * `t` traduz as chaves de `dcfModelo`; o rótulo dos números vem das mesmas
 * chaves que a interface usa, para o ficheiro e o ecrã dizerem o mesmo.
 */

type T = (chave: string, valores?: Record<string, string | number>) => string

const M = "#,##0.0;(#,##0.0)"
const PCT = "0.0%"
const X = '0.0"x"'
const USD = "$#,##0.00"

export async function exportarExcel(c: ContextoSeparador, t: T, geradoEm: Date = new Date()): Promise<Blob> {
  const { Workbook } = await import("exceljs")
  const wb = new Workbook()
  wb.creator = "BullValue"
  wb.created = geradoEm

  const v = c.avaliacao
  const a = c.pressupostos.avaliacao
  const m = c.mercado
  const mi = (x: number) => x / 1e6
  const ativo = c.cenario
  const anos = c.projecoes.map((p) => p.fiscalYear)
  const negrito = { bold: true }
  const cab = { bold: true, color: { argb: "FFFFFFFF" } }
  const fundoCab = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1F6F54" } }

  const cabecalhoSheet = (ws: ReturnType<typeof wb.addWorksheet>, titulo: string) => {
    ws.addRow([`${c.empresa.nome} (${c.ticker}) — ${titulo}`]).font = { bold: true, size: 14 }
    ws.addRow([`${t("resumo.cenarioAtivo")}: ${t(`cenario.nomes.${ativo}`)} · ${geradoEm.toISOString().slice(0, 10)} · ${t("unidade")}`]).font = { italic: true, color: { argb: "FF666666" } }
    ws.addRow([])
  }
  const linhaCab = (ws: ReturnType<typeof wb.addWorksheet>, valores: (string | number)[]) => {
    const r = ws.addRow(valores)
    r.font = cab
    r.eachCell((cel) => { cel.fill = fundoCab })
    return r
  }

  // ── Summary ──
  const s = wb.addWorksheet("Summary")
  cabecalhoSheet(s, "Summary")
  s.addRow([t("avaliacao.valorPorAcao"), v.valorPorAcao]).getCell(2).numFmt = USD
  s.addRow([t("avaliacao.preco"), v.preco]).getCell(2).numFmt = USD
  s.addRow([t("avaliacao.potencial"), v.potencial]).getCell(2).numFmt = PCT
  s.addRow([t("avaliacao.margemSeguranca"), v.margemSeguranca]).getCell(2).numFmt = PCT
  s.addRow([])
  const base = c.historico[c.historico.length - 1]
  const cen = correrCenarios(base, c.conjunto, m, c.fracaoAno1, c.anosAteFimAno1)
  linhaCab(s, [t("cenario.rotulo"), t("avaliacao.valorPorAcao"), t("avaliacao.potencial"), t("sensibilidade.cenarios.probabilidade")])
  for (const l of cen.linhas) {
    const r = s.addRow([t(`cenario.nomes.${l.nome}`), l.valor ?? "N/A", l.valor !== null && m.preco > 0 ? l.valor / m.preco - 1 : "N/A", c.conjunto.probabilidades[l.nome]])
    r.getCell(2).numFmt = USD; r.getCell(3).numFmt = PCT; r.getCell(4).numFmt = PCT
  }
  const re = s.addRow([t("sensibilidade.cenarios.esperado"), cen.esperado ?? "N/A", cen.esperado !== null && m.preco > 0 ? cen.esperado / m.preco - 1 : "N/A"])
  re.font = negrito; re.getCell(2).numFmt = USD; re.getCell(3).numFmt = PCT
  s.addRow([])
  if (c.conjunto.tese?.trim()) {
    s.addRow([t("resumo.tese")]).font = negrito
    const r = s.addRow([c.conjunto.tese.trim()])
    s.mergeCells(r.number, 1, r.number, 4)
    r.alignment = { wrapText: true, vertical: "top" }
    r.height = Math.min(300, 15 * Math.ceil(c.conjunto.tese.length / 90) + 15)
    s.addRow([])
  }
  const av = s.addRow([t("legal.aviso")])
  s.mergeCells(av.number, 1, av.number, 4)
  av.alignment = { wrapText: true, vertical: "top" }
  av.font = { italic: true, size: 9, color: { argb: "FF666666" } }
  av.height = 90
  s.getColumn(1).width = 44; s.getColumn(2).width = 18; s.getColumn(3).width = 18; s.getColumn(4).width = 18

  // ── Assumptions ──
  const as = wb.addWorksheet("Assumptions")
  cabecalhoSheet(as, "Assumptions")
  linhaCab(as, ["", ...anos.map((y) => `${y}E`)])
  const fmtDriver = (d: (typeof DRIVERS)[number]) => (["dso", "dio", "dpo", "diasReceitaDiferida"].includes(d) ? "0" : PCT)
  for (const d of DRIVERS) {
    const serie = c.pressupostos.drivers[d]
    if (!serie) continue
    const r = as.addRow([t(`drivers.${d}`), ...serie])
    for (let i = 2; i <= anos.length + 1; i++) r.getCell(i).numFmt = fmtDriver(d)
  }
  as.addRow([])
  linhaCab(as, [t("pressupostos.avaliacao"), ""])
  const par = (r: string, val: number | string, fmt?: string) => { const x = as.addRow([r, val]); if (fmt) x.getCell(2).numFmt = fmt }
  par(t("pressupostos.rf"), a.rf, PCT)
  par(t("pressupostos.beta"), a.beta, "0.00")
  par(t("pressupostos.erp"), a.erp, PCT)
  par(t("pressupostos.custoDivida"), a.custoDivida, PCT)
  par(t("pressupostos.taxaImpostoWacc"), a.taxaImpostoWacc, PCT)
  par(t("avaliacao.wacc"), v.wacc.wacc, PCT)
  par(t("pressupostos.g"), a.g, PCT)
  par(t("pressupostos.multiplo"), a.multiploSaida, X)
  par(t("pressupostos.metodo"), t(`pressupostos.metodos.${a.metodoTerminal}`))
  par(t("pressupostos.meioDoAno"), a.meioDoAno ? "Yes" : "No")
  as.getColumn(1).width = 40
  for (let i = 2; i <= anos.length + 1; i++) as.getColumn(i).width = 12

  // ── Projections ──
  const pj = wb.addWorksheet("Projections")
  cabecalhoSheet(pj, "Projections")
  linhaCab(pj, ["", ...anos.map((y) => `${y}E`)])
  const L = (rotulo: string, f: (p: (typeof c.projecoes)[number]) => number, fmt = M, forte = false) => {
    const r = pj.addRow([rotulo, ...c.projecoes.map((p) => (fmt === M ? mi(f(p)) : f(p)))])
    for (let i = 2; i <= anos.length + 1; i++) r.getCell(i).numFmt = fmt
    if (forte) r.font = negrito
  }
  L(t("linhas.receita"), (p) => p.receita, M, true)
  L(t("linhas.custoVendas"), (p) => -p.cogs)
  L(t("linhas.lucroBruto"), (p) => p.lucroBruto, M, true)
  L(t("linhas.ebitda"), (p) => p.ebitda)
  L(t("linhas.daMenos"), (p) => -p.da)
  L(t("linhas.ebit"), (p) => p.ebit, M, true)
  L(t("linhas.impostosMenos"), (p) => -p.impostosOperacionais)
  L(t("linhas.nopat"), (p) => p.nopat, M, true)
  L(t("linhas.daMais"), (p) => p.da)
  L(t("linhas.capexMenos"), (p) => -p.capex)
  L(t("linhas.varFundoManeioMenos"), (p) => -p.variacaoFundoManeio)
  L(t("linhas.fcff"), (p) => p.fcff, M, true)
  pj.addRow([])
  L(t("linhas.fracao"), (p) => p.fracao, PCT)
  L(t("linhas.periodo"), (p) => p.periodoDesconto, "0.00")
  L(t("linhas.fator"), (p) => p.fatorDesconto, "0.000")
  L(t("linhas.vp"), (p) => p.fcff * p.fracao * p.fatorDesconto, M, true)
  pj.getColumn(1).width = 36
  for (let i = 2; i <= anos.length + 1; i++) pj.getColumn(i).width = 12

  // ── Valuation (a ponte com fórmulas vivas) ──
  const va = wb.addWorksheet("Valuation")
  cabecalhoSheet(va, "Valuation")
  const pv = (r: string, val: number, fmt: string) => { const x = va.addRow([r, val]); x.getCell(2).numFmt = fmt; return x.number }
  pv(t("pressupostos.rf"), a.rf, PCT)
  pv(t("avaliacao.custoCapital"), v.wacc.custoCapitalProprio, PCT)
  pv(t("avaliacao.custoDividaApos"), v.wacc.custoDividaAposImpostos, PCT)
  pv(t("avaliacao.pesoCapital"), v.wacc.pesoCapitalProprio, PCT)
  pv(t("avaliacao.pesoDivida"), v.wacc.pesoDivida, PCT)
  pv(t("avaliacao.wacc"), v.wacc.wacc, PCT)
  va.addRow([])
  pv(t("avaliacao.gordon"), mi(v.terminalGordon), M)
  pv(t("avaliacao.multiploSaida", { x: `${a.multiploSaida}x` }), mi(v.terminalMultiplo), M)
  pv(t(`avaliacao.usado.${a.metodoTerminal}`), mi(v.terminalUsado), M)
  pv(t("avaliacao.pesoTerminal"), v.pesoTerminal, PCT)
  va.addRow([])
  linhaCab(va, [t("avaliacao.ponte"), ""])
  const rSoma = pv(t("avaliacao.somaVp"), mi(v.somaVpFcff), M)
  const rVpt = pv(t("avaliacao.vpTerminal"), mi(v.vpTerminal), M)
  const rEv = va.addRow([t("avaliacao.ev")]).number
  va.getCell(`B${rEv}`).value = { formula: `B${rSoma}+B${rVpt}`, result: mi(v.enterpriseValue) }
  va.getCell(`B${rEv}`).numFmt = M; va.getRow(rEv).font = negrito
  const rDiv = pv(t("avaliacao.divida"), mi(m.dividaTotal), M)
  const rCx = pv(t("avaliacao.caixa"), mi(m.caixa), M)
  const rMin = pv(t("avaliacao.minoritarios"), mi(m.interessesMinoritarios), M)
  const rCap = va.addRow([t("avaliacao.capitalProprio")]).number
  va.getCell(`B${rCap}`).value = { formula: `B${rEv}-B${rDiv}+B${rCx}-B${rMin}`, result: mi(v.valorCapitalProprio) }
  va.getCell(`B${rCap}`).numFmt = M; va.getRow(rCap).font = negrito
  const rAc = pv(t("avaliacao.acoes"), mi(m.acoes), M)
  const rVps = va.addRow([t("avaliacao.valorPorAcao")]).number
  va.getCell(`B${rVps}`).value = { formula: `B${rCap}/B${rAc}`, result: v.valorPorAcao }
  va.getCell(`B${rVps}`).numFmt = USD; va.getRow(rVps).font = negrito
  va.getColumn(1).width = 44; va.getColumn(2).width = 16

  // ── Sensitivity ──
  const se = wb.addWorksheet("Sensitivity")
  cabecalhoSheet(se, "Sensitivity")
  const ctx = { base, pressupostos: c.pressupostos, mercado: m, f: c.fracaoAno1, d0: c.anosAteFimAno1 }
  const grelha = (titulo: string, g: Grelha, linhaBase: number, colBase: number, fl: string, fc: string) => {
    se.addRow([titulo]).font = negrito
    linhaCab(se, ["", ...g.colunas.map((dc) => colBase + dc)]).eachCell((cel, i) => { if (i > 1) cel.numFmt = fc })
    g.linhas.forEach((dl, i) => {
      const r = se.addRow([linhaBase + dl, ...g.valores[i].map((x) => x ?? "N/A")])
      r.getCell(1).numFmt = fl; r.getCell(1).font = negrito
      for (let j = 2; j <= g.colunas.length + 1; j++) r.getCell(j).numFmt = USD
    })
    se.addRow([])
  }
  if (a.metodoTerminal !== "multiplo") grelha(`${t("avaliacao.wacc")} × ${t("pressupostos.g")}`, grelhaWaccG(ctx), v.wacc.wacc, a.g, PCT, PCT)
  if (a.metodoTerminal !== "gordon") grelha(`${t("avaliacao.wacc")} × ${t("pressupostos.multiplo")}`, grelhaWaccMultiplo(ctx), v.wacc.wacc, a.multiploSaida, PCT, X)
  grelha(`${t("drivers.crescimentoReceita")} × ${t("drivers.margemEbit")} (Δ pp)`, grelhaCrescimentoMargem(ctx), 0, 0, PCT, PCT)
  se.getColumn(1).width = 30
  for (let i = 2; i <= 7; i++) se.getColumn(i).width = 13

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}
