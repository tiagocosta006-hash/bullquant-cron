# Estado — qualidade de `revenueSegments`

> Estilo e propósito iguais ao `REPAIR_STATE.md`: registo vivo do que se sabe, do
> que está feito, e do que NÃO se deve fazer sem ler primeiro.

## Onde vive o dado

Não existe tabela de segmentos. É um **blob JSONB plano** em
`fundamentals."revenueSegments"` ([prisma/schema.prisma:98](../prisma/schema.prisma#L98)),
forma `{"Nome": número}`. **Sem coluna de eixo, sem hierarquia, sem unidade, sem
moeda, sem proveniência.** Valores em float64, enquanto todos os campos monetários
irmãos são `Decimal(20,4)`.

## Quem escreve, e quando

| Pipeline | Quando corre | Alvo |
|---|---|---|
| `ingest_segments.py` | **manual, sem cron nenhum** | `.env.dev` → localhost |
| `ingest_fundamentals.py` | diário 03:00 UTC | `secrets.DIRECT_URL` |
| `sync_segments_to_prod.ts` | manual, exige `--apply` | prod |
| `validate_segments.py` | domingo 06:00 UTC (CI) | **só SELECT** |

⚠️ **O `ingest_fundamentals.py` faz `DELETE` + reinsert por empresa.** Os segmentos
só sobrevivem por causa do bloco de preservação em
[ingest_fundamentals.py:2158-2205](ingest_fundamentals.py#L2158-L2205), ancorado em
`(periodType, periodEnd::date)`. Esse bloco tem um
`except Exception: preserved = {}` ([:2176-2178](ingest_fundamentals.py#L2176-L2178))
que, em caso de qualquer falha no SELECT, **apaga os segmentos dessa empresa em
silêncio**. Se as contagens caírem entre execuções do validador, suspeitar disto
ANTES de suspeitar do harness.

## Estado medido (2026-08-03, localhost)

- 529 empresas ativas · 14 626 linhas com segmentos · 63 727 pares chave/valor
- **85,52%** das linhas reconciliam com o `revenue` da própria linha (±2%)
- **SDQI 87,19** (R=85,52 S=94,27 L=96,36 C=82,87 V=70,05) · ponderado por
  impacto **53,32** — a diferença entre os dois mede quanto do defeito está
  concentrado nas empresas que alguém realmente abre
- Coortes: CLEAN 261 · NO_COVERAGE 95 · LABEL_CHURN 80 · AXIS_UNSTABLE 41 ·
  ELIMINATION_GROSS 29 · Q4_CONTAMINATED 11 · TOTAL_ROW_INJECTED 6 ·
  BANK_PARTIAL 4 · AXIS_STACKED 1 · ERRATIC_EXTRACTION 1

Detalhe completo: [docs/audit/segments-data-quality-2026-08.md](../docs/audit/segments-data-quality-2026-08.md)
· CSV por achado: `scripts/out/segment_findings.csv`
· folha de triagem: `scripts/out/segment_company_profile.csv`

## Os três alvos, e qual é a produção viva

Verificado por contagem read-only em 2026-08-03:

| Rótulo no `.env` | Host | Fundamentais | Com segmentos | `max(updatedAt)` |
|---|---|---|---|---|
| `# REMOTE (Supabase)` | aws-0-**eu-west-1** | 24 723 | **0** | 2026-07-26 |
| `# LOCAL` ← **ativo** | localhost | 25 106 | 14 626 | 2026-08-02 19:34 |
| `# REMOTE (Supabase New)` | aws-1-**eu-central-2** | 25 446 | 12 781 | 2026-08-02 06:18 |

**A produção viva é a `eu-central-2`** — é a única que está a ser escrita, e o
`updatedAt` das 06:18 encaixa na janela das crons (03:00/07:00/08:00 UTC). A
`eu-west-1` está abandonada: zero segmentos e parada há mais de uma semana.
O `secrets.DIRECT_URL` do GitHub não é inspecionável daqui, mas o harness imprime
o host na primeira linha e a baseline é ancorada nele — basta ver o log da
primeira execução do CI.

### O fosso local → produção é de COBERTURA, não de corrupção

Comparação ticker a ticker: a produção é um subconjunto **estrito** do local.

- 65 empresas têm segmentos em local e **não** em produção (`ACN`, `AON`, `BKR`,
  `CCI`, `CME`, `COF`, `CSX`, `DHR`, …) — em produção o utilizador não vê gráfico
  nenhum para elas
- **zero** empresas com segmentos em produção e não em local
- **zero** empresas com menos linhas em produção entre as partilhadas

Isto descarta atrito em **larga escala** — nenhuma empresa inteira perdeu os seus
segmentos em produção. O fosso são 65 empresas que nunca foram sincronizadas.

### ⚠️ MAS há sinal de atrito a baixo ritmo — a vigiar

Durante o trabalho de 2026-08-03, a produção foi observada duas vezes com ~1 h de
intervalo, e a cron correu no meio:

| | 13:00 (antes) | 14:20 (depois da cron das 07:00 UTC) |
|---|---|---|
| Fundamentais | 25 446 | 25 456 (**+10**) |
| Com segmentos | 12 781 | 12 778 (**−3**) |

As fundamentais subiram e os segmentos **desceram 3**. Não foi o validador (só faz
`SELECT`). Causas possíveis, indistinguíveis por contagem:

1. o `except Exception: preserved = {}` ([ingest_fundamentals.py:2176-2178](ingest_fundamentals.py#L2176-L2178))
   a engolir uma falha e a deixar o wipe apagar os segmentos dessa empresa;
2. o `periodEnd` de uma linha a mudar na re-ingestão, fazendo o `_reattach`
   (ancorado em `(periodType, periodEnd::date)`) não encontrar destino;
3. reafirmação legítima que fundiu/removeu períodos.

**Não está provado que seja um bug** — mas 3 linhas em 12 781 por noite são ~0,02%
por dia, e a hipótese (1) é a única que constitui perda silenciosa de dados. A
forma de resolver isto é observacional e já está montada: a baseline de produção
foi gravada em 2026-08-03 (7 790 achados). Se numa execução futura aparecerem
`SEG_MISSING_ALL`/`SEG_MISSING_PERIOD` **novos** em produção, é a hipótese (1) ou
(2) a confirmar-se — e o `resolvidas vs baseline` do gate mostra exatamente quais
linhas desapareceram.

### ⚠️ O `sync_segments_to_prod.ts` ABORTA no estado atual — e é esperado

O script lê o local de `.env.dev` e a produção de `.env`, e exige
([:29-34](sync_segments_to_prod.ts#L29-L34)):

- `.env.dev` DIRECT_URL **tem** de ser localhost → ✅ é
- `.env` DIRECT_URL **não pode** ser localhost → ❌ **é localhost**

Logo, correr o script hoje dá *"ERRO: .env DIRECT_URL é localhost — abortado por
segurança"*. **Não está avariado.** O `.env` está deliberadamente apontado ao
localhost para trabalho de desenvolvimento (decisão do Tiago, 2026-08-03) e será
reapontado à Supabase antes de qualquer deploy. Enquanto assim estiver, não há
caminho para empurrar segmentos para produção — e o fosso das 65 empresas não
fecha. Quem precisar de sincronizar tem de reapontar o `.env` à `eu-central-2`
primeiro, com a consciência de que isso muda o alvo de **todos** os scripts que
leem o `.env`, não só o dos segmentos.

### Diagnóstico corrido nos DOIS alvos (2026-08-03)

| Métrica | localhost | produção (eu-central-2) |
|---|---|---|
| Linhas com segmentos | 14 626 | 12 778 |
| Pares chave/valor | 63 727 | 56 126 |
| Achados (P0) | 8 676 (2 110) | 7 790 (1 897) |
| **SDQI** | **87,13** | **85,61** |
| R — reconciliação | 85,52% | **86,03%** |
| V — cobertura | 70,05% | **59,34%** |
| `NO_COVERAGE` | 95 | **160** |

Relatórios: [local](../docs/audit/segments-data-quality-2026-08.md) ·
[produção](../docs/audit/segments-data-quality-2026-08-PROD.md)

Duas leituras contra-intuitivas, ambas explicadas:

1. **A reconciliação é ligeiramente MELHOR em produção** (86,03% vs 85,52%). Não é
   sorte: as 65 empresas que nunca foram sincronizadas incluem alguns dos piores
   casos. O local tem mais dados e proporcionalmente um pouco pior.
2. **A cobertura é muito pior** (59,34% vs 70,05%) e o `NO_COVERAGE` sobe
   exatamente +65. É o fosso da sincronização, não um defeito novo.

### ⚠️ Classe de defeito que só existe em produção: receita de prod × segmentos de local

O `sync_segments_to_prod.ts` empurra **só** `revenueSegments` e `businessKpis` — a
produção "continua dona dos valores financeiros normais" ([:7-10](sync_segments_to_prod.ts#L7-L10)).
Logo a produção emparelha segmentos extraídos em LOCAL com a receita da PRODUÇÃO.

Medido nas 12 778 linhas partilhadas: **85 (0,7%) têm `revenue` diferente** entre
as duas BDs. A maioria é arredondamento ao milhão (ADBE, BDX ~1,000x), mas há
divergência sistemática real:

| Linha | revenue local | revenue prod | prod/local |
|---|---|---|---|
| `CAT` QUARTERLY 2018-03-31 … 2020-06-30 | ~10-14 B | ~9-13 B | **0,93-0,95x** consistente |
| `BDX` QUARTERLY 2020-09-30 | 4 520 M | 3 741 M | **0,83x** |

Consequência: uma linha pode reconciliar em local e **falhar** em produção (ou o
inverso) sem que nenhuma das BDs esteja isoladamente errada — é a combinação que
está. É por isto que o `SEG_PROD_DRIFT` da fase 3 importa, e por isto que o
diagnóstico tem de ser corrido nos dois alvos e não só num.

## Snapshot da fase 0

`scripts/out/backups/fundamentals_20260803.dump` (4,2 MB, `pg_dump -Fc -t fundamentals`,
feito com o binário da v17 — o `pg_dump` 14 do PATH recusa o servidor 17.10).
`sha256(segment_targets.py)` na altura: `77c95119241932ef…`

## NÃO fazer sem ler

1. **Não regenerar o `segment_targets.py`** sem tratar isso como uma nova ÉPOCA de
   baseline. O ficheiro (5 888 linhas, gerado 2026-07-03, nunca desde então) é a
   única coisa que dá nome aos segmentos. Regenerá-lo reescreve os 4 021 rótulos e
   invalida toda a baseline, todos os clusters de colisão e todos os fixtures do
   golden. O sha256 está fixado no cabeçalho da baseline exatamente para isto ser
   detetado.
2. **Não comparar baselines entre hosts.** O `validate_segments.py` recusa-o de
   propósito (`segment_baseline.<host>.json`). O CI corre contra
   `secrets.DIRECT_URL`, que NÃO é o localhost de desenvolvimento.
3. **Não fazer backfill de cobertura antes de o extrator estar correto** — é
   fabricar lixo a 4× a escala atual.
4. **Não julgar a remediação por "o gráfico parece melhor".** Corrigir linhas faz
   o guard do [StockAnalyst.tsx:174-195](../components/stock/StockAnalyst.tsx#L174-L195)
   deixar de suprimir, logo APARECEM gráficos que estavam escondidos. Isso é
   sucesso a parecer regressão. Julgar pelo SDQI.

## Superfícies expostas (importa para a triagem)

| Superfície | Tem guard? |
|---|---|
| `components/stock/StockAnalyst.tsx:174-195` | **Sim** — esconde se soma > 1,1× receita em ≥metade dos anos |
| `lib/ai/context.ts:83-93` | **NÃO** — injeta no prompt do Gemini rotulado `verificado` |
| `components/explore/BusinessProfileSheet.tsx:39-50` | **NÃO** |
| `components/stock/FinancialsEngine.tsx:165-174` | **NÃO** — soma dicts trimestrais em TTM |

É por isso que uma empresa com o gráfico suprimido ainda pontua na fórmula de
impacto: está escondida do gráfico, não da IA.

## Hipóteses TESTADAS E REJEITADAS

Registadas para não serem re-propostas:

- **Valor-sentinela fabricado** (`SEG_VALUE_SENTINEL`). Hipótese: um valor exato
  repetido em ≥10 empresas não relacionadas é fabricado — motivada pelos 303
  valores negativos exatamente iguais a −1 000 000. **Rejeitada**: a distribuição
  de "nº de empresas por valor" é lisa, sem pico (24 885 valores em 1 empresa,
  2 803 em 2, … 85 em 10), e os mais partilhados são 3 000 000 (43 empresas),
  5 000 000 (42), 1 000 000 (41). Causa trivial: os emitentes reportam em milhões
  inteiros, logo valores pequenos colidem por efeito de aniversário. Os −1 000 000
  são arredondamento de contra-receita pequena, não fabricação. Implementar a
  regra dava centenas de falsos positivos P0 com aparência de rigor.
- **Benford / primeiro dígito.** Precisa de milhares de valores de um processo
  gerador único; aqui os valores são figuras da SEC já auditadas, agrupadas por
  empresa, e o modo de falha é *selecionar o facto errado*, nunca *inventar* um
  número. Produz um qui-quadrado plausível e zero achados acionáveis.
- **`SEG_PARENT_ROLLUP` por linha, com unicidade do subconjunto.** Dava 3 145
  achados P0, quase todos coincidências (AAPL 'Services' = Mac + iPad; AAPL
  'Americas' = Europe + Japan + Rest of Asia Pacific, que são todos PARES no eixo
  geográfico; ABBV 'Lupron' = Duodopa + Kaletra). Substituído por deteção ao nível
  da EMPRESA exigindo persistência em ≥3 períodos e ≥50% das aparições do pai.
- **Exigir subconjunto ÚNICO para o rollup.** O 'Total Hardware' do CDW fecha
  EXATAMENTE com 6 filhos, mas com 17 chaves há sempre outra combinação na janela
  → 'ambiguous' → a regra não disparava no caso mais óbvio do corpus. A unicidade
  dentro da linha é o critério errado; a persistência entre períodos é o certo.
- **k-means para atribuir coortes.** IDs de cluster instáveis entre execuções
  matam a comparabilidade semana a semana, e "coorte 4" não é acionável. Usado
  apenas como AUDITOR da taxonomia via silhouette — e nesse papel funcionou:
  revelou que `nAxisSwitches >= 1` era uma fronteira má (204 empresas, silhouette
  −0,07); trocada por `axisSwitchRate >= 0,30`, ficou em 41 empresas com
  silhouette +0,33.

## Próximo passo (fase 2)

SEC DERA `financial-statement-data-sets`: o `num.txt` traz `segments` (o par
eixo=membro), `qtrs` (1=trimestre, 4=ano) e `uom` — exatamente os três campos que
o [ingest_segments.py:60-66](ingest_segments.py#L60-L66) deita fora. ~24 ZIPs
(~1 GB) em cache sob `scripts/.cache/dera/`. Transforma a heurística de léxico em
**diff contra ground truth**. O companyfacts não serve: descarta factos
dimensionados ([ingest_fundamentals.py:1126](ingest_fundamentals.py#L1126)).
