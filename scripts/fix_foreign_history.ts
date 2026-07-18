import { PrismaClient } from '@prisma/client';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();
const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando correção de histórico para empresas estrangeiras (ADRs)...");

  // Apenas empresas não-US
  const companies = await prisma.company.findMany({
    where: {
      country: { not: 'US' },
    },
  });

  console.log(`Encontradas ${companies.length} empresas estrangeiras para corrigir.`);

  let errors = 0;
  for (const company of companies) {
    const ticker = company.ticker;
    try {
      console.log(`\nA processar ${ticker}...`);

      const [fundamentals, quote] = await Promise.all([
        yahooFinance.fundamentalsTimeSeries(ticker, {
          period1: '2014-01-01', // Vai buscar o máximo de histórico possível
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

      // 1. Apagar o histórico trimestral atual (corrompido da SEC)
      const deleteRes = await prisma.fundamental.deleteMany({
        where: {
          companyId: company.id,
          periodType: 'QUARTERLY',
        }
      });
      console.log(`[${ticker}] Apagados ${deleteRes.count} trimestres corrompidos antigos.`);

      // 2. Inserir o histórico limpo do Yahoo Finance
      for (const q of quarters) {
        const periodEnd = new Date(q.date);
        const fiscalYear = periodEnd.getFullYear();
        const fiscalQuarter = Math.ceil((periodEnd.getMonth() + 1) / 3);

        let revenue = q.totalRevenue ?? null;
        let costOfRevenue = q.costOfRevenue ?? null;
        let grossProfit = q.grossProfit ?? null;
        let operatingExpenses = q.totalOperatingExpenses ?? null;
        let ebitda = q.EBITDA ?? null;
        let operatingIncome = q.operatingIncome ?? null;
        let netIncome = q.netIncome ?? q.netIncomeFromContinuingOperations ?? null;
        let operatingCashFlow = q.operatingCashFlow ?? null;
        let capex = q.capitalExpenditure ? Math.abs(q.capitalExpenditure) : null;
        let freeCashFlow = q.freeCashFlow ?? null;
        let totalAssets = q.totalAssets ?? null;
        let totalDebt = q.totalDebt ?? null;

        // FX
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
              }
            }
          } catch (fxErr) {
            // Silencioso para não encher a consola, ignora FX
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
            grossMargin, operatingMargin, netMargin,
            periodEnd // updates the periodEnd just in case
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
      }
      
      console.log(`[${ticker}] Histórico de ${quarters.length} trimestres guardado com sucesso (Via Yahoo).`);

    } catch (e: any) {
      console.error(`[${ticker}] Erro a extrair histórico:`, e.message);
      errors++;
    }
  }

  console.log(`\nConcluído. Processadas ${companies.length} empresas com ${errors} erros.`);
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
