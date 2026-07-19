import { PrismaClient } from '@prisma/client';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando Ingestão Rápida de Fundamentos (Yahoo Finance)...");
  
  // 1. Procurar empresas que reportaram nos últimos 3 dias
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  
  const endOfToday = new Date();
  endOfToday.setDate(endOfToday.getDate() + 1);

  const recentEvents = await prisma.earningsEvent.findMany({
    where: {
      date: {
        gte: threeDaysAgo,
        lte: endOfToday,
      },
    },
    include: {
      company: true,
    },
  });

  const companiesToUpdate = Array.from(new Set(recentEvents.map(e => e.company.id)))
    .map(id => recentEvents.find(e => e.company.id === id)?.company);

  console.log(`Encontradas ${companiesToUpdate.length} empresas que reportaram recentemente.`);

  if (companiesToUpdate.length === 0) {
    console.log("Nenhuma empresa a processar. A terminar.");
    return;
  }

  // Obter o ano passado para o period1
  const oneYearAgoStr = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0];

  let errors = 0;
  for (const company of companiesToUpdate) {
    if (!company) continue;
    const ticker = company.ticker;
    
    try {
      console.log(`\nA processar ${ticker}...`);
      
      const [fundamentals, quote] = await Promise.all([
        yahooFinance.fundamentalsTimeSeries(ticker, {
          period1: oneYearAgoStr,
          module: 'all'
        }),
        yahooFinance.quoteSummary(ticker, { modules: ['financialData'] })
      ]);

      const financialCurrency = quote.financialData?.financialCurrency?.toUpperCase() || company.currency || 'USD';

      // Filtrar apenas dados trimestrais
      const quarters = fundamentals.filter((f: any) => f.periodType === '3M' && f.date);
      
      if (quarters.length === 0) {
        console.log(`[${ticker}] Nenhum dado trimestral encontrado no Yahoo.`);
        continue;
      }

      // Ordenar por data decrescente e pegar o mais recente
      quarters.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latest = quarters[0];

      const event = recentEvents.find((e: any) => e.company.id === company.id);
      const periodEnd = new Date(latest.date);
      
      // Proteção: Garantir que o trimestre do Yahoo corresponde ao evento de Earnings
      const quarterAgeDays = (new Date(event.date).getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24);
      if (quarterAgeDays > 105 || quarterAgeDays < -10) {
        console.log(`[${ticker}] Ignorado: Yahoo ainda não tem os dados novos (Trimestre de ${periodEnd.toISOString().split('T')[0]}).`);
        continue;
      }

      const fiscalYear = event?.fiscalYear ?? periodEnd.getFullYear();
      const fiscalQuarter = event?.fiscalQuarter ?? Math.ceil((periodEnd.getMonth() + 1) / 3);
      
      let revenue = latest.totalRevenue ?? null;
      let costOfRevenue = latest.costOfRevenue ?? null;
      let grossProfit = latest.grossProfit ?? null;
      let operatingExpenses = latest.totalOperatingExpenses ?? null;
      let ebitda = latest.EBITDA ?? null;
      let operatingIncome = latest.operatingIncome ?? null;
      let netIncome = latest.netIncome ?? latest.netIncomeFromContinuingOperations ?? null;
      let operatingCashFlow = latest.operatingCashFlow ?? null;
      let capex = latest.capitalExpenditure ? Math.abs(latest.capitalExpenditure) : null;
      let freeCashFlow = latest.freeCashFlow ?? null;
      let totalAssets = latest.totalAssets ?? null;
      let totalDebt = latest.totalDebt ?? null;

      // Conversão de moeda (FX) para USD
      const currency = financialCurrency;
      if (currency !== 'USD') {
        try {
          const fxDate = periodEnd.toISOString().split('T')[0];
          const fxRes = await fetch(`https://api.frankfurter.dev/v1/${fxDate}?base=${currency}&symbols=USD`);
          if (fxRes.ok) {
            const fxData = await fxRes.json();
            const rate = fxData.rates.USD;
            if (rate) {
              if (revenue) revenue = revenue * rate;
              if (costOfRevenue) costOfRevenue = costOfRevenue * rate;
              if (grossProfit) grossProfit = grossProfit * rate;
              if (operatingExpenses) operatingExpenses = operatingExpenses * rate;
              if (ebitda) ebitda = ebitda * rate;
              if (operatingIncome) operatingIncome = operatingIncome * rate;
              if (netIncome) netIncome = netIncome * rate;
              if (operatingCashFlow) operatingCashFlow = operatingCashFlow * rate;
              if (capex) capex = capex * rate;
              if (freeCashFlow) freeCashFlow = freeCashFlow * rate;
              if (totalAssets) totalAssets = totalAssets * rate;
              if (totalDebt) totalDebt = totalDebt * rate;
              console.log(`[${ticker}] Conversão FX aplicada: 1 ${currency} = ${rate} USD`);
            }
          }
        } catch (fxErr) {
          console.warn(`[${ticker}] Aviso: Falha na conversão de moeda (${currency} -> USD). Os valores podem estar incorretos.`, fxErr);
        }
      }

      let grossMargin = null;
      let operatingMargin = null;
      let netMargin = null;
      
      if (revenue && revenue > 0) {
        if (grossProfit !== null) grossMargin = grossProfit / revenue;
        if (operatingIncome !== null) operatingMargin = operatingIncome / revenue;
        if (netIncome !== null) netMargin = netIncome / revenue;
      }

      await prisma.fundamental.upsert({
        where: {
          companyId_periodType_fiscalYear_fiscalQuarter: {
            companyId: company.id,
            periodType: 'QUARTERLY',
            fiscalYear,
            fiscalQuarter,
          }
        },
        update: {
          revenue, costOfRevenue, grossProfit, operatingExpenses,
          ebitda, operatingIncome, netIncome, operatingCashFlow,
          capex, freeCashFlow, totalAssets, totalDebt,
          grossMargin, operatingMargin, netMargin
        },
        create: {
          companyId: company.id,
          periodType: 'QUARTERLY',
          fiscalYear,
          fiscalQuarter,
          periodEnd,
          revenue, costOfRevenue, grossProfit, operatingExpenses,
          ebitda, operatingIncome, netIncome, operatingCashFlow,
          capex, freeCashFlow, totalAssets, totalDebt,
          grossMargin, operatingMargin, netMargin
        }
      });

      console.log(`[${ticker}] Trimestre ${periodEnd.toISOString().split('T')[0]} guardado com sucesso (Via Yahoo).`);

    } catch (e: any) {
      console.error(`[${ticker}] Erro a extrair do Yahoo Finance:`, e.message);
      errors++;
    }
  }

  console.log(`\nConcluído. Processadas ${companiesToUpdate.length} empresas com ${errors} erros.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Erro Fatal:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
