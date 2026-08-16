# Qualidade de dados — `revenueSegments`

> Gerado por `scripts/validate_segments.py` em 2026-08-03T01:39:51 contra `localhost:5432` (read-only).

> `segment_targets.py` sha256 `77c95119241932ef…` · `max(fundamentals.updatedAt)` = 2026-08-02 19:34:33.967000


## 1. Sumário executivo

| Métrica | Valor |
|---|---|
| **SDQI** | **87.13** / 100 |
| SDQI ponderado por impacto | 53.06 |
| R — reconciliação | 85.52% |
| S — estrutura sem P0 | 94.27% |
| L — rótulos limpos | 95.96% |
| C — continuidade de eixo | 82.87% |
| V — cobertura | 70.05% |
| Empresas analisadas | 529 |
| — com segmentos | 434 |
| — sem segmentos nenhuns | 95 |
| Linhas com segmentos | 14626 |
| Pares chave/valor | 63727 |
| Achados totais | 8676 |
| — P0 | 2110 |
| — P1 | 5940 |
| — P2 | 523 |
| — P3 | 103 |

### Denominadores (explícitos, para o score ser honesto)

- `scoreableRows`: 14624
- `rowsWithSegs`: 14626
- `pairs`: 63727
- `transitions`: 3152
- `annualRowsActive`: 5106

> Nota: as regras do grupo A saltam linhas com `revenue` nulo. O `SEG_ORPHAN_ROW` conta-as explicitamente — omitir isto seria reportar 95% de qualidade sobre uma amostra de 60%.


## 2. Achados por regra

| Regra | Sev | Ocorrências | Empresas |
|---|---|---|---|
| `SEG_LABEL_HTML_ENTITY` | P1 | 1749 | 85 |
| `SEG_SUM_MINOR_OVER` | P1 | 1110 | 111 |
| `SEG_SUM_MAJOR_OVER` | P0 | 633 | 82 |
| `SEG_RECONCILING_SUBSET` | P0 | 590 | 84 |
| `SEG_RECONCILING_SUBSET_AMBIGUOUS` | P1 | 410 | 56 |
| `SEG_AXIS_SWITCH` | P1 | 385 | 232 |
| `SEG_TOTAL_LABEL` | P1 | 385 | 36 |
| `SEG_VALUE_NEGATIVE` | P1 | 303 | 75 |
| `SEG_LABEL_CAMEL_ARTIFACT` | P1 | 285 | 21 |
| `SEG_LABEL_NONPRINTING` | P1 | 279 | 12 |
| `SEG_LABEL_COLLISION_DISJOINT` | P1 | 253 | 134 |
| `SEG_MISSING_PERIOD` | P2 | 185 | 185 |
| `SEG_LABEL_XBRL_RESIDUE` | P1 | 176 | 10 |
| `SEG_SUM_SEVERE_UNDER` | P0 | 167 | 15 |
| `SEG_VALUE_EXCEEDS_REVENUE` | P0 | 158 | 30 |
| `SEG_SERIES_HOLE` | P1 | 155 | 67 |
| `SEG_QSUM_MISMATCH` | P1 | 154 | 14 |
| `SEG_GRAND_TOTAL_VALUE` | P1 | 153 | 35 |
| `SEG_VALUE_ZERO` | P2 | 144 | 44 |
| `SEG_KEY_CARDINALITY` | P2 | 139 | 139 |
| `SEG_SUM_UNDER` | P1 | 127 | 37 |
| `SEG_MISSING_ALL` | P3 | 95 | 95 |
| `SEG_AXIS_MIX_GEO` | P0 | 92 | 14 |
| `SEG_LABEL_NON_REVENUE` | P0 | 75 | 9 |
| `SEG_AXIS_MIX_CUSTOMER` | P1 | 65 | 6 |
| `SEG_SUM_EXPLOSIVE` | P0 | 52 | 13 |
| `SEG_Q4_CLONE_OF_ANNUAL` | P0 | 34 | 12 |
| `SEG_STALE` | P1 | 33 | 33 |
| `SEG_LABEL_FOOTNOTE` | P1 | 31 | 12 |
| `SEG_LABEL_TABLE_HEADER` | P1 | 28 | 5 |
| `SEG_Q_GT_ANNUAL` | P0 | 28 | 6 |
| `SEG_AXIS_MIX_TIMING` | P0 | 26 | 2 |
| `SEG_INTEGER_MULTIPLE` | P0 | 25 | 11 |
| `SEG_SUM_AXIS_DOUBLE` | P0 | 24 | 8 |
| `SEG_SHARE_JUMP` | P1 | 22 | 18 |
| `SEG_SINGLE_KEY` | P2 | 17 | 3 |
| `SEG_ELIMINATION_KEY_PRESENT` | P1 | 16 | 2 |
| `SEG_LABEL_SUBTOTAL_PREFIX` | P1 | 16 | 2 |
| `SEG_LABEL_NON_REVENUE_AMBIGUOUS` | P1 | 12 | 1 |
| `SEG_PARENT_ROLLUP` | P0 | 11 | 11 |
| `SEG_Q4_CARRIES_ANNUAL` | P0 | 11 | 5 |
| `SEG_SUBSET_SEARCH_TRUNCATED` | P3 | 8 | 1 |
| `SEG_LABEL_COLLISION_SAME_ROW` | P0 | 4 | 4 |
| `SEG_PEER_UNDERSEGMENTED` | P2 | 4 | 4 |
| `SEG_SUM_AXIS_TRIPLE` | P0 | 3 | 2 |
| `SEG_VALUE_UNIT_SUSPECT` | P0 | 2 | 2 |
| `SEG_SUM_NEGATIVE` | P0 | 1 | 1 |
| `SEG_ORPHAN_ROW` | P2 | 1 | 1 |

## 3. Coortes de remediação

Cada coorte mapeia 1:1 para UMA correção de raiz. É isto que colapsa 529 empresas em 10 itens de trabalho.

| Coorte | Empresas | Causa-raiz |
|---|---|---|
| `NO_COVERAGE` | 95 | sem cron (.github/workflows/) e filings[:10] em ingest_segments.py:136 |
| `Q4_CONTAMINATED` | 11 | UPDATE sem periodType — ingest_segments.py:165-169 |
| `AXIS_STACKED` | 1 | cego ao eixo: member.text sem @dimension — ingest_segments.py:60-66 |
| `TOTAL_ROW_INJECTED` | 6 | .replace('Segment','') — build_segment_map.py:48-61 |
| `BANK_PARTIAL` | 4 | 5 tags hardcoded, faltam juros/prémios — ingest_segments.py:89-95 |
| `ELIMINATION_GROSS` | 29 | DECISÃO DE PRODUTO (bruto vs líquido), não bug — DATA_DISCREPANCIES.md |
| `ERRATIC_EXTRACTION` | 1 | duração+eixo instáveis por filing — ingest_segments.py:72-78 |
| `AXIS_UNSTABLE` | 41 | segment_targets.py estático, gerado 2026-07-03 e nunca regenerado |
| `LABEL_CHURN` | 80 | clean_segment_name sem unescape/acrónimos — build_segment_map.py:48-61 |
| `CLEAN` | 261 | — |

### Validação da taxonomia (silhouette)

O k-means NÃO atribui coortes — serve só para auditar se as fronteiras definidas à mão são separáveis.

> **Como ler:** o silhouette mede separação GEOMÉTRICA. Uma coorte que é uma BANDA INTERMÉDIA de uma dimensão ordenada (o `ELIMINATION_GROSS` ocupa 1,02 < mediana ≤ 1,35, entre o `CLEAN` ~1,0 e o `AXIS_STACKED` >1,5) tem silhouette negativo POR CONSTRUÇÃO — cada ponto tem vizinhos mais próximos nas bandas adjacentes. Isso não invalida a fronteira: a distinção é contabilística, não geométrica. O silhouette só é acionável para coortes que deveriam formar um grupo ISOLADO (`Q4_CONTAMINATED`, `BANK_PARTIAL`, `TOTAL_ROW_INJECTED`, `LABEL_CHURN`); aí, < 0,10 é sinal real de fronteira mal desenhada.

| Coorte | Silhouette |
|---|---|
| `TOTAL_ROW_INJECTED` | 0.506 |
| `AXIS_UNSTABLE` | 0.331 |
| `CLEAN` | 0.248 |
| `BANK_PARTIAL` | 0.242 |
| `Q4_CONTAMINATED` | 0.098 ⚠️ revisar fronteira |
| `LABEL_CHURN` | -0.069 ⚠️ revisar fronteira |
| `ELIMINATION_GROSS` | -0.205 (banda intermédia — negativo esperado) |

## 4. Top 40 empresas por impacto

`impacto = severityMass × audienceScore × surfaceScore × recencyScore`. Uma empresa com o gráfico suprimido continua a pontuar porque o `lib/ai/context.ts` injeta os mesmos segmentos no Gemini como `verificado`.

| # | Ticker | Coorte | Impacto | % cum. | P0 | mediana r | MAD r | Gráfico |
|---|---|---|---|---|---|---|---|---|
| 1 | **UBER** | `Q4_CONTAMINATED` | 7063 | 3.5% | 133 | 1.918 | 0.430 | suprimido |
| 2 | **CDW** | `Q4_CONTAMINATED` | 5922 | 6.5% | 94 | 1.000 | 0.000 | visível |
| 3 | **WAT** | `Q4_CONTAMINATED` | 5546 | 9.2% | 61 | 1.000 | 0.000 | visível |
| 4 | **RJF** | `Q4_CONTAMINATED` | 4895 | 11.6% | 52 | 1.072 | 0.042 | visível |
| 5 | **MO** | `CLEAN` | 4406 | 13.8% | 87 | 1.253 | 0.054 | suprimido |
| 6 | **RTX** | `ELIMINATION_GROSS` | 4168 | 15.9% | 28 | 1.034 | 0.008 | visível |
| 7 | **MDLZ** | `LABEL_CHURN` | 4063 | 17.9% | 0 | 1.000 | 0.000 | visível |
| 8 | **DVA** | `Q4_CONTAMINATED` | 3933 | 19.9% | 63 | 1.023 | 0.023 | visível |
| 9 | **INTC** | `LABEL_CHURN` | 3593 | 21.7% | 24 | 1.008 | 0.008 | visível |
| 10 | **MCO** | `ELIMINATION_GROSS` | 3430 | 23.4% | 38 | 1.030 | 0.002 | visível |
| 11 | **EXC** | `ELIMINATION_GROSS` | 3185 | 24.9% | 26 | 1.094 | 0.010 | visível |
| 12 | **AEP** | `ELIMINATION_GROSS` | 3005 | 26.4% | 14 | 1.091 | 0.013 | visível |
| 13 | **SBUX** | `LABEL_CHURN` | 2980 | 27.9% | 0 | 1.000 | 0.000 | visível |
| 14 | **DOV** | `LABEL_CHURN` | 2921 | 29.4% | 1 | 1.000 | 0.000 | visível |
| 15 | **IQV** | `LABEL_CHURN` | 2888 | 30.8% | 0 | 1.000 | 0.000 | visível |
| 16 | **WMB** | `AXIS_UNSTABLE` | 2803 | 32.2% | 21 | 1.057 | 0.036 | visível |
| 17 | **VMC** | `ELIMINATION_GROSS` | 2584 | 33.5% | 17 | 1.063 | 0.004 | visível |
| 18 | **IFF** | `Q4_CONTAMINATED` | 2504 | 34.7% | 33 | 1.000 | 0.000 | visível |
| 19 | **PKG** | `ELIMINATION_GROSS` | 2401 | 35.9% | 24 | 1.042 | 0.004 | visível |
| 20 | **CNC** | `ELIMINATION_GROSS` | 2282 | 37.1% | 52 | 1.116 | 0.018 | suprimido |
| 21 | **DOW** | `LABEL_CHURN` | 2235 | 38.2% | 0 | 1.000 | 0.000 | visível |
| 22 | **L** | `AXIS_UNSTABLE` | 2183 | 39.2% | 32 | 0.258 | 0.090 | visível |
| 23 | **IEX** | `LABEL_CHURN` | 2119 | 40.3% | 0 | 1.000 | 0.000 | visível |
| 24 | **ITW** | `LABEL_CHURN` | 2094 | 41.3% | 1 | 1.001 | 0.000 | visível |
| 25 | **ES** | `CLEAN` | 2083 | 42.4% | 46 | 1.237 | 0.038 | suprimido |
| 26 | **TSN** | `ELIMINATION_GROSS` | 2039 | 43.4% | 22 | 1.031 | 0.005 | visível |
| 27 | **ED** | `Q4_CONTAMINATED` | 2000 | 44.4% | 20 | 1.017 | 0.026 | visível |
| 28 | **OXY** | `ELIMINATION_GROSS` | 1994 | 45.4% | 20 | 1.072 | 0.030 | visível |
| 29 | **ATO** | `ELIMINATION_GROSS` | 1903 | 46.3% | 45 | 1.127 | 0.028 | suprimido |
| 30 | **WELL** | `CLEAN` | 1861 | 47.2% | 25 | 1.000 | 0.000 | visível |
| 31 | **LVS** | `ELIMINATION_GROSS` | 1815 | 48.1% | 14 | 1.026 | 0.005 | visível |
| 32 | **OMC** | `LABEL_CHURN` | 1797 | 49.0% | 0 | 1.000 | 0.000 | visível |
| 33 | **PEG** | `AXIS_UNSTABLE` | 1738 | 49.9% | 32 | 1.129 | 0.043 | suprimido |
| 34 | **TMO** | `ELIMINATION_GROSS` | 1683 | 50.7% | 10 | 1.046 | 0.002 | visível |
| 35 | **BR** | `TOTAL_ROW_INJECTED` | 1631 | 51.5% | 12 | 1.003 | 0.007 | visível |
| 36 | **SNPS** | `CLEAN` | 1624 | 52.4% | 21 | 1.000 | 0.000 | visível |
| 37 | **HUM** | `CLEAN` | 1572 | 53.1% | 36 | 1.252 | 0.041 | suprimido |
| 38 | **IBKR** | `CLEAN` | 1560 | 53.9% | 19 | 0.471 | 0.088 | visível |
| 39 | **EME** | `Q4_CONTAMINATED` | 1555 | 54.7% | 15 | 1.000 | 0.000 | visível |
| 40 | **PG** | `LABEL_CHURN` | 1475 | 55.4% | 0 | 1.000 | 0.000 | visível |

- As **34** empresas de maior impacto concentram 50% do impacto total.

- As **91** empresas de maior impacto concentram 80% do impacto total.

## 5. Exemplos trabalhados por coorte


### `NO_COVERAGE` — 95 empresas · causa: sem cron (.github/workflows/) e filings[:10] em ingest_segments.py:136

Exemplo de maior impacto: **GOOG** (mediana r=None, MAD=None, 0 achados P0)

- `SEG_MISSING_ALL` [P3] - — 51 períodos de fundamentais e ZERO segmentos

Outras: JPM, ASML, HSBC, CAG, JNJ, BAC, SHEL, BCS, GE, UNH, ARM, GS, MS, NFLX, AZN …

### `Q4_CONTAMINATED` — 11 empresas · causa: UPDATE sem periodType — ingest_segments.py:165-169

Exemplo de maior impacto: **UBER** (mediana r=1.918, MAD=0.43, 133 achados P0)

- `SEG_SUM_MAJOR_OVER` [P0] 2020-06-30 — Σ segmentos 4,577,000,000 vs receita 1,913,000,000 = 2.393x — eixo parcial ou chave de rollup
- `SEG_RECONCILING_SUBSET` [P0] 2020-06-30 — fecha com 2 chaves via dfs-pruned [All Other Countries, Mobility]; a REMOVER 3: Freight(PRODUCT), Delivery(PRODUCT), United States And Canada(GEO)
- `SEG_AXIS_MIX_GEO` [P0] 2020-06-30 — eixo GEO [All Other Countries, United States And Canada] empilhado com eixo PRODUCT [Delivery, Freight, Mobility] — soma 2.393x
- `SEG_SUM_MAJOR_OVER` [P0] 2020-09-30 — Σ segmentos 6,402,000,000 vs receita 2,813,000,000 = 2.276x — eixo parcial ou chave de rollup
- `SEG_RECONCILING_SUBSET` [P0] 2020-09-30 — fecha com 2 chaves via dfs-pruned [Delivery, Mobility]; a REMOVER 3: Freight(PRODUCT), All Other Countries(GEO), United States And Canada(GEO)
- `SEG_AXIS_MIX_GEO` [P0] 2020-09-30 — eixo GEO [All Other Countries, United States And Canada] empilhado com eixo PRODUCT [Delivery, Freight, Mobility] — soma 2.276x

Outras: CDW, WAT, RJF, DVA, IFF, ED, EME, ALGN, EIX, TSCO

### `AXIS_STACKED` — 1 empresas · causa: cego ao eixo: member.text sem @dimension — ingest_segments.py:60-66

Exemplo de maior impacto: **GWW** (mediana r=1.0, MAD=0.0, 34 achados P0)

- `SEG_SUM_MINOR_OVER` [P1] 2016-03-31 — Σ segmentos 2,590,371,000 vs receita 2,506,538,000 = 1.033x — eliminações/impostos não subtraídos
- `SEG_RECONCILING_SUBSET` [P0] 2016-03-31 — fecha com 3 chaves via dfs-pruned [Canada, Other Businesses, United States]; a REMOVER 1: Other(PRODUCT)
- `SEG_AXIS_MIX_GEO` [P0] 2016-03-31 — eixo GEO [Canada, United States] empilhado com eixo PRODUCT [Other, Other Businesses] — soma 1.033x
- `SEG_SUM_MINOR_OVER` [P1] 2016-06-30 — Σ segmentos 2,647,126,000 vs receita 2,563,668,000 = 1.033x — eliminações/impostos não subtraídos
- `SEG_RECONCILING_SUBSET` [P0] 2016-06-30 — fecha com 3 chaves via dfs-pruned [Canada, Other Businesses, United States]; a REMOVER 1: Other(PRODUCT)
- `SEG_AXIS_MIX_GEO` [P0] 2016-06-30 — eixo GEO [Canada, United States] empilhado com eixo PRODUCT [Other, Other Businesses] — soma 1.033x

Outras: 

### `TOTAL_ROW_INJECTED` — 6 empresas · causa: .replace('Segment','') — build_segment_map.py:48-61

Exemplo de maior impacto: **BR** (mediana r=1.003, MAD=0.007, 12 achados P0)

- `SEG_SUM_MINOR_OVER` [P1] 2019-03-31 — Σ segmentos 1,249,400,000 vs receita 1,224,800,000 = 1.020x — eliminações/impostos não subtraídos
- `SEG_TOTAL_LABEL` [P0] 2019-03-31 — 'Total GTO Recurring fee revenues' é um rótulo de TOTAL/subtotal e a soma excede a receita (1.020x)
- `SEG_TOTAL_LABEL` [P0] 2019-03-31 — 'Total ICS Event-driven fee revenues' é um rótulo de TOTAL/subtotal e a soma excede a receita (1.020x)
- `SEG_RECONCILING_SUBSET_AMBIGUOUS` [P1] 2019-03-31 — mais que um subconjunto fecha com a receita via dfs-pruned — não se nomeia culpado
- `SEG_SUM_MINOR_OVER` [P1] 2019-06-30 — Σ segmentos 4,465,400,000 vs receita 4,362,200,000 = 1.024x — eliminações/impostos não subtraídos
- `SEG_TOTAL_LABEL` [P0] 2019-06-30 — 'Total ICS Event-driven fee revenues' é um rótulo de TOTAL/subtotal e a soma excede a receita (1.024x)

Outras: XEL, URI, IBM, EFX, CRM

### `BANK_PARTIAL` — 4 empresas · causa: 5 tags hardcoded, faltam juros/prémios — ingest_segments.py:89-95

Exemplo de maior impacto: **HBAN** (mediana r=0.16, MAD=0.019, 22 achados P0)

- `SEG_SUM_SEVERE_UNDER` [P0] 2020-12-31 — Σ segmentos 885,000,000 vs receita 3,647,000,000 = 0.243x — falta um fluxo de receita inteiro
- `SEG_SUM_SEVERE_UNDER` [P0] 2021-06-30 — Σ segmentos 259,000,000 vs receita 935,000,000 = 0.277x — falta um fluxo de receita inteiro
- `SEG_SUM_SEVERE_UNDER` [P0] 2021-09-30 — Σ segmentos 315,000,000 vs receita 1,205,000,000 = 0.261x — falta um fluxo de receita inteiro
- `SEG_LABEL_HTML_ENTITY` [P1] 2021-09-30 — 'Consumer &amp; Business Banking' tem entidade HTML literal — falta html.unescape()
- `SEG_SUM_SEVERE_UNDER` [P0] 2021-12-31 — Σ segmentos 1,125,000,000 vs receita 4,191,000,000 = 0.268x — falta um fluxo de receita inteiro
- `SEG_SUM_SEVERE_UNDER` [P0] 2022-03-31 — Σ segmentos 310,000,000 vs receita 1,195,000,000 = 0.259x — falta um fluxo de receita inteiro

Outras: AXP, CCI, FITB

### `ELIMINATION_GROSS` — 29 empresas · causa: DECISÃO DE PRODUTO (bruto vs líquido), não bug — DATA_DISCREPANCIES.md

Exemplo de maior impacto: **RTX** (mediana r=1.034, MAD=0.008, 28 achados P0)

- `SEG_SUM_MAJOR_OVER` [P0] 2016-06-30 — Σ segmentos 15,085,000,000 vs receita 12,066,000,000 = 1.250x — eixo parcial ou chave de rollup
- `SEG_RECONCILING_SUBSET_AMBIGUOUS` [P1] 2016-06-30 — mais que um subconjunto fecha com a receita via dfs-pruned — não se nomeia culpado
- `SEG_VALUE_ZERO` [P2] 2016-06-30 — 'General Corporate Expenses' = 0
- `SEG_SUM_MAJOR_OVER` [P0] 2016-09-30 — Σ segmentos 14,580,000,000 vs receita 11,534,000,000 = 1.264x — eixo parcial ou chave de rollup
- `SEG_RECONCILING_SUBSET_AMBIGUOUS` [P1] 2016-09-30 — mais que um subconjunto fecha com a receita via dfs-pruned — não se nomeia culpado
- `SEG_VALUE_ZERO` [P2] 2016-09-30 — 'General Corporate Expenses' = 0

Outras: MCO, EXC, AEP, VMC, PKG, CNC, TSN, OXY, ATO, LVS, TMO, LMT, VZ, CI, WEC …

### `ERRATIC_EXTRACTION` — 1 empresas · causa: duração+eixo instáveis por filing — ingest_segments.py:72-78

Exemplo de maior impacto: **TKO** (mediana r=0.574, MAD=0.118, 1 achados P0)

- `SEG_SUM_UNDER` [P1] 2023-12-31 — Σ segmentos 1,674,968,000 vs receita 3,224,796,000 = 0.519x — extração parcial
- `SEG_SUM_UNDER` [P1] 2024-03-31 — Σ segmentos 629,711,000 vs receita 1,222,448,000 = 0.515x — extração parcial
- `SEG_SUM_UNDER` [P1] 2024-06-30 — Σ segmentos 851,161,000 vs receita 1,193,191,000 = 0.713x — extração parcial
- `SEG_SUM_SEVERE_UNDER` [P0] 2024-09-30 — Σ segmentos 681,273,000 vs receita 1,540,683,000 = 0.442x — falta um fluxo de receita inteiro
- `SEG_SUM_UNDER` [P1] 2024-12-31 — Σ segmentos 2,804,341,000 vs receita 4,884,241,000 = 0.574x — extração parcial
- `SEG_SUM_UNDER` [P1] 2024-12-31 — Σ segmentos 642,196,000 vs receita 927,919,000 = 0.692x — extração parcial

Outras: 

### `AXIS_UNSTABLE` — 41 empresas · causa: segment_targets.py estático, gerado 2026-07-03 e nunca regenerado

Exemplo de maior impacto: **WMB** (mediana r=1.057, MAD=0.036, 21 achados P0)

- `SEG_GRAND_TOTAL_VALUE` [P1] 2016-03-31 — 'Williams Partners' = 1,654,000,000 = a receita total — é o total, não um segmento
- `SEG_GRAND_TOTAL_VALUE` [P1] 2016-06-30 — 'Williams Partners' = 1,740,000,000 = a receita total — é o total, não um segmento
- `SEG_GRAND_TOTAL_VALUE` [P1] 2016-09-30 — 'Williams Partners' = 1,907,000,000 = a receita total — é o total, não um segmento
- `SEG_SUM_MINOR_OVER` [P1] 2016-12-31 — Σ segmentos 8,035,000,000 vs receita 7,499,000,000 = 1.071x — eliminações/impostos não subtraídos
- `SEG_AXIS_MIX_GEO` [P0] 2016-12-31 — eixo GEO [West] empilhado com eixo PRODUCT [Atlantic Gulf, Northeast G And P] — soma 1.071x
- `SEG_GRAND_TOTAL_VALUE` [P1] 2017-03-31 — 'Williams Partners' = 1,983,000,000 = a receita total — é o total, não um segmento

Outras: L, PEG, J, EQT, DE, ARES, EOG, FANG, WAB, NEE, PFE, GEN, NRG, CARR, ORCL …

### `LABEL_CHURN` — 80 empresas · causa: clean_segment_name sem unescape/acrónimos — build_segment_map.py:48-61

Exemplo de maior impacto: **MDLZ** (mediana r=1.0, MAD=0.0, 0 achados P0)

- `SEG_LABEL_HTML_ENTITY` [P1] 2016-03-31 — 'Cheese &amp; Grocery' tem entidade HTML literal — falta html.unescape()
- `SEG_LABEL_NONPRINTING` [P1] 2016-03-31 — 'Cheese &amp; Grocery' contém caractere invisível — fragmenta a série sem se ver
- `SEG_LABEL_HTML_ENTITY` [P1] 2016-03-31 — 'Gum &amp; Candy' tem entidade HTML literal — falta html.unescape()
- `SEG_LABEL_NONPRINTING` [P1] 2016-03-31 — 'Gum &amp; Candy' contém caractere invisível — fragmenta a série sem se ver
- `SEG_LABEL_HTML_ENTITY` [P1] 2016-06-30 — 'Cheese &amp; Grocery' tem entidade HTML literal — falta html.unescape()
- `SEG_LABEL_NONPRINTING` [P1] 2016-06-30 — 'Cheese &amp; Grocery' contém caractere invisível — fragmenta a série sem se ver

Outras: INTC, SBUX, DOV, IQV, DOW, IEX, ITW, OMC, PG, TDG, BKR, VST, OKE, TGT, ETR …

## 6. Mapa de causas-raiz

| Regra | Causa | Local |
|---|---|---|
| `SEG_Q4_CLONE_OF_ANNUAL` | UPDATE omite periodType | `scripts/ingest_segments.py:165-169` |
| `SEG_Q4_CARRIES_ANNUAL` | duração trimestre/ano no mesmo balde | `scripts/ingest_segments.py:72-78` |
| `SEG_QSUM_MISMATCH` | factos casados só pela data de fim | `scripts/ingest_segments.py:96-104` |
| `SEG_Q_GT_ANNUAL` | idem — sem discriminação de duração | `scripts/ingest_segments.py:96-104` |
| `SEG_AXIS_MIX_GEO` | cego ao eixo: member.text sem @dimension | `scripts/ingest_segments.py:60-66` |
| `SEG_AXIS_MIX_TIMING` | cego ao eixo ASC-606 | `scripts/ingest_segments.py:60-66` |
| `SEG_AXIS_MIX_CUSTOMER` | cego ao eixo de cliente | `scripts/ingest_segments.py:60-66` |
| `SEG_SUM_MAJOR_OVER` | eixos empilhados / rollup | `scripts/ingest_segments.py:60-66` |
| `SEG_SUM_AXIS_DOUBLE` | 2 eixos empilhados | `scripts/ingest_segments.py:60-66` |
| `SEG_SUM_AXIS_TRIPLE` | 3 eixos empilhados | `scripts/ingest_segments.py:60-66` |
| `SEG_SUM_EXPLOSIVE` | múltiplos eixos + totais | `scripts/ingest_segments.py:60-66` |
| `SEG_SUM_SEVERE_UNDER` | 5 tags hardcoded, faltam juros/prémios | `scripts/ingest_segments.py:89-95` |
| `SEG_SUM_UNDER` | cobertura de tags insuficiente | `scripts/ingest_segments.py:89-95` |
| `SEG_SUM_MINOR_OVER` | eliminações/excise não subtraídos (decisão de produto) | `DATA_DISCREPANCIES.md` |
| `SEG_TOTAL_LABEL` | .replace('Segment','') mutila OperatingSegmentsMember | `scripts/build_segment_map.py:48-61` |
| `SEG_GRAND_TOTAL_VALUE` | membro de consolidação tratado como segmento | `scripts/build_segment_map.py:104-111` |
| `SEG_PARENT_ROLLUP` | sem hierarquia: pai e filhos no mesmo nível | `prisma/schema.prisma:98` |
| `SEG_LABEL_CAMEL_ARTIFACT` | splitter camelCase por caractere, sem acrónimos | `scripts/build_segment_map.py:52-59` |
| `SEG_LABEL_HTML_ENTITY` | falta html.unescape() | `scripts/build_segment_map.py:48-51` |
| `SEG_LABEL_XBRL_RESIDUE` | stripping de sufixos incompleto | `scripts/build_segment_map.py:48-51` |
| `SEG_LABEL_NON_REVENUE` | filas adjacentes da tabela raspadas como receita | `scripts/ingest_segments.py:96-104` |
| `SEG_LABEL_COLLISION_SAME_ROW` | mapa estático sem registo canónico de rótulos | `scripts/segment_targets.py` |
| `SEG_LABEL_COLLISION_DISJOINT` | idem — rótulos mudam entre filings | `scripts/segment_targets.py` |
| `SEG_AXIS_SWITCH` | mapa gerado 2026-07-03, nunca regenerado | `scripts/segment_targets.py` |
| `SEG_SERIES_HOLE` | eixo instável entre filings | `scripts/segment_targets.py` |
| `SEG_VALUE_UNIT_SUSPECT` | unitRef/decimals/scale nunca lidos | `scripts/ingest_segments.py:96-104` |
| `SEG_VALUE_EXCEEDS_REVENUE` | sem sanity bound na extração | `scripts/ingest_segments.py:96-104` |
| `SEG_MISSING_PERIOD` | filings[:10] → ~2,5 anos, sem backfill | `scripts/ingest_segments.py:136` |
| `SEG_STALE` | zero cobertura de cron | `.github/workflows/` |
| `SEG_MISSING_ALL` | except Exception: preserved = {} apaga em silêncio | `scripts/ingest_fundamentals.py:2176-2178` |

## 7. Lista de execução de pseudo-segmentos

Apagar estas chaves é a melhor vitória visível por unidade de esforço do backlog. **A lista está dividida de propósito** — as duas metades têm níveis de confiança MUITO diferentes e tratá-las como uma só causaria perda de dados reais.


### 7a. Identificadas pelo RÓTULO — deterministicamente seguras

O nome é literalmente um total/subtotal (`Operatings` = o `us-gaap:OperatingSegmentsMember` mutilado) ou uma linha de custo raspada de uma fila adjacente da tabela. Não há juízo de valor: podem ser apagadas em bloco.

| Chave | Ocorrências |
|---|---|
| `Operatings` | 54 |
| `Sales` | 33 |
| `Total revenue from contracts with customers` | 32 |
| `Total ancillary and other rental revenues` | 25 |
| `Total ICS Event-driven revenues` | 17 |
| `Net Sales` | 17 |
| `Total U.S. Information Solutions` | 15 |
| `Total GTO Recurring revenues` | 14 |
| `Total Hardware` | 13 |
| `Cost of products sold (excluding amortization of intangible assets)` | 12 |
| `Cost of services provided (excluding amortization of intangible assets)` | 12 |
| `Gains (Losses) on Asset Dispositions, Net` | 11 |
| `Total investment banking` | 11 |
| `Gains (Losses) on Mark-to-Market Commodity Derivative Contracts` | 10 |
| `Total HBV/HDV` | 10 |
| `Total HCV` | 10 |
| `Subtotal securities commissions` | 10 |
| `Total equipment rentals` | 10 |
| `Total ICS Event-driven fee revenues` | 8 |
| `Total Workforce Solutions` | 7 |
| `Total account and service fees` | 7 |
| `Total Sleep and Respiratory Care` | 7 |
| `Subtotal: Biosimilars` | 6 |
| `Total transaction revenue` | 6 |
| `Professional services cost of revenue` | 6 |
| `Subscription cost of revenue` | 6 |
| `Total Online Ecosystem` | 6 |
| `Total GTO Recurring fee revenues` | 5 |
| `Total equipment revenue` | 5 |
| `Total Desktop Ecosystem` | 5 |
| `Net sales` | 5 |
| `Total International` | 4 |
| `Gains On Books Of Business Sales` | 3 |
| `Regulatory fees cost of revenues` | 3 |
| `Total Oral, Personal and Home Care` | 3 |
| `Total Oncology` | 3 |
| `Total other revenues` | 3 |
| `Total Sleep and Breathing Health` | 3 |
| `Cost of product` | 3 |
| `Cost of software and rentals` | 3 |
| `Reportable` | 3 |
| `Cost of other revenue` | 2 |
| `Total ICS Recurring fee revenues` | 2 |
| `Total on-highway` | 2 |
| `Aggregate Revenues` | 2 |

### 7b. Identificadas só pelo VALOR — exigem verificação individual

O valor iguala a receita total, mas o RÓTULO é um nome de negócio plausível. Duas explicações possíveis, indistinguíveis sem o filing: (i) é um total de dimensão mal ingerido, ou (ii) é um segmento genuinamente dominante que representa ~100% da receita — o caso de `Southern California Edison Company`, que É praticamente toda a receita da EIX. **Apagar esta metade em bloco destruiria dados legítimos.** Verificar contra o footnote antes de tocar em cada uma.

| Chave | Ocorrências |
|---|---|
| `Trade` | 19 |
| `Income from rentals` | 12 |
| `Seniors Housing Operating` | 11 |
| `Southern California Edison Company` | 10 |
| `Transferred Over Time` | 10 |
| `Electric and Transmission Service` | 7 |
| `Sales and other operating revenue` | 7 |
| `Subscription and service revenue` | 5 |
| `Williams Partners` | 5 |
| `Upstream` | 4 |
| `Modules` | 4 |
| `Advertising` | 3 |
| `Food and Beverage` | 3 |
| `Dollar Tree` | 3 |
| `Product revenues, net` | 3 |
| `Software Platform Revenue` | 2 |
| `Senior Housing Operating Portfolio` | 2 |
| `Marketplace` | 2 |
| `EQT Production` | 2 |
| `Electricity, US Regulated` | 2 |
| `External Net Sales` | 2 |
| `Merchant Solutions` | 2 |
| `Product` | 2 |
| `Resident fees and services` | 2 |
| `Service` | 1 |
| `Food and beverage revenue` | 1 |
| `Managed Care` | 1 |
| `Mechanical Services` | 1 |
| `Modules segment` | 1 |
| `Carbonated Soft Drinks CS Ds` | 1 |
| `Smokeable Products` | 1 |
| `Climate` | 1 |

## 8. Limitações declaradas

- **8** linhas com chaves demais para busca exaustiva de subconjunto: cobertura dessas linhas NÃO é exaustiva (listadas no CSV como `SEG_SUBSET_SEARCH_TRUNCATED`).
- Taxa de ambiguidade do subset-sum: **41.0%** (410 ambíguos / 590 únicos) — métrica de autoqualidade do harness.
- O JSONB **não** preserva ordem nem chaves duplicadas: dois rótulos que o Postgres considera iguais já colapsaram na escrita, e o harness não os consegue detetar. A cobertura de colisões é, por isso, um limite inferior.
- A classificação de eixo é heurística de léxico. O eixo é um atributo LITERAL no XML de origem (`explicitMember@dimension`) que o `ingest_segments.py:66` deita fora; a fase 2 (SEC DERA) substitui a heurística por ground truth.
