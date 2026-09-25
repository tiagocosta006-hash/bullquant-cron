-- Identidades contabilísticas sobre `fundamentals`. Cada verificação conta as
-- linhas que falham (tolerância indicada) e mostra os piores casos. Só lê
-- números de empresas cotadas, que são públicos.
\pset pager off

create temp table f as
select c.ticker, c.sector, x.*
from fundamentals x join companies c on c.id = x."companyId";

\echo '== 1. Lucro bruto = receita − custo das vendas (±1%, não financeiras)'
select count(*) filter (where abs("grossProfit" - (revenue - "costOfRevenue")) > 0.01 * abs(revenue)) as falham, count(*) as testadas
from f where revenue > 0 and "grossProfit" is not null and "costOfRevenue" is not null and sector not ilike '%financ%';
select ticker, "periodType", "fiscalYear", "fiscalQuarter", round(revenue/1e9,2) rev, round("costOfRevenue"/1e9,2) cogs, round("grossProfit"/1e9,2) gp
from f where revenue > 0 and "grossProfit" is not null and "costOfRevenue" is not null and sector not ilike '%financ%'
  and abs("grossProfit" - (revenue - "costOfRevenue")) > 0.01 * abs(revenue)
order by abs("grossProfit" - (revenue - "costOfRevenue")) / abs(revenue) desc limit 8;

\echo '== 2. Ativo = passivo + capital próprio (±2%)'
select count(*) filter (where abs("totalAssets" - ("totalLiabilities" + "totalEquity")) > 0.02 * "totalAssets") as falham, count(*) as testadas
from f where "totalAssets" > 0 and "totalLiabilities" is not null and "totalEquity" is not null;
select ticker, "periodType", "fiscalYear", "fiscalQuarter", round("totalAssets"/1e9,2) ativo, round("totalLiabilities"/1e9,2) passivo, round("totalEquity"/1e9,2) cp,
       round(100*("totalAssets" - "totalLiabilities" - "totalEquity")/"totalAssets",1) as dif_pct
from f where "totalAssets" > 0 and "totalLiabilities" is not null and "totalEquity" is not null
  and abs("totalAssets" - ("totalLiabilities" + "totalEquity")) > 0.02 * "totalAssets"
order by abs("totalAssets" - "totalLiabilities" - "totalEquity") / "totalAssets" desc limit 8;

\echo '== 3. FCF = OCF − capex (±1%)'
select count(*) filter (where abs("freeCashFlow" - ("operatingCashFlow" - capex)) > 0.01 * greatest(abs("operatingCashFlow"),1)) as falham, count(*) as testadas
from f where "freeCashFlow" is not null and "operatingCashFlow" is not null and capex is not null;

\echo '== 4. Capex, recompras e dividendos pagos nunca negativos'
select count(*) filter (where capex < 0) capex_neg, count(*) filter (where "shareRepurchases" < 0) recompras_neg, count(*) filter (where "dividendsPaid" < 0) div_neg from f;

\echo '== 5. Variação de caixa ≈ OCF + investimento + financiamento (±5% do OCF, efeito cambial fica de fora)'
select count(*) filter (where abs("netChangeInCash" - ("operatingCashFlow" + "investingCashFlow" + "financingCashFlow")) > 0.05 * greatest(abs("operatingCashFlow"),1e8)) as falham, count(*) as testadas
from f where "netChangeInCash" is not null and "operatingCashFlow" is not null and "investingCashFlow" is not null and "financingCashFlow" is not null;

\echo '== 6. Soma dos 4 trimestres = ano (±3%): receita, lucro, OCF'
with q as (
  select "companyId", "fiscalYear", count(*) n, sum(revenue) rev, sum("netIncome") ni, sum("operatingCashFlow") ocf
  from f where "periodType" = 'QUARTERLY' group by 1,2 having count(*) = 4
), a as (select * from f where "periodType" = 'ANNUAL')
select count(*) as anos_testados,
       count(*) filter (where abs(q.rev - a.revenue) > 0.03 * abs(a.revenue)) as receita_falha,
       count(*) filter (where abs(q.ni - a."netIncome") > 0.03 * greatest(abs(a."netIncome"), 1e8)) as lucro_falha,
       count(*) filter (where abs(q.ocf - a."operatingCashFlow") > 0.03 * greatest(abs(a."operatingCashFlow"), 1e8)) as ocf_falha
from q join a on a."companyId" = q."companyId" and a."fiscalYear" = q."fiscalYear"
where a.revenue > 0;
with q as (
  select "companyId", "fiscalYear", sum(revenue) rev, sum("netIncome") ni
  from f where "periodType" = 'QUARTERLY' group by 1,2 having count(*) = 4
)
select a.ticker, a."fiscalYear", a."reportedCurrency" moeda, round(a.revenue/1e9,2) rev_ano, round(q.rev/1e9,2) rev_4q, round(a."netIncome"/1e9,2) ni_ano, round(q.ni/1e9,2) ni_4q
from q join f a on a."companyId" = q."companyId" and a."fiscalYear" = q."fiscalYear" and a."periodType" = 'ANNUAL'
where a.revenue > 0 and (abs(q.rev - a.revenue) > 0.03 * a.revenue or abs(q.ni - a."netIncome") > 0.03 * greatest(abs(a."netIncome"), 1e8))
order by greatest(abs(q.rev - a.revenue) / a.revenue, abs(q.ni - a."netIncome") / greatest(abs(a."netIncome"), 1e8)) desc limit 12;

\echo '== 7. EPS × ações ≈ lucro líquido (±5%)'
select count(*) filter (where abs("epsDiluted" * "sharesOutstanding" - "netIncome") > 0.05 * abs("netIncome")) as falham, count(*) as testadas
from f where "epsDiluted" is not null and "sharesOutstanding" > 0 and abs("netIncome") > 1e7;
select ticker, count(*) linhas_falham
from f where "epsDiluted" is not null and "sharesOutstanding" > 0 and abs("netIncome") > 1e7
  and abs("epsDiluted" * "sharesOutstanding" - "netIncome") > 0.05 * abs("netIncome")
group by ticker order by 2 desc limit 15;

\echo '== 8. Cobertura: % de linhas com cada campo principal'
select round(100.0*count(revenue)/count(*)) receita, round(100.0*count("netIncome")/count(*)) lucro, round(100.0*count("epsDiluted")/count(*)) eps,
       round(100.0*count("totalAssets")/count(*)) ativo, round(100.0*count("totalEquity")/count(*)) cp, round(100.0*count("operatingCashFlow")/count(*)) ocf,
       round(100.0*count("freeCashFlow")/count(*)) fcf, round(100.0*count("sharesOutstanding")/count(*)) acoes, count(*) linhas
from f;
