// @vitest-environment node
import { describe, it, expect } from "vitest"
import React from "react"
import {
  projetar, avaliar, racios, cenariosIniciais, pressupostosIniciais,
  type AnoHistorico,
} from "@/lib/finance/modelo"
import { exportarExcel } from "@/components/dcf/modelo/exportar/excel"
import type { ContextoSeparador } from "@/components/dcf/modelo/Separadores"

const hist = (ano: number, k: number): AnoHistorico => ({
  fiscalYear: ano, periodEnd: `${ano}-12-31`, revenue: 1000 * k, costOfRevenue: 600 * k, grossProfit: 400 * k,
  operatingExpenses: 200 * k, operatingIncome: 200 * k, ebitda: 250 * k, depreciationAndAmortization: 50 * k, capex: 60 * k,
  accountsReceivable: 100 * k, inventory: 50 * k, accountsPayable: 80 * k, deferredRevenue: 40 * k, taxExpense: 50 * k, incomeBeforeTax: 200 * k,
  stockBasedCompensation: null, operatingCashFlow: 230 * k, freeCashFlow: 170 * k,
})
const historico = [hist(2023, 0.8), hist(2024, 0.9), hist(2025, 1)]
const mercado = { preco: 15, acoes: 100, dividaTotal: 200, caixa: 50, interessesMinoritarios: 10 }

function contexto(): ContextoSeparador {
  const ini = pressupostosIniciais(historico, racios(historico), [], { rf: 0.04, beta: 1, custoDivida: 0.05, evEbitdaAtual: 10 } as never)
  const conjunto = { ...cenariosIniciais(ini), tese: "Tese de teste" }
  const p = conjunto.cenarios.base
  const { projecoes, avaliacao } = avaliar(projetar(historico[2], p), p.avaliacao, mercado, 1, 1)
  return {
    ticker: "TEST", historico, racios: racios(historico), pressupostos: p, iniciais: ini, projecoes, avaliacao, mercado,
    estimativas: [], multiplosHistoricos: [], evEbitdaAtual: 10, pares: null, macro: { cpi: null, pib: null, data: null },
    fracaoAno1: 1, anosAteFimAno1: 1, cenario: "base", conjunto,
    empresa: { nome: "Test Corp", setor: "Tech", industria: "Software" },
  } as unknown as ContextoSeparador
}
const t = (k: string) => k

describe("exportações do modelo", () => {
  it("Excel: folhas esperadas e a ponte com fórmulas que dão o valor por ação do modelo", async () => {
    const c = contexto()
    const blob = await exportarExcel(c, t, new Date("2026-10-10"))
    const { Workbook } = await import("exceljs")
    const wb = new Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Assumptions", "Projections", "Valuation", "Sensitivity"])
    const va = wb.getWorksheet("Valuation")!
    let achado = false
    va.eachRow((row) => {
      const cel = row.getCell(2).value as { formula?: string; result?: number } | null
      if (cel && typeof cel === "object" && cel.formula?.includes("/B")) {
        expect(cel.result).toBeCloseTo(c.avaliacao.valorPorAcao, 6)
        achado = true
      }
    })
    expect(achado).toBe(true)
    const resumo = wb.getWorksheet("Summary")!
    const texto: string[] = []
    resumo.eachRow((r) => r.eachCell((x) => texto.push(String(x.value))))
    expect(texto).toContain("Tese de teste")
    expect(texto).toContain("legal.aviso")
  })

  it("PDF: gera um ficheiro válido com o aviso legal", async () => {
    const { renderToBuffer } = await import("@react-pdf/renderer")
    const { ResumoPdf } = await import("@/components/dcf/modelo/exportar/ResumoPdf")
    const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "N/A" : String(Math.round(v * 100) / 100))
    const buf = await renderToBuffer(React.createElement(ResumoPdf, { c: contexto(), t, fmt, geradoEm: "2026-10-10" }) as never)
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-")
    expect(buf.length).toBeGreaterThan(2000)
  })
})
