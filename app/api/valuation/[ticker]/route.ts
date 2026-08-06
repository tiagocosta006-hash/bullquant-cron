import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params
    
    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() }
    })

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const allPrices = await prisma.price.findMany({
      where: { ticker: ticker.toUpperCase() },
      orderBy: { date: 'asc' }
    })

    if (allPrices.length === 0) {
      return NextResponse.json({ error: "No prices found" }, { status: 404 })
    }

    const allFundamentals = await prisma.fundamental.findMany({
      where: { companyId: company.id },
      orderBy: { periodEnd: 'asc' }
    })

    // Data em que o período passou a ser público. `filedAt` é a fonte
    // preferida, MAS na BD muitos trimestres antigos foram carregados a partir
    // das colunas comparativas de uma filing posterior — ficaram com o filedAt
    // dessa filing (ex.: AAPL FY2025Q1, fechado em 2024-12-28, com filedAt
    // 2026-05-01). Usar isso tal e qual atrasava toda a série de fundamentais
    // ~1 ano face ao preço, inflando P/E e desalinhando o gráfico preço vs
    // lucros. Quando o desvio face ao fim do período é implausível para o
    // calendário da SEC, caímos no prazo legal de reporte (10-Q ~40 dias,
    // 10-K ~60-75 dias) em vez de confiar num filedAt claramente errado.
    // O corte de plausibilidade não é arbitrário: a distribuição de
    // (filedAt − periodEnd) na BD tem uma banda vazia entre os 71 e os 95 dias
    // (8 linhas trimestrais e 7 anuais em ~24 mil). Abaixo dela estão as
    // filings verdadeiras (10-Q até ~40 dias, 10-K e Q4 até ~70); acima estão
    // as datas herdadas da filing SEGUINTE, que aparecem em múltiplos de um
    // trimestre (a GOOGL tinha o Q4'25 com 120 dias e o Q2'25 com 122 — ambos
    // a data de um filing posterior). Cortar a meio da banda vazia separa as
    // duas populações sem tocar em nenhuma filing legítima.
    const DAY = 24 * 3600 * 1000
    const MAX_PLAUSIBLE_LAG_DAYS = 85
    const fundamentalsWithDate = allFundamentals.map(f => {
      const periodEnd = f.periodEnd.getTime()
      const isAnnual = f.periodType === 'ANNUAL'
      const typicalLag = (isAnnual ? 65 : 45) * DAY
      const maxPlausibleLag = MAX_PLAUSIBLE_LAG_DAYS * DAY
      const filed = f.filedAt ? f.filedAt.getTime() : null
      const filedIsPlausible = filed !== null && filed >= periodEnd && filed - periodEnd <= maxPlausibleLag
      return {
        ...f,
        availableAt: filedIsPlausible ? filed : periodEnd + typicalLag
      }
    }).sort((a, b) => a.availableAt - b.availableAt)

    const quarters = fundamentalsWithDate.filter(f => f.periodType === 'QUARTERLY')
    const annuals = fundamentalsWithDate.filter(f => f.periodType === 'ANNUAL')

    // Guarda de splits. Em ~14% dos emitentes o sharesOutstanding e o
    // epsDiluted históricos ficaram numa base de split diferente da dos
    // preços (o ajuste na ingestão só toca nas linhas do lote em curso, e o
    // histórico já gravado nunca é revisitado). Nesses casos qualquer métrica
    // POR AÇÃO fica errada por um fator inteiro — o WMT dava P/E de 5,4x em
    // 2016 em vez de ~15x. O net income é imune, porque não é por ação.
    //
    // Um degrau na série de ações é a assinatura: emissões e recompras reais
    // são graduais, um split é instantâneo. Detetado o degrau, deixamos de
    // emitir epsTtm e o gráfico cai sozinho para net income (ver
    // lib/finance/priceVsEarnings.ts). Enquanto os splits não estiverem
    // corrigidos na origem, é preferível uma série imune a uma série elegante.
    const SPLIT_BREAK = 1.4
    const shareSeries = [...quarters]
      .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime())
      .map(q => q.sharesOutstanding?.toNumber())
      .filter((s): s is number => typeof s === 'number' && s > 0)
    const hasSplitBreak = shareSeries.some((s, i) => {
      if (i === 0) return false
      const ratio = s / shareSeries[i - 1]
      return ratio > SPLIT_BREAK || ratio < 1 / SPLIT_BREAK
    })

    const weeklyPrices = allPrices

    function getTtm(latest4: typeof quarters) {
      let ttmEps = 0;
      let ttmRev = 0;
      let ttmFcf: number | null = 0;
      let ttmNi = 0;

      let hasAllEps = true;
      let hasAllRev = true;
      let hasAllFcf = true;
      let hasAllNi = true;

      let totalCapex = 0;
      let capexCount = 0;
      for (const q of latest4) {
        const c = q.capex?.toNumber();
        if (c !== undefined && c !== null) {
          totalCapex += c;
          capexCount++;
        }
      }
      const avgCapex = capexCount > 0 ? totalCapex / capexCount : 0;

      for (const q of latest4) {
        // epsDiluted tem buracos grandes na BD para vários emitentes (a VISA
        // não tem um único trimestre preenchido; COST/CRM/PEP/WMT têm ~75% em
        // falta), mas netIncome e sharesOutstanding estão completos. Derivar
        // dá o mesmo número: validado contra os trimestres onde ambos existem,
        // desvio máximo de 0,3%. Sem este fallback essas empresas ficavam sem
        // gráfico de preço vs lucros e sem P/E pela via trimestral.
        let eps = q.epsDiluted?.toNumber();
        if (eps === undefined || eps === null) {
          const ni = q.netIncome?.toNumber();
          const sh = q.sharesOutstanding?.toNumber();
          if (ni !== undefined && ni !== null && sh) eps = ni / sh;
        }
        if (eps !== undefined && eps !== null) ttmEps += eps; else hasAllEps = false;

        const rev = q.revenue?.toNumber();
        if (rev !== undefined && rev !== null) ttmRev += rev; else hasAllRev = false;

        const ni = q.netIncome?.toNumber();
        if (ni !== undefined && ni !== null) ttmNi += ni; else hasAllNi = false;

        let fcf = q.freeCashFlow?.toNumber();
        if (fcf === undefined || fcf === null) {
          const ocf = q.operatingCashFlow?.toNumber();
          if (ocf !== undefined && ocf !== null) {
            fcf = ocf - Math.abs(avgCapex);
          }
        }
        if (fcf !== undefined && fcf !== null) ttmFcf += fcf; else hasAllFcf = false;
      }
      return {
        ttmEps: hasAllEps ? ttmEps : null,
        ttmRev: hasAllRev ? ttmRev : null,
        ttmFcf: hasAllFcf ? ttmFcf : null,
        ttmNi: hasAllNi ? ttmNi : null
      }
    }

    const results = []

    for (const p of weeklyPrices) {
      const priceTime = p.date.getTime()
      const priceVal = p.close.toNumber()
      
      let ttmEps: number | null = null
      let ttmRev: number | null = null
      let ttmFcf: number | null = null
      let ttmNi: number | null = null
      let shares: number | null = null
      let foundTtm = false;

      const validQ = quarters.filter(f => f.availableAt <= priceTime)
      if (validQ.length > 0) {
        const qMap = new Map()
        for (const q of validQ) {
          qMap.set(`${q.fiscalYear}-${q.fiscalQuarter}`, q)
        }
        const latest4 = Array.from(qMap.values())
          .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())
          .slice(0, 4)
        
        if (latest4.length === 4) {
          const daysDiff = (latest4[0].periodEnd.getTime() - latest4[3].periodEnd.getTime()) / (1000 * 3600 * 24);
          if (daysDiff > 200 && daysDiff < 400) {
            const ttm = getTtm(latest4)
            if (ttm.ttmEps !== null || ttm.ttmRev !== null) {
              ttmEps = ttm.ttmEps
              ttmRev = ttm.ttmRev
              ttmFcf = ttm.ttmFcf
              ttmNi = ttm.ttmNi
              shares = latest4[0].sharesOutstanding?.toNumber() || null
              foundTtm = true
            }
          }
        }
      }

      if (!foundTtm) {
        const validA = annuals.filter(f => f.availableAt <= priceTime)
        if (validA.length > 0) {
          const latest = validA[validA.length - 1]
          ttmEps = latest.epsDiluted ? latest.epsDiluted.toNumber() : null
          if (ttmEps === null) {
            // Mesmo fallback do caminho trimestral (ver getTtm)
            const niA = latest.netIncome?.toNumber()
            const shA = latest.sharesOutstanding?.toNumber()
            if (niA !== undefined && niA !== null && shA) ttmEps = niA / shA
          }
          ttmRev = latest.revenue ? latest.revenue.toNumber() : null
          ttmNi = latest.netIncome ? latest.netIncome.toNumber() : null
          
          let fcf = latest.freeCashFlow?.toNumber();
          if (fcf === undefined || fcf === null) {
            const ocf = latest.operatingCashFlow?.toNumber();
            const capex = latest.capex?.toNumber();
            if (ocf !== undefined && ocf !== null) {
              fcf = ocf - Math.abs(capex || 0);
            }
          }
          ttmFcf = fcf !== undefined ? fcf : null
          shares = latest.sharesOutstanding ? latest.sharesOutstanding.toNumber() : null
        }
      }

      const obj: {
        date: string
        price: number
        netIncome?: number
        epsTtm?: number
        pe?: number
        ps?: number
        fcfYield?: number
      } = {
        date: p.date.toISOString().split('T')[0],
        price: priceVal
      }

      // Lucro TTM point-in-time: serve o gráfico "preço vs lucros" (indexado).
      // Vai em bruto (sem sinal filtrado) — prejuízos são informação, não ruído.
      if (ttmNi !== null) {
        obj.netIncome = ttmNi
      }
      // Omitido de propósito quando a base de splits é inconsistente: a
      // ausência do campo é o sinal para o gráfico usar net income.
      if (ttmEps !== null && !hasSplitBreak) {
        obj.epsTtm = ttmEps
      }

      if (ttmEps !== null && ttmEps > 0) {
        obj.pe = priceVal / ttmEps
      }
      if (shares !== null && shares > 0) {
        const marketCap = priceVal * shares
        if (ttmRev !== null && ttmRev > 0) {
          obj.ps = marketCap / ttmRev
        }
        if (ttmFcf !== null) {
          obj.fcfYield = ttmFcf / marketCap
        }
      }

      if (obj.pe !== undefined || obj.ps !== undefined || obj.fcfYield !== undefined
          || obj.netIncome !== undefined || obj.epsTtm !== undefined) {
        results.push(obj)
      }
    }

    // Rota pesada (histórico completo + série de múltiplos) — a CDN absorve os hits
    return NextResponse.json(results, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    })
  } catch (error) {
    console.error("Error fetching valuation:", error)
    return NextResponse.json(
      { error: "Failed to fetch valuation metrics" },
      { status: 500 }
    )
  }
}
