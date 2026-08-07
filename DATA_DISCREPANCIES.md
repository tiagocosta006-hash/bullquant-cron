# Notas sobre Discrepâncias de Dados (Bullquant vs Outros Sites)

Este documento regista as decisões de cálculo e extração de dados financeiros na plataforma Bullquant, para servir de referência futura sempre que existirem dúvidas sobre discrepâncias entre os nossos gráficos e os de plataformas públicas (como Macrotrends, Stock Analysis, Yahoo Finance, etc.).

O nosso objetivo é apresentar **a realidade financeira rigorosa baseada nos relatórios SEC (10-K e 10-Q)**, mesmo que isso implique divergir das abordagens "preguiçosas" de outros scrapers de mercado.

## 1. Dívida Total (Total Debt) vs Dívida de Longo Prazo

**Cenário de Dúvida:**
Ao comparar a Apple (AAPL) em 2016, outros sites reportam "Debt" a rondar os $75.43B, enquanto o Bullquant reporta $87.03B.

**A Nossa Metodologia:**
O Bullquant está **correto**. A maioria dos sites genéricos lê apenas a etiqueta oficial de `LongTermDebtNoncurrent` (Dívida de Longo Prazo) e ignora as dívidas de curto prazo. 
Nós calculamos a **Dívida Total** somando:
- Dívida de Longo Prazo Não-Corrente (Long-term Debt)
- Dívida de Curto Prazo (Current portion of long-term debt)
- Papel Comercial / Linhas de crédito a curto prazo (Commercial Paper / Short-term Debt)

No caso da AAPL 2016: $75.43B (Longo Prazo) + $3.50B (Curto Prazo) + $8.10B (Papel Comercial) = **$87.03B**.

---

## 2. Despesas Operacionais (SG&A vs Marketing)

**Cenário de Dúvida:**
Em 2016, outros sites mostram $0 para *Sales & Marketing* (S&M) e $0 para *General & Administrative* (G&A) na Apple. O Bullquant apresenta um único bloco de $14.19B para SG&A.

**A Nossa Metodologia:**
O Bullquant está **correto**. Várias empresas (incluindo a Apple) **não separam** os custos de Marketing dos custos de Administração nas suas contas oficiais na SEC, reportando tudo numa única rubrica agregada: `SellingGeneralAndAdministrativeExpense`.
Enquanto outros robôs falham a extração por não encontrarem a linha isolada do Marketing e devolvem $0, o motor do Bullquant está programado para aceitar a métrica combinada oficial.

---

## 3. CapEx (Capital Expenditures) e Ativos Intangíveis

**Cenário de Dúvida:**
*(Decisão de Produto - Em atualização)*: No passado, o Bullquant mostrava um CapEx superior ao puro investimento físico (Property, Plant & Equipment) porque somava os ativos intangíveis (patentes, licenças de software, etc.). Isto criava uma métrica de "Owner's Earnings" à lá Warren Buffett.

**A Nossa Metodologia (Atualizada para MVP):**
Para garantir a credibilidade e paridade com a indústria (Macrotrends, Yahoo Finance), o **CapEx e o FCF (Free Cash Flow)** na capa da empresa retornaram ao *Standard* financeiro (focados apenas em PP&E, ou manutenções imobiliárias para REITs). 
No entanto, o motor de dados do Bullquant continua a extrair os gastos com Intangíveis no *backend*. Na versão V1 da plataforma, a nossa tese original ("Owner's Earnings") será introduzida como uma métrica secundária e opcional, devidamente etiquetada para utilizadores avançados que desejem analisar empresas tecnológicas de forma mais conservadora.

*(Nota: a exclusão propositada de dados "mock" no passado não está descrita aqui, mas o motor foi limpo em Junho de 2026 para ler exclusivamente dados SEC 100% autênticos).*

---

## 4. Lucro Líquido (Net Income) em UPREITs e Parcerias

**Cenário de Dúvida:**
Comparando a Prologis (PLD) em 2025, outros sites indicam um Net Income de $3.41B, enquanto o Bullquant reporta $3.33B.

**A Nossa Metodologia:**
O Bullquant está **correto**. A Prologis opera como um UPREIT, onde a empresa cotada na bolsa (Prologis, Inc.) detém cerca de 97% da parceria principal, sendo os restantes 3% detidos por terceiros (*Non-controlling interests*).
A métrica oficial de $3.41B inclui os lucros atribuíveis a esses parceiros privados, dinheiro ao qual os acionistas da bolsa **não têm qualquer direito**. 
O algoritmo do Bullquant extrai a tag oficial `NetIncomeLoss`, que deduz esses interesses minoritários e devolve exatamente **o lucro que pertence à empresa mãe e aos seus acionistas** ($3.33B). Esta abordagem protege os investidores de avaliações (como P/E) inflacionadas.

---

## 5. Cálculo do EBITDA (Operating vs Bottom-up)

**Cenário de Dúvida:**
O EBITDA da Amazon em 2017 é de $16.13B em algumas plataformas (ex: Macrotrends) mas inicialmente o Bullquant apresentava $15.58B. Além disso, em anos como 2022, a Amazon apresentou oscilações brutais que algumas métricas excluem e outras não.

**A Nossa Metodologia:**
Inicialmente o nosso motor utilizava uma abordagem de **Operating EBITDA** pura (`Operating Income + Depreciation & Amortization`). Esta visão era espetacular para analisar a performance real e excluir perdas ou ganhos de investimentos isolados (ex: a queda da Amazon no Rivian em 2022). 
No entanto, no sentido de assegurarmos credibilidade standard (tal como a decisão sobre o CapEx na secção 3), **ajustámos a fórmula do EBITDA para a leitura Bottom-up clássica**:
`EBITDA = Net Income + Income Tax Expense + Interest Expense + D&A`
Assim, o nosso EBITDA acompanha os valores universais ao cêntimo (os tais $16.13B na Amazon), mantendo todas as rubricas "Other Income/Expense" contabilizadas, garantindo paridade imediata com o resto do mundo financeiro.

---

## 6. ROIC (Return on Invested Capital)

**Cenário de Dúvida:**
A fórmula do ROIC gerava valores artificialmente elevados em algumas plataformas e no Bullquant.

**A Nossa Metodologia:**
O Capital Investido (denominador do ROIC) era tradicionalmente calculado deduzindo *todo* o passivo corrente dos ativos totais (`Total Assets - Current Liabilities - Cash`). Esta abordagem "Operating" subtraía erradamente a dívida de curto prazo (Short-Term Debt). A dívida de curto prazo é capital financeiro que os investidores aportam, logo não pode ser retirado da base de investimento.
O motor foi atualizado para utilizar a abordagem "Financing" estrita:
`Invested Capital = Total Debt + Total Equity - Cash`
Isto garante um cálculo de ROIC muito mais robusto, conservador e perfeitamente alinhado com a academia financeira.

---

## 7. Data de disponibilidade dos fundamentais (`filedAt`) nos gráficos point-in-time

**Cenário de Dúvida:**
Os gráficos que cruzam preço com fundamentais (P/E histórico em *ValuationMultiples*, preço vs lucros em *PriceVsEarnings*) mostravam a série de lucros atrasada quase um ano face ao preço. A AAPL aparecia a 44x lucros em agosto de 2021, quando negociava a ~28x.

**Causa:**
O campo `filedAt` de muitos trimestres na BD não é a data da filing original (10-Q), mas a data de uma filing **posterior** que reportou aquele trimestre como período comparativo — foi essa a filing de onde a ingestão extraiu a linha. Exemplo real: AAPL FY2025Q1 (período fechado em 2024-12-28, reportado em janeiro de 2025) está gravado com `filedAt = 2026-05-01`; os quatro trimestres de FY2016 estão todos com `filedAt = 2017-11-03`. Os **valores** estão corretos — só a data de disponibilidade está errada.

**A Nossa Metodologia:**
`/api/valuation/[ticker]` deixou de confiar cegamente no `filedAt`. Continua a ser a fonte preferida, mas apenas quando é plausível face ao calendário da SEC (posterior ao fim do período e até 120 dias depois num trimestre, 150 num anual). Fora dessa janela assume-se o prazo legal típico de reporte: `periodEnd + 45 dias` (10-Q) ou `periodEnd + 75 dias` (10-K). Com isto a série de TTM da AAPL passou de 13 degraus em 5 anos (com saltos de 9 meses) para 22 — um por trimestre, como deve ser — e o P/E de agosto de 2021 passou a 28,5x.

**Dívida técnica:** a correção é uma blindagem no consumo, não na origem. O `filedAt` correto continua a faltar na BD e deve ser corrigido em `scripts/ingest_fundamentals.py` (usar a data da filing de onde o período é o *reporting period*, não a data da filing onde aparece como comparativo). Enquanto isso não acontecer, qualquer nova feature point-in-time deve usar a mesma lógica de plausibilidade.

---

## 8. Base de splits dos fundamentais vs. a dos preços

**Cenário de Dúvida:**
O Walmart aparecia com um P/E de 5,4x em 2016, quando o valor real era ~15x. O mesmo padrão afetava qualquer métrica *por ação* (EPS, DPS, P/E) numa fatia significativa das empresas.

**Causa:**
O `sharesOutstanding` e o `epsDiluted` históricos ficavam numa base de split diferente da dos preços. O `apply_stock_splits()` em `ingest_fundamentals.py` só opera sobre as linhas do lote de ingestão em curso; como a ingestão é incremental, quando um split acontece as linhas antigas já estão na BD e nunca mais são revisitadas. Os **preços**, esses, vêm do yfinance já ajustados. Resultado: WMT com 3.100M ações em 2016 (base pré-split) e 8.202M em 2023 (pós-split 3:1 de 2024), contra preços ajustados nas duas pontas — P/E errado por um fator de exatamente 3.

**A Nossa Metodologia:**
O `adjust_splits.py` é o script de reparação e corre todas as noites a seguir à ingestão. Três correções foram precisas para ele apanhar os casos reais sem estragar os outros:

1. **Deteção separada da tolerância.** Usava `BREAK_HI = 2.5` para as duas coisas, partindo do princípio de que "splits são >= 3x na prática". Um único 2:1 dá um degrau de exatamente 2,0 e um 3:2 dá 1,5 — ambos passavam despercebidos. A deteção passou para `BREAK_DETECT = 1.4`; a tolerância de encaixe fica nos 2,5.

2. **A autoridade é a série de preços, não o EDGAR.** O objetivo do ajuste é alinhar os fundamentais com a base em que os preços estão, portanto o fator correto é o que ajustou os preços (yfinance). O EDGAR entra só como confirmação de que houve mesmo uma alteração de estrutura acionista. A HON é o caso que isto tem de apanhar: tem no EDGAR uma etiqueta de 0,5x que o yfinance regista como **0,9535x** — o fator típico de um *spin-off*, que mexe no preço e não no número de ações. Sem esta validação o script multiplicava 51 linhas boas por 0,5 para as alinhar com uma única linha recente defeituosa.

3. **O EDGAR tagga a razão invertida.** Um split 5:1 aparece como `0.2x`, um 10:1 como `0.1x`. E a data do facto XBRL é o fim do período, não a data efetiva do split — daí a janela de correspondência ser de 120 dias, com o emparelhamento a sério feito pelo rácio (aceitando-o ou ao seu recíproco, com 5% de tolerância para arredondamentos: o yfinance dá 1,957x num 2:1).

**Guarda no consumo:** enquanto houver empresas por reparar (mergers, IPOs e spin-offs legítimos ficam sempre por ajustar, e bem), `/api/valuation/[ticker]` deteta o degrau na série de ações e deixa de emitir `epsTtm`. O gráfico de preço vs lucros cai sozinho para net income, que é imune a splits por não ser por ação — pior conceptualmente, mas correto.
