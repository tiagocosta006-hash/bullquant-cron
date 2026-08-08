export type Locale = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'it' | 'zh' | 'ja' | 'nl';

export interface GlossaryTerm {
  slug: string;
  title: Partial<Record<Locale, string>> & { en: string; pt: string };
  definition: Partial<Record<Locale, string>> & { en: string; pt: string };
}

export const glossaryTerms: GlossaryTerm[] = [
  {
    slug: 'dcf',
    title: {
      en: 'DCF (Discounted Cash Flow)',
      pt: 'DCF (Fluxos de Caixa Descontados)'
    },
    definition: {
      en: 'A valuation method that estimates how much a company is worth today based on the cash it will generate in the future. Each future euro is "discounted" back to the present because a euro today can be invested. You project [free cash flows](#fcf) for 5 to 10 years, discount them using the [WACC](#wacc), and add a terminal value. The result is the intrinsic value per share. If the stock trades below that number, you may have found a bargain with a good [margin of safety](#margin-of-safety).',
      pt: 'Um método de avaliação que estima quanto uma empresa vale hoje com base no dinheiro que vai gerar no futuro. Cada euro futuro é "descontado" ao presente porque um euro hoje pode ser investido. Projetas os [fluxos de caixa livres](#fcf) para 5 a 10 anos, descontas usando o [WACC](#wacc), e somas um valor terminal. O resultado é o valor intrínseco por ação. Se a ação está abaixo desse número, podes ter encontrado uma oportunidade com uma boa [margem de segurança](#margin-of-safety).'
    }
  },
  {
    slug: 'wacc',
    title: {
      en: 'WACC (Weighted Average Cost of Capital)',
      pt: 'WACC (Custo Médio Ponderado de Capital)'
    },
    definition: {
      en: 'The minimum return a company needs to earn to satisfy both its shareholders and creditors. It blends the cost of equity and the after-tax cost of debt, weighted by their share in the capital structure. In a [DCF](#dcf) analysis, the WACC is the discount rate: a higher WACC means future cash flows are worth less today, which lowers the fair value. Most mature companies have a WACC between 8% and 12%.',
      pt: 'O retorno mínimo que uma empresa precisa de gerar para satisfazer acionistas e credores ao mesmo tempo. Combina o custo do capital próprio e o custo da dívida após impostos, ponderados pela sua proporção na estrutura de capital. Num [DCF](#dcf), o WACC é a taxa de desconto: um WACC mais alto faz com que os fluxos de caixa futuros valham menos hoje, o que reduz o valor justo. A maioria das empresas maduras tem um WACC entre 8% e 12%.'
    }
  },
  {
    slug: 'fcf',
    title: {
      en: 'FCF (Free Cash Flow)',
      pt: 'FCF (Fluxo de Caixa Livre)'
    },
    definition: {
      en: 'The cash left over after a company pays its operating costs and [capital expenditures](#capex). Unlike net income, which accountants can shape with depreciation schedules and one-off charges, FCF represents real money in the bank. It can go to dividends, buybacks, debt repayment, or acquisitions. A company that reports profits but burns cash every year has a serious problem. FCF is the oxygen of a business.',
      pt: 'O dinheiro que sobra depois de uma empresa pagar os custos operacionais e as [despesas de capital](#capex). Ao contrário do lucro líquido, que os contabilistas podem moldar com calendários de depreciação e encargos extraordinários, o FCF representa dinheiro real no banco. Pode ir para dividendos, recompra de ações, pagamento de dívida ou aquisições. Uma empresa que reporta lucros mas queima caixa todos os anos tem um problema sério. O FCF é o oxigénio de um negócio.'
    }
  },
  {
    slug: 'ebitda',
    title: {
      en: 'EBITDA',
      pt: 'EBITDA'
    },
    definition: {
      en: 'Earnings Before Interest, Taxes, Depreciation, and Amortization. Strips out financing decisions, tax jurisdictions, and non-cash accounting charges to isolate a company\'s core operating profitability. Useful for comparing companies across countries and capital structures. But it ignores capital expenditures entirely, which can be massive. Warren Buffett once asked: "Does management think the tooth fairy pays for capital expenditures?"',
      pt: 'Lucros Antes de Juros, Impostos, Depreciação e Amortização. Remove as decisões de financiamento, jurisdições fiscais e encargos contabilísticos não monetários para isolar a rentabilidade operacional central de uma empresa. Útil para comparar empresas de diferentes países e estruturas de capital. Mas ignora completamente as despesas de capital, que podem ser enormes. Warren Buffett perguntou uma vez: "A gestão acha que a fada dos dentes é que paga as despesas de capital?"'
    }
  },
  {
    slug: 'roic',
    title: {
      en: 'ROIC (Return on Invested Capital)',
      pt: 'ROIC (Retorno sobre o Capital Investido)'
    },
    definition: {
      en: 'Measures how well a company turns its total invested capital (equity plus debt) into operating profits. Calculated as NOPAT divided by invested capital. When the ROIC stays above the [WACC](#wacc) year after year, every euro reinvested creates value. This is the strongest quantitative signal of a durable competitive advantage or [moat](#moat).',
      pt: 'Mede a eficiência com que uma empresa transforma o seu capital total investido (capital próprio mais dívida) em lucros operacionais. Calcula-se como NOPAT dividido pelo capital investido. Quando o ROIC se mantém acima do [WACC](#wacc) ano após ano, cada euro reinvestido cria valor. É o sinal quantitativo mais forte de uma vantagem competitiva duradoura ou [moat](#moat).'
    }
  },
  {
    slug: 'roe',
    title: {
      en: 'ROE (Return on Equity)',
      pt: 'ROE (Retorno sobre o Capital Próprio)'
    },
    definition: {
      en: 'Net income divided by shareholders\' equity. Shows how much profit is generated for each euro of equity capital. A ROE above 15-20% is generally good, but needs context: a company can inflate its ROE by loading up on debt, which shrinks the equity base. A 30% ROE backed by moderate debt is excellent. The same 30% fueled by dangerous leverage is a red flag. Always check it alongside the [Debt-to-Equity](#debt-equity) ratio.',
      pt: 'Lucro líquido dividido pelo capital próprio dos acionistas. Mostra quanto lucro é gerado por cada euro de capital próprio. Um ROE acima de 15-20% é geralmente bom, mas precisa de contexto: uma empresa pode inflacionar o ROE ao carregar-se de dívida, o que encolhe a base de capital. Um ROE de 30% suportado por dívida moderada é excelente. O mesmo 30% alimentado por alavancagem perigosa é um sinal de alerta. Verifica-o sempre em conjunto com o rácio [Dívida/Capital Próprio](#debt-equity).'
    }
  },
  {
    slug: 'roa',
    title: {
      en: 'ROA (Return on Assets)',
      pt: 'ROA (Retorno sobre os Ativos)'
    },
    definition: {
      en: 'Net income divided by total assets. Unlike ROE, it cannot be inflated by debt because it uses the full asset base regardless of how those assets were financed. Particularly useful for banks and financial companies where leverage is part of the business model. A bank with a 1.5% ROA is considered very good. An industrial company needs much higher to justify its capital.',
      pt: 'Lucro líquido dividido pelo total de ativos. Ao contrário do ROE, não pode ser inflacionado por dívida porque usa a base total de ativos independentemente de como foram financiados. Especialmente útil para bancos e empresas financeiras onde a alavancagem faz parte do modelo de negócio. Um banco com um ROA de 1,5% é considerado muito bom. Uma empresa industrial precisa de valores bem mais altos para justificar o seu capital.'
    }
  },
  {
    slug: 'pe-ratio',
    title: {
      en: 'P/E Ratio (Price-to-Earnings)',
      pt: 'Rácio P/E (Preço/Lucro)'
    },
    definition: {
      en: 'The most quoted valuation multiple in finance. Divides the share price by earnings per share. A P/E of 20 means investors pay $20 for every $1 of annual profit. A high P/E can reflect strong expected growth or overvaluation. A low P/E can signal a bargain or a company in decline. Context matters: compare P/E within the same industry and check whether earnings are at a cyclical peak or trough.',
      pt: 'O múltiplo de avaliação mais citado em finanças. Divide o preço da ação pelo lucro por ação. Um P/E de 20 significa que os investidores pagam 20€ por cada 1€ de lucro anual. Um P/E alto pode refletir expectativas de crescimento forte ou sobrevalorização. Um P/E baixo pode sinalizar uma oportunidade ou uma empresa em declínio. O contexto importa: compara o P/E dentro do mesmo setor e verifica se os lucros estão num pico ou vale cíclico.'
    }
  },
  {
    slug: 'ps-ratio',
    title: {
      en: 'P/S Ratio (Price-to-Sales)',
      pt: 'Rácio P/S (Preço/Vendas)'
    },
    definition: {
      en: 'Market capitalization divided by total revenue. Works even when a company has no profits, which makes it the go-to metric for high-growth tech and biotech firms reinvesting aggressively. A P/S of 10 means investors pay $10 for every $1 of revenue. The catch: revenue says nothing about profitability. A company with $1B in sales and zero margin is very different from one with $1B in sales and 30% margins.',
      pt: 'Capitalização de mercado dividida pela receita total. Funciona mesmo quando uma empresa não dá lucro, o que a torna a métrica de referência para empresas de tecnologia e biotecnologia em crescimento acelerado. Um P/S de 10 significa que os investidores pagam 10€ por cada 1€ de receita. O senão: a receita não diz nada sobre rentabilidade. Uma empresa com 1B€ em vendas e margem zero é muito diferente de uma com 1B€ em vendas e margens de 30%.'
    }
  },
  {
    slug: 'pb-ratio',
    title: {
      en: 'P/B Ratio (Price-to-Book)',
      pt: 'Rácio P/B (Preço/Valor Contabilístico)'
    },
    definition: {
      en: 'Compares market cap to book value (assets minus liabilities on the balance sheet). A P/B below 1.0 means the stock trades for less than the accounting value of its net assets, a classic value investing signal. But book value is based on historical cost and can massively understate the worth of intangible-heavy businesses like software or luxury brands. Most relevant for banks, insurers, and real estate companies where tangible assets dominate.',
      pt: 'Compara a capitalização de mercado com o valor contabilístico (ativos menos passivos no balanço). Um P/B abaixo de 1,0 significa que a ação é negociada por menos do que o valor contabilístico dos seus ativos líquidos, um sinal clássico de value investing. Mas o valor contabilístico baseia-se no custo histórico e pode subestimar enormemente o valor de negócios ricos em intangíveis como software ou marcas de luxo. Mais relevante para bancos, seguradoras e imobiliárias onde os ativos tangíveis dominam.'
    }
  },
  {
    slug: 'pfcf-ratio',
    title: {
      en: 'P/FCF (Price-to-Free Cash Flow)',
      pt: 'Rácio P/FCF'
    },
    definition: {
      en: 'Market cap divided by free cash flow. Similar to P/E but uses actual cash generation instead of accounting earnings. Since FCF is much harder for management to manipulate than reported profits, many experienced investors prefer it. A company at 15x P/FCF generates enough real cash to "pay back" its entire market value in 15 years, assuming everything stays the same. Especially valuable for capital-intensive businesses where the gap between earnings and cash can be wide.',
      pt: 'Capitalização de mercado dividida pelo fluxo de caixa livre. Semelhante ao P/E mas usa a geração real de caixa em vez dos lucros contabilísticos. Como o FCF é muito mais difícil de manipular pela gestão do que os lucros reportados, muitos investidores experientes preferem-no. Uma empresa a 15x P/FCF gera caixa real suficiente para "pagar de volta" todo o seu valor de mercado em 15 anos, assumindo que tudo se mantém igual. Especialmente valioso para negócios intensivos em capital onde a diferença entre lucros e caixa pode ser grande.'
    }
  },
  {
    slug: 'eps',
    title: {
      en: 'EPS (Earnings Per Share)',
      pt: 'EPS (Lucro por Ação)'
    },
    definition: {
      en: 'Total net profit divided by the number of [shares outstanding](#outstanding-shares). It is the building block behind many valuation metrics, including [P/E](#pe-ratio). There are two versions: basic (actual share count) and diluted (assumes all stock options and convertible securities are exercised). Always use diluted EPS for a conservative analysis.',
      pt: 'Lucro líquido total dividido pelo número de [ações em circulação](#outstanding-shares). É a base de muitas métricas de avaliação, incluindo o [P/E](#pe-ratio). Existem duas versões: básico (número real de ações) e diluído (assume que todas as stock options e títulos convertíveis são exercidos). Usa sempre o EPS diluído para uma análise conservadora.'
    }
  },
  {
    slug: 'cagr',
    title: {
      en: 'CAGR (Compound Annual Growth Rate)',
      pt: 'CAGR (Taxa Composta de Crescimento Anual)'
    },
    definition: {
      en: 'The constant annual growth rate that would take an investment from point A to point B over a given period. If revenue went from $100M to $200M in 5 years, the CAGR is about 14.9%. It smooths out volatile year-to-year swings and gives you the "true speed" of growth. Essential for comparing companies with different starting points and timeframes.',
      pt: 'A taxa de crescimento anual constante que levaria um investimento do ponto A ao ponto B num dado período. Se a receita foi de 100M€ para 200M€ em 5 anos, o CAGR é cerca de 14,9%. Suaviza as oscilações voláteis de ano para ano e dá-te a "velocidade real" do crescimento. Essencial para comparar empresas com pontos de partida e horizontes temporais diferentes.'
    }
  },
  {
    slug: 'margin-of-safety',
    title: {
      en: 'Margin of Safety',
      pt: 'Margem de Segurança'
    },
    definition: {
      en: 'The gap between a stock\'s estimated intrinsic value and its current market price. If you calculate that a company is worth $100 per share and the stock trades at $65, your margin of safety is 35%. The concept was coined by Benjamin Graham and is the cornerstone of value investing. A wide margin protects against errors in your analysis, bad surprises, and market panics. Graham recommended buying only with a margin of 30-50%.',
      pt: 'A diferença entre o valor intrínseco estimado de uma ação e o seu preço atual no mercado. Se calculas que uma empresa vale 100€ por ação e a ação está a 65€, a tua margem de segurança é de 35%. O conceito foi criado por Benjamin Graham e é a pedra angular do value investing. Uma margem ampla protege contra erros na tua análise, más surpresas e pânicos de mercado. Graham recomendava comprar apenas com uma margem de 30-50%.'
    }
  },
  {
    slug: 'moat',
    title: {
      en: 'Economic Moat',
      pt: 'Moat (Vantagem Competitiva)'
    },
    definition: {
      en: 'A term popularized by Warren Buffett for the durable competitive advantages that protect a company\'s profits from competitors. The five classic types: (1) Brand power (Apple, Coca-Cola), (2) Network effects (Visa, Meta), (3) Cost advantages (Costco, Ryanair), (4) Switching costs (Microsoft Office, SAP), and (5) Intangible assets like patents and licenses. A wide moat lets a company sustain high ROIC for decades, the single most important factor in long-term wealth creation.',
      pt: 'Um termo popularizado por Warren Buffett para as vantagens competitivas duradouras que protegem os lucros de uma empresa contra concorrentes. Os cinco tipos clássicos: (1) Poder da marca (Apple, Coca-Cola), (2) Efeitos de rede (Visa, Meta), (3) Vantagens de custo (Costco, Ryanair), (4) Custos de mudança (Microsoft Office, SAP), e (5) Ativos intangíveis como patentes e licenças. Um moat amplo permite à empresa sustentar ROIC elevado durante décadas, o fator mais importante na criação de riqueza a longo prazo.'
    }
  },
  {
    slug: 'capex',
    title: {
      en: 'CAPEX (Capital Expenditure)',
      pt: 'CAPEX (Despesas de Capital)'
    },
    definition: {
      en: 'Money spent on acquiring, maintaining, or upgrading long-term physical assets: factories, equipment, servers, real estate. Capex is subtracted from operating cash flow to get free cash flow. Software companies need minimal capex relative to revenue and generate abundant FCF. Capital-heavy industries like oil, airlines, and telecoms must reinvest constantly just to keep running. Understanding capex intensity is key to assessing true cash generation.',
      pt: 'Dinheiro gasto na aquisição, manutenção ou melhoria de ativos físicos de longo prazo: fábricas, equipamentos, servidores, imobiliário. O Capex é subtraído ao fluxo de caixa operacional para obter o fluxo de caixa livre. Empresas de software precisam de Capex mínimo face à receita e geram FCF abundante. Indústrias intensivas em capital como petróleo, companhias aéreas e telecomunicações precisam de reinvestir constantemente só para continuarem a operar. Compreender a intensidade de Capex é chave para avaliar a verdadeira geração de caixa.'
    }
  },
  {
    slug: 'opex',
    title: {
      en: 'OPEX (Operating Expenses)',
      pt: 'OPEX (Despesas Operacionais)'
    },
    definition: {
      en: 'The recurring costs of running a business day to day: rent, salaries, utilities, marketing, R&D. Unlike Capex, Opex hits the income statement immediately in the period it occurs. Companies that grow revenue faster than their Opex have "operating leverage," meaning each additional euro of sales drops a bigger share to the bottom line. This is how margins expand over time.',
      pt: 'Os custos recorrentes de gerir o negócio no dia a dia: rendas, salários, eletricidade, marketing, I&D. Ao contrário do Capex, o Opex impacta a demonstração de resultados imediatamente no período em que ocorre. Empresas que fazem crescer a receita mais rápido do que o Opex têm "alavancagem operacional," o que significa que cada euro adicional de vendas contribui mais para o lucro final. É assim que as margens expandem ao longo do tempo.'
    }
  },
  {
    slug: 'dividend-yield',
    title: {
      en: 'Dividend Yield',
      pt: 'Dividend Yield'
    },
    definition: {
      en: 'The annual dividend expressed as a percentage of the stock price. A share at €100 paying €5 per year has a yield of 5%. A high yield can attract income investors but can also be a trap: if the price crashed 50% and the dividend hasn\'t been cut yet, the yield looks artificially high. Always check the payout ratio and FCF coverage before trusting a high yield. The most reliable payers sit between 2-4% with decades of consecutive increases.',
      pt: 'O dividendo anual expresso como percentagem do preço da ação. Uma ação a 100€ que paga 5€ por ano tem um yield de 5%. Um yield alto pode atrair investidores de rendimento mas também pode ser uma armadilha: se o preço caiu 50% e o dividendo ainda não foi cortado, o yield parece artificialmente elevado. Verifica sempre o payout ratio e a cobertura pelo FCF antes de confiares num yield alto. Os pagadores mais fiáveis situam-se entre 2-4% com décadas de aumentos consecutivos.'
    }
  },
  {
    slug: 'payout-ratio',
    title: {
      en: 'Payout Ratio',
      pt: 'Payout Ratio'
    },
    definition: {
      en: 'The share of earnings paid out as dividends, expressed as a percentage. A ratio of 40% means the company distributes 40% and retains 60% for reinvestment. Above 100% means it pays more than it earns, which is unsustainable and usually precedes a dividend cut. For most mature companies, a healthy range is 30-60%. REITs are an exception because they are legally required to distribute at least 90% of taxable income.',
      pt: 'A proporção dos lucros distribuída como dividendos, expressa em percentagem. Um rácio de 40% significa que a empresa distribui 40% e retém 60% para reinvestimento. Acima de 100% significa que paga mais do que lucra, o que é insustentável e costuma preceder um corte de dividendos. Para a maioria das empresas maduras, a faixa saudável é 30-60%. Os REITs são uma exceção porque são obrigados por lei a distribuir pelo menos 90% do rendimento tributável.'
    }
  },
  {
    slug: 'outstanding-shares',
    title: {
      en: 'Outstanding Shares',
      pt: 'Ações em Circulação'
    },
    definition: {
      en: 'The total number of shares held by all shareholders, including institutions, insiders, and the public. This number rises when the company issues new shares (dilution, bad for existing shareholders because earnings are spread thinner) and falls when it buys shares back (buybacks, generally positive because earnings concentrate in fewer shares). Tracking the share count over 5-10 years tells you whether management is creating or destroying shareholder value.',
      pt: 'O número total de ações detidas por todos os acionistas, incluindo institucionais, insiders e o público. Este número sobe quando a empresa emite novas ações (diluição, negativo porque os lucros ficam mais diluídos) e desce quando recompra ações (buybacks, geralmente positivo porque os lucros concentram-se em menos ações). Acompanhar a contagem de ações ao longo de 5-10 anos diz-te se a gestão está a criar ou destruir valor para o acionista.'
    }
  },
  {
    slug: 'market-cap',
    title: {
      en: 'Market Capitalization',
      pt: 'Capitalização de Mercado'
    },
    definition: {
      en: 'Share price multiplied by the total number of shares outstanding. Categorizes companies by size: Mega-cap (>$200B), Large-cap ($10-200B), Mid-cap ($2-10B), Small-cap ($300M-2B), Micro-cap (<$300M). Bigger companies tend to be more stable but grow slower. Smaller ones offer more growth potential with more risk. Market cap is not the "price" of a company. For that, you need Enterprise Value, which adds debt and subtracts cash.',
      pt: 'Preço da ação multiplicado pelo número total de ações em circulação. Categoriza as empresas por tamanho: Mega-cap (>200B$), Large-cap (10-200B$), Mid-cap (2-10B$), Small-cap (300M-2B$), Micro-cap (<300M$). Empresas maiores tendem a ser mais estáveis mas crescem mais devagar. As menores oferecem mais potencial de crescimento com mais risco. A capitalização de mercado não é o "preço" de uma empresa. Para isso, precisas do Enterprise Value, que soma a dívida e subtrai o caixa.'
    }
  },
  {
    slug: 'enterprise-value',
    title: {
      en: 'Enterprise Value (EV)',
      pt: 'Valor da Empresa (EV)'
    },
    definition: {
      en: 'The theoretical price of buying the entire business. Equals market cap plus total debt, minus cash. The logic: if you buy a company, you inherit its debts (you must repay them) and its cash (which offsets the cost). EV gives a much more accurate picture of true value than market cap alone, especially when comparing companies with very different debt levels. A company with a $10B market cap, $5B in debt, and $1B in cash has an EV of $14B.',
      pt: 'O preço teórico de comprar todo o negócio. Igual à capitalização de mercado mais a dívida total, menos o caixa. A lógica: se comprares uma empresa, herdarás as dívidas (tens de as pagar) e o caixa (que compensa o custo). O EV dá uma imagem muito mais precisa do valor real do que apenas a capitalização de mercado, especialmente quando comparas empresas com níveis de dívida muito diferentes. Uma empresa com 10B$ de market cap, 5B$ de dívida e 1B$ de caixa tem um EV de 14B$.'
    }
  },
  {
    slug: 'ev-ebitda',
    title: {
      en: 'EV/EBITDA',
      pt: 'EV/EBITDA'
    },
    definition: {
      en: 'Enterprise Value divided by EBITDA. Better than P/E for comparing companies with different debt levels and tax situations because EV includes debt and EBITDA excludes interest and taxes. An EV/EBITDA of 10x means a buyer would pay 10 years of operating cash flow to acquire the whole company, debt included. This is the metric investment banks and private equity firms use most in M&A deal pricing. Lower is generally cheaper.',
      pt: 'Enterprise Value dividido pelo EBITDA. Melhor que o P/E para comparar empresas com níveis de dívida e situações fiscais diferentes porque o EV inclui a dívida e o EBITDA exclui juros e impostos. Um EV/EBITDA de 10x significa que um comprador pagaria 10 anos de fluxo de caixa operacional para adquirir toda a empresa, dívida incluída. É a métrica que bancos de investimento e fundos de private equity mais usam para avaliar preços em transações de M&A. Menor é geralmente mais barato.'
    }
  },
  {
    slug: 'current-ratio',
    title: {
      en: 'Current Ratio',
      pt: 'Liquidez Corrente'
    },
    definition: {
      en: 'Current assets divided by current liabilities. Measures whether a company can pay its bills over the next 12 months. Above 1.0 means more short-term assets than short-term debts, a healthy sign. Below 1.0 can signal liquidity problems. Very high ratios (above 3.0) can suggest inefficient use of cash. Most healthy companies sit between 1.2 and 2.0.',
      pt: 'Ativos correntes divididos por passivos correntes. Mede se uma empresa consegue pagar as suas contas nos próximos 12 meses. Acima de 1,0 significa mais ativos de curto prazo do que dívidas de curto prazo, um sinal saudável. Abaixo de 1,0 pode sinalizar problemas de liquidez. Rácios muito altos (acima de 3,0) podem sugerir uso ineficiente do caixa. A maioria das empresas saudáveis situa-se entre 1,2 e 2,0.'
    }
  },
  {
    slug: 'debt-equity',
    title: {
      en: 'Debt-to-Equity Ratio',
      pt: 'Rácio Dívida/Capital Próprio'
    },
    definition: {
      en: 'Total debt divided by shareholders\' equity. A D/E of 1.0 means equal amounts of debt and equity. Above 1.0 means more debt than equity. Leverage amplifies everything: in good years, borrowed money boosts shareholder returns; in bad years, fixed interest payments can crush a company. Utilities and banks carry D/E ratios above 1.5 routinely. Tech companies often operate with little or no debt. Rising interest rates hit highly leveraged companies hardest.',
      pt: 'Dívida total dividida pelo capital próprio. Um D/E de 1,0 significa quantidades iguais de dívida e capital próprio. Acima de 1,0 significa mais dívida do que capital. A alavancagem amplifica tudo: em anos bons, o dinheiro emprestado potencia os retornos dos acionistas; em anos maus, os pagamentos fixos de juros podem esmagar uma empresa. Utilities e bancos carregam rácios D/E acima de 1,5 rotineiramente. Empresas tecnológicas frequentemente operam com pouca ou nenhuma dívida. A subida das taxas de juro atinge com mais força as empresas muito alavancadas.'
    }
  },
  {
    slug: 'gross-margin',
    title: {
      en: 'Gross Margin',
      pt: 'Margem Bruta'
    },
    definition: {
      en: 'The percentage of revenue left after subtracting the direct cost of producing goods or services (COGS). A 70% gross margin means the company keeps $0.70 of every $1 sold to cover operations, R&D, marketing, and profit. Software companies typically hit 75-90% (the marginal cost of another user is near zero). Retailers operate at 25-40%. If the gross margin is low or falling, no amount of cost-cutting further down the line will save the business.',
      pt: 'A percentagem da receita que resta após subtrair o custo direto de produzir bens ou serviços (COGS). Uma margem bruta de 70% significa que a empresa fica com 0,70€ de cada 1€ vendido para cobrir operações, I&D, marketing e lucro. Empresas de software tipicamente atingem 75-90% (o custo marginal de mais um utilizador é quase zero). Retalhistas operam a 25-40%. Se a margem bruta é baixa ou está a cair, nenhum corte de custos mais abaixo salvará o negócio.'
    }
  },
  {
    slug: 'operating-margin',
    title: {
      en: 'Operating Margin',
      pt: 'Margem Operacional'
    },
    definition: {
      en: 'The percentage of revenue remaining after paying both COGS and all operating expenses (salaries, rent, R&D, marketing). Shows how efficiently the core business converts sales into operating profit, before interest and taxes. Expanding operating margins over time signal a well-managed company with pricing power. Example: if revenue grows 10% but operating costs grow only 5%, the margin expands and each new sale becomes more profitable than the last.',
      pt: 'A percentagem da receita que resta após pagar tanto o COGS como todas as despesas operacionais (salários, rendas, I&D, marketing). Mostra a eficiência com que o negócio central converte vendas em lucro operacional, antes de juros e impostos. Margens operacionais a expandir ao longo do tempo sinalizam uma empresa bem gerida com poder de preço. Exemplo: se a receita cresce 10% mas os custos operacionais crescem apenas 5%, a margem expande e cada nova venda torna-se mais lucrativa que a anterior.'
    }
  },
  {
    slug: 'net-margin',
    title: {
      en: 'Net Margin',
      pt: 'Margem Líquida'
    },
    definition: {
      en: 'The percentage of every euro of revenue that becomes actual profit for shareholders after paying everything: production costs, operating expenses, interest on debt, and taxes. A 20% net margin means the company keeps $0.20 of pure profit from every $1 sold. Luxury and software often exceed 25%. Supermarkets and airlines scrape by at 1-3%. Comparing net margins across industries makes no sense. Comparing them within the same industry reveals who has superior pricing power and cost discipline.',
      pt: 'A percentagem de cada euro de receita que se transforma em lucro real para os acionistas depois de pagar tudo: custos de produção, despesas operacionais, juros da dívida e impostos. Uma margem de 20% significa que a empresa fica com 0,20€ de lucro puro por cada 1€ vendido. Luxo e software frequentemente ultrapassam 25%. Supermercados e companhias aéreas arrastam-se entre 1-3%. Comparar margens líquidas entre setores não faz sentido. Compará-las dentro do mesmo setor revela quem tem poder de preço e disciplina de custos superiores.'
    }
  },
  {
    slug: 'bear-market',
    title: {
      en: 'Bear Market',
      pt: 'Bear Market (Mercado Urso)'
    },
    definition: {
      en: 'A prolonged drop in stock prices, typically 20% or more from a recent peak. Usually accompanied by economic pessimism, rising unemployment, and shrinking corporate earnings. Since 1928, the S&P 500 has gone through about 26 bear markets with an average decline of 36% lasting roughly 9.6 months. While terrifying in the moment, every single bear market in S&P 500 history was eventually followed by new all-time highs. Historically, the best buying opportunities for patient investors.',
      pt: 'Uma queda prolongada nos preços das ações, tipicamente de 20% ou mais desde um pico recente. Habitualmente acompanhado por pessimismo económico, aumento do desemprego e contração dos lucros empresariais. Desde 1928, o S&P 500 passou por cerca de 26 bear markets com uma queda média de 36% e duração de aproximadamente 9,6 meses. Embora sejam aterradores no momento, todos os bear markets na história do S&P 500 foram eventualmente seguidos por novos máximos históricos. Historicamente, as melhores oportunidades de compra para investidores pacientes.'
    }
  },
  {
    slug: 'bull-market',
    title: {
      en: 'Bull Market',
      pt: 'Bull Market (Mercado Touro)'
    },
    definition: {
      en: 'A sustained period of rising stock prices, generally 20% or more from a recent low, with economic optimism, strong earnings, and investor confidence. Bull markets last significantly longer than bear markets. The average since 1928 ran about 2.7 years with a 114% gain. The longest in U.S. history stretched from March 2009 to February 2020, nearly 11 years. The bull attacks by thrusting its horns upward, symbolizing upward momentum. BullValue\'s name comes directly from this.',
      pt: 'Um período sustentado de subida nos preços das ações, geralmente de 20% ou mais desde um mínimo recente, com otimismo económico, lucros fortes e confiança dos investidores. Os bull markets duram significativamente mais do que os bear markets. A média desde 1928 durou cerca de 2,7 anos com um ganho de 114%. O mais longo da história dos EUA estendeu-se de março de 2009 a fevereiro de 2020, quase 11 anos. O touro ataca empurrando os chifres para cima, simbolizando impulso ascendente. O nome BullValue vem diretamente disto.'
    }
  },
  {
    slug: 'market-cap',
    title: {
      en: 'Market Cap',
      pt: 'Market Cap (Capitalização de Mercado)'
    },
    definition: {
      en: 'Short for Market Capitalization. It represents the total value of all a company\'s shares of stock. Calculated by multiplying the current stock price by the total number of outstanding shares. It tells you how much it would cost to buy the entire company right now. Companies are generally divided into mega-cap ($200B+), large-cap ($10B-$200B), mid-cap ($2B-$10B), and small-cap ($300M-$2B).',
      pt: 'Abreviatura de Capitalização de Mercado. Representa o valor total de todas as ações de uma empresa. É calculado multiplicando o preço atual da ação pelo número total de ações em circulação. Diz-te quanto custaria comprar a empresa inteira neste momento. As empresas são geralmente divididas em mega-cap (+200B$), large-cap (10B$-200B$), mid-cap (2B$-10B$) e small-cap (300M$-2B$).'
    }
  },
  {
    slug: 'pe-ratio',
    title: {
      en: 'P/E Ratio',
      pt: 'Rácio P/E (Preço/Lucro)'
    },
    definition: {
      en: 'Price-to-Earnings Ratio. The most popular valuation metric in the world. It shows how much investors are willing to pay for one dollar of a company\'s earnings. A P/E of 20 means you are paying $20 for every $1 the company earns in profit. A high P/E implies investors expect high future growth (or the stock is expensive). A low P/E implies low expectations (or the stock is a bargain). It is most useful when comparing similar companies in the same industry.',
      pt: 'Rácio Preço/Lucro (Price-to-Earnings). A métrica de avaliação mais popular do mundo. Mostra quanto os investidores estão dispostos a pagar por cada dólar/euro de lucro de uma empresa. Um P/E de 20 significa que estás a pagar 20$ por cada 1$ que a empresa lucra. Um P/E alto implica que os investidores esperam muito crescimento futuro (ou a ação está cara). Um P/E baixo implica baixas expectativas (ou a ação está barata). É mais útil quando se compara empresas semelhantes no mesmo setor.'
    }
  }
];
