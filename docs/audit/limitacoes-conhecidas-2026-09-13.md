# Limitações conhecidas — auditoria de 2026-09-13

> Coisas que foram investigadas, medidas, e deliberadamente **não** alteradas.
> Cada uma tem a razão por escrito. O que foi corrigido está no histórico do
> git; isto é a outra metade — o que se decidiu deixar como está, e porquê.

---

## 1. Margem bruta entre 85% e 95% em negócios intensivos em capital

**O que se vê.** A CMS Energy aparece com 92% de margem bruta, a PPL com 91%,
a Norfolk Southern com 92% e a Union Pacific com 90%. Nenhuma destas empresas
tem margens dessas: o custo de uma utility são o combustível e a energia
comprada (60-75% da receita), e o de uma ferroviária é o *operating ratio*,
que anda nos 60%.

**Porque acontece.** A API `companyfacts` da SEC devolve apenas factos SEM
dimensões. Na CMS, as únicas rubricas de custo expostas são `FuelCosts`
(0,66 mM) e `OtherCostAndExpenseOperating` (1,73 mM), contra 8,3 mM de
receita — o resto do custo está em tags dimensionadas ou de extensão, que a
API descarta. O lucro bruto é então derivado de um custo parcial.

**Porque não foi corrigido.** O guarda que já existe apaga margens derivadas
acima de 95% (ver `ingest_fundamentals.py`). Descê-lo para 85% apanharia
estas — mas a mesma banda contém valores verdadeiros:

| empresa | margem | é real? |
|---|---|---|
| Adobe | 89% | sim (~89%) |
| Autodesk | 91% | sim (~92%) |
| Incyte | 93% | sim, farmacêutica |
| Realty Income, Simon, Essex | 87-93% | sim, REITs triple-net |
| CMS, PPL, NSC, UNP | 90-92% | **não** |

O flag `gp_reportado` separa parte disto (a Adobe e a Autodesk taggam
`GrossProfit`, as utilities não), mas não os REITs, que também não taggam e
cujos 87-93% são legítimos.

Não há sinal na linha que separe as duas populações: a margem operacional não
discrimina (uma software com 90% de margem bruta gasta 60-70% em I&D e
comercial, tal como uma utility gasta 71% em operação). Baixar o limiar
destruiria dados bons para corrigir dados maus.

**Como resolver a sério.** Outra fonte para o custo da receita destes setores
— as demonstrações financeiras completas em vez da `companyfacts`, via
edgartools, que já é usado para os segmentos.

---

## 2. Séries de preços paradas: AVB, EA, EQR

**O que se vê.** Os gráficos destas três terminam em julho ou agosto de 2026.

**Porque acontece.** O yfinance deixou de as devolver. Não é corrupção: os
últimos preços gravados estão certos (a EA a 209,70 bate ao cêntimo com o
Finnhub; a EQR a 63,66 contra 65,35; a AVB a 195,50 contra 184,06).

**Impacto.** Limitado. A página de ação mostra a cotação AO VIVO pelo Finnhub,
portanto quem visita vê o preço certo. O que envelhece é o gráfico histórico e
a capitalização no screener, com desvios de 0%, 2,6% e 6% em três de 559.

**Como resolver a sério.** Uma segunda fonte de histórico para símbolos que o
yfinance não serve. O Finnhub tem candles no plano pago.

---

## 3. Capitalização subavaliada na ERIC, NVO e SNY

**O que se vê.** A nossa capitalização destas três fica ABAIXO da de
referência — rácios de 0,11, 0,15 e 0,59.

**Porque não foi corrigido.** O `backfill_shares.py` corrige o caso inverso
(ordinárias a preço de ADS, que dá capitalização a MAIS) porque aí o rácio
implícito é o de um ADR e verifica-se contra uma segunda fonte. Este é outro
problema — provavelmente uma classe de ações por contar — e o guarda recusa-se
a adivinhar em vez de escrever um número que não sabe justificar.

---

## 4. Ano fiscal da Amazon e afins: 16 violações de identidade de período

Todas na baseline, todas revistas. Ver `period_identity_accepted.json` para as
que têm racional individual (GPN e LHX mudaram de calendário fiscal a meio da
história; a VRT tem filings-resto de antes do SPAC).

---

## 5. Páginas legais só em português

O `/en/terms`, `/en/privacy` e `/en/refund` servem texto português. As páginas
estão em JSX, não em ficheiros de tradução.

**Porque não foi corrigido.** São documentos com peso legal. Uma tradução
automática de termos de subscrição e política de reembolsos é pior do que não
ter tradução — e o lançamento é para uma comunidade portuguesa.

---

## 6. Sitemap contra funil de aquisição

O sitemap anuncia 1.160 URLs. O funil de convidados redireciona tudo excepto
`/`, `/stock/AAPL`, `/dcf` e as páginas de marketing para `/register` — com
307, inclusive ao Googlebot (testado).

Ou seja: ~1.118 dos URLs anunciados não são indexáveis.

**Porque não foi corrigido.** É um conflito entre duas decisões de produto,
ambas deliberadas: o funil existe para maximizar criação de contas (está
documentado em `lib/supabase/middleware.ts`), e o investimento em SEO existe
(JSON-LD, glossário, diretório). Qual das duas cede é uma decisão de negócio,
não um bug a corrigir sozinho.

**O que JÁ foi corrigido.** Havia uma parte que não era decisão nenhuma: o
sitemap anunciava `/explore` e `/calendar`, que respondem 307 a um anónimo, e
omitia `/glossary`, que responde 200. Ou seja, anunciava o que redireciona e
calava o que não redireciona. O glossário entrou. As outras duas ficam, porque
tirá-las é escolher um lado do conflito acima.

---

## 7. CEO desconhecido em 67 empresas

**O que se vê.** O `companies.ceo` está a `null` em 67 das 559 activas, e é
essa coluna que ancora o nome mostrado no separador Empresa — HSBC, Netflix,
SAP, Shell, Spotify e Ferrari estão nesse grupo. Nessas, o separador diz que
não há dados verificados, e não mostra secção nenhuma. A Visão geral também
não mostra a linha do CEO: o `.filter(d => !!d.value)` já a deixava cair.

**Porque não se mostra o palpite do modelo.** Chegou a mostrar, e foi assim
que a Intel apareceu com o Pat Gelsinger durante meses depois de ele sair. Um
nome que ninguém verificou aparece com o mesmo ar de certeza que um
verificado — e não é só o nome, porque a antiguidade, a alocação de capital e
a análise são todas sobre a pessoa que o modelo escolheu.

**Porque acontece.** O `ingest_ceos.py` lê o `companyOfficers` do yfinance, que
é esparso fora dos EUA: 28 das 67 são de fora. A corrida de 1 de setembro
preencheu 517 e não encontrou nada em 42.

**Porque não foi corrigido.** As alternativas estão avaliadas e rejeitadas no
cabeçalho do próprio script: o Finnhub gratuito não tem o campo, o Form 4 da
SEC apanha CEOs de divisão (o "CEO CCB" da JPMorgan em vez do CEO do banco), e
o Wikidata tem o serviço instável e a modelação de tickers inconsistente.
Escrever um nome que não se consegue verificar é como se estragam dados.

**Como resolver a sério.** Uma API paga de perfis, ou ler o nome do próprio
10-K/20-F via edgartools, que já é usado para os segmentos.

**A antiguidade do CEO saiu por completo.** Mostrava-se "CEO · Desde 2014", e
a data vinha da memória do modelo: a ficha da Intel dizia "Desde 2024" quando
o Lip-Bu Tan entrou em 2025. Não há fonte para datas — os dados de insiders
começam em agosto de 2025, e por isso não distinguem quem entrou ontem de quem
lá está há vinte anos. As colunas `tenure_en`/`tenure_pt` ficaram na tabela
(mudá-las obrigava a mexer no schema de produção) e passam a ser gravadas
vazias.

O resto do texto passou a andar sobre números nossos: os últimos oito anos de
receita, resultado líquido, FCF, dividendo por ação, ações em circulação e
dívida vão com a pergunta, e o modelo está instruído a não fazer nenhuma
afirmação quantitativa fora deles, a não escrever datas e a não nomear
aquisições. A nota de alocação de capital deixou de ser uma recordação: a
Intel sai POOR com o FCF a passar de +21.605M para −15.656M, que é o que está
na nossa base.

---

## 8. Base de dados a 335 MB de 500 MB

O plano gratuito do Supabase são 500 MB. A tabela `prices` sozinha são 239 MB
e cresce ~190 mil linhas por ano. Não é urgente; é para saber antes de ser.

---

## 9. Nº de ações a alternar entre dois valores (CVNA, AMCR e mais 4)

**O que se vê.** O gráfico de ações em circulação da Carvana ziguezagueia: 133,
661, 143, 716, 146, 1121, 148, 740 milhões, trimestre a trimestre. A Amcor faz
o mesmo entre 288 e 1.444. São 12 períodos em 6 empresas (CVNA, AMCR, ECHO,
AIG, SPOT, TRGP).

**Porque acontece.** A extração alterna entre duas tags XBRL que medem coisas
diferentes — provavelmente uma classe de ações contra o total.

**Porque não foi corrigido.** A regra que detecta isto é fiável (um período
que está a mais de 3× de AMBOS os vizinhos, com os vizinhos a concordarem
entre si), mas não diz qual dos dois ramos é o certo — e como os valores
ALTERNAM, os dois ficam sinalizados. Corrigir ambos seria pior do que não
fazer nada.

Tentou-se uma referência externa e as fontes não concordam:

| empresa | ramo A | ramo B | Finnhub |
|---|---|---|---|
| CVNA | ~148 M | 661-1121 M | 1.100 M |
| AMCR | ~288 M | ~1.444 M | 462 M |

Nem o Finnhub bate com nenhum dos ramos na Amcor. Sem verdade estabelecida,
escolher é adivinhar — e adivinhar é como se destroem dados, não como se
corrigem.

**Como resolver a sério.** Ler as tags dimensionadas do filing (via
edgartools, como o fill_missing_shares.py já faz) para ver quantas classes a
empresa tem e somá-las explicitamente, em vez de aceitar a primeira tag que
aparece.
