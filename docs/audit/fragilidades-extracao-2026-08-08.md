# Estudo de fragilidades da base de dados — 2026-08-08

Auditoria transversal ao pipeline de extração e aos dados resultantes, feita para
decidir o que pode ser corrigido com XBRL estruturado (edgartools + calculation
linkbase) e o que **não** pode. Medições contra localhost (25 638 linhas de
`fundamentals`, 559 empresas).

Conclusão em três linhas: existe **uma causa-raiz dominante** — a escolha de qual
conceito XBRL representa cada métrica é feita por listas ordenadas mantidas à mão,
e o XBRL de cada empresa já contém essa resposta de forma autoritária. Isso é
resolúvel. Mas há uma segunda família de problemas — zeros fabricados, validação
em falta, defeitos de schema — que **nenhuma ferramenta de extração resolve**,
porque são decisões de código erradas.

---

## 1. Causa-raiz dominante: seleção de conceito por lista ordenada

`scripts/ingest_fundamentals.py` mapeia **58 métricas a partir de 239 conceitos
XBRL**, em duas estruturas (`DURATION_TAGS` :94-343, `INSTANT_TAGS` :344-517).
A semântica é *first-hit wins* (`extract_all_metrics` :766-798): **a ordem da
lista É a lógica de negócio**.

Métricas com mais conceitos concorrentes (maior superfície de erro):
capex 26 · revenue 25 · costOfRevenue 13 · longTermDebt 11 · cash 9 · epsDiluted 9 · D&A 9.

O próprio código admite a fragilidade:
- `:213-215` — o CIP tem de vir ANTES de ProductiveAssets, senão a AEP fica com
  $0,4 mM em vez dos $7,6 mM reais de construção.
- `:223-226` — "⚠️ Ordem importa": na Dominion, "Projects" ($202 M) roubava o
  lugar a ProceedsFromProductiveAssets ($12,4 mM).
- `:237-243` — lista de conceitos "REJEITADOS (nunca adicionar)".

Só **uma** métrica (capex) tem teste que proteja a ordem
(`scripts/check_repair_integrity.py:46-48`). As outras 57 não têm nada.

### Prova de que o XBRL já tem a resposta

O calculation linkbase de cada filing declara a árvore de cálculo com pesos ±1.
Testado com edgartools 5.46:

```
NVDA — filhos de "Investing Activities":
   PaymentsToAcquireProductiveAssets                 peso=-1.0   ← o capex
   PaymentsToAcquireAvailableForSaleSecuritiesDebt   peso=-1.0   (investimentos)
   ProceedsFromSaleOfAvailableForSaleSecuritiesDebt  peso=+1.0   (entrada)

AEP — filhos de "Investing Activities":
   PaymentsForConstructionInProcess                  peso=-1.0
   PaymentsForNuclearFuel                            peso=-1.0
   PaymentsToAcquireProductiveAssets                 peso=-1.0
```

A AEP revela o ponto essencial: **não é um conceito, são três componentes reais**.
A lista ordenada escolhe um e descarta os outros. O linkbase torna-os visíveis, e
o sinal (+1/−1) separa entradas de saídas sem heurística.

### O mesmo erro, já apanhado uma vez

Ao escrever o extrator de segmentos cometi exatamente esta classe de erro:
procurar conceitos que *contivessem* "sales" apanhava
`PaymentsToAcquireAvailableForSale**S**ecurities` — compra de títulos, 309 mM,
tratada como receita. O `auto_heal_xbrl_tags.py:36` tem hoje o mesmo padrão:
`re.compile(r"(revenue|sales|turnover|...)")`.

---

## 2. Danos mensuráveis nos dados

### 2.1 Valores em falta (medido)

| Métrica | Anuais (5 161) | Trimestrais (20 477) |
|---|---|---|
| ebitda | 737 | 3 297 |
| totalDebt | 330 | 1 674 |
| capex | 166 | 996 |
| operatingCashFlow | 47 | 773 |
| revenue | 29 | 234 |

### 2.2 Identidades contabilísticas violadas (anuais)

| Teste | Violações |
|---|---|
| Ativo ≠ Passivo + Capital Próprio (>1%) | **534** |
| grossProfit ≠ revenue − COGS (>1%) | 69 |
| revenue negativa | 5 |
| margem bruta > 100% | 2 |
| FCF ≠ OCF − capex | 0 ✅ |

O caso das 534: auditoria anterior atribui 524 a falta do campo
`minorityInterest` e 10 a erro real. Confirmei a mecânica no KKR:

```
Assets                        410 144 072 000
Liabilities                   328 512 161 000
StockholdersEquity             30 902 561 000   ← só a parte do grupo
LiabilitiesAndStockholdersEquity  410 144 072 000  ← igual a Assets
```

`328,5 + 30,9 = 359,4 ≠ 410,1`. Faltam ~50,7 mM de interesses não-controlados.
O conceito correto é `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest`.
É **escolha de conceito**, não erro de dados da SEC — e o próprio filing publica
`LiabilitiesAndStockholdersEquity` como prova de fecho.

Nota de perigo no mesmo output: `AssetsFairValueDisclosure` (249 mM) e
`ReinsurerCollateralMinimumRequiredAssetsInTrust` (107 mM) apareceriam antes numa
procura ingénua por "Assets".

### 2.3 Zeros fabricados (o mais grave)

| Padrão | Linhas |
|---|---|
| `researchAndDevelopment = 0` | **9 077** |
| `dividendPerShare = 0` | 2 783 |
| capex = 0 com OCF ≠ 0 | **855** |
| totalDebt = 0 com juros > 0 | 240 |
| D&A nulo mas com ebitda preenchido | 10 802 |

Origem principal — `scripts/auto_heal_xbrl_tags.py:42-56`, verificado por leitura
direta:

```python
UPDATE fundamentals SET "dividendPerShare"      = 0.0 WHERE "dividendPerShare"      IS NULL
UPDATE fundamentals SET "researchAndDevelopment" = 0.0 WHERE "researchAndDevelopment" IS NULL
```

Sem filtro de setor, sem evidência, **em toda a tabela**. Destrói a distinção
entre "a empresa não faz I&D" e "não conseguimos extrair I&D".

> **CORREÇÃO (verificado depois de escrever isto).** A primeira versão deste
> estudo afirmava que os 9 077 zeros de I&D estavam "quase de certeza" errados.
> **Está errado.** O `auto_heal_xbrl_tags.py` **não corre em nenhum workflow** —
> é manual — e o `ingest_fundamentals.py` faz wipe+reinsert diário, pelo que os
> zeros atuais vêm da política de EVIDÊNCIA DE AUSÊNCIA do `build_row`, não deste
> atalho. Verificação: das 12 empresas de Saúde com I&D zero, 10 são seguradoras
> (UNH, ELV, CI, HUM, CNC), hospitais (HCA, UHS), laboratórios (DGX) e
> distribuidores (CAH) — **não reportam I&D e o zero está correto**. Só a JNJ
> (FY2021 e FY2022, 2 linhas) é um erro real.
>
> Conclusão revista: o `init_db()` é uma **arma carregada** que ainda não
> disparou — tem de sair do código, mas **não há 11 860 linhas para reverter**.
> Reverter em massa destruiria dados corretos.

Segunda origem — `ingest_fundamentals.py:1524-1549`: `capex = 0.0` para
Financials e Real Estate, seguido de `fcf = op_cf`. O FCF passa a ser um número
**inventado**, não um valor em falta.

Isto é pior do que um buraco: um NULL é visivelmente desconhecido; um zero
propaga-se para margens, FCF e valuation como se fosse facto.

---

## 3. Outras fragilidades estruturais

**Valores escritos à mão** — `MANUAL_CAPEX_OVERRIDES` :518-550: 29 valores
transcritos de 10-Ks (NVDA 2016-2021, 2023), sem verificação automática contra a
SEC. Alimentam `synthesize_q4`, logo um erro de transcrição propaga-se ao Q4.

**Exceções engolidas sem log** — :632, :650, :1697, :2172, :2271, :2286, :2296;
`adjust_splits.py:40`; `sync_scratch_to_db.py:23`. (O caso de :2200, que apagava
segmentos em silêncio, já foi corrigido nesta sessão.)

**Reescritas silenciosas de dados reportados** — :1305-1312 reescreve `revenue`
como `grossProfit + COGS`; :1316 força `grossProfit = revenue`; :1355 e :1259
substituem EPS/shares por `NI/shares` quando o rácio desvia. São números
inventados por cima de dados publicados.

**Limiares mágicos sem proveniência nem teste** — janelas de dias (350-380,
80-100, YTD 160-200/245-290), tolerância de excise 5%, "revenue ≥ 50% do maior
candidato", clustering de fim de ano fiscal ±25 dias, splits com folgas 0,7/1,3,
`derive_q4_dps` a testar 13 fatores e aceitar rácios 1,05-2,5.

**Dois algoritmos concorrentes para o Q4** — `synthesize_q4` (:1895-2000, deriva
24 campos por FY − Q1 − Q2 − Q3) e `scripts/deduce_q4.py`, que usa o **DPS do Q3
como proxy do Q4** (:24-27) e insere com `ON CONFLICT DO NOTHING`.

---

## 4. Buracos de validação

`validate_database.ts` corre no CI mas **não tem severidades nem exit-code — nunca
falha o build**. Só os gates de identidade de período e de segmentos são
bloqueantes.

Existem mas **não estão no CI**: `validate_fundamentals.py` (que testa exatamente
as identidades da secção 2.2 — GP_IDENTITY, FCF_IDENTITY, CAPEX_NEGATIVE,
MARGIN_BOUNDS), `validate_data.ts`, `check_repair_integrity.py` (19 invariantes),
`audit_null_fundamentals.py`.

**Zero validação de qualquer tipo**: `prices` (821 475 linhas), `companies`
(metadados/CIK/sector), `insider_transactions`, `earnings_events`,
`corporate_events`, caches de IA, e o campo **`filedAt`** — que é ficção em 68%
das linhas anuais em produção.

---

## 5. O que a ferramenta resolve — e o que não resolve

### Resolve (causa-raiz de concept selection)

| Problema | Mecanismo |
|---|---|
| Ordem das listas de 239 conceitos | calculation linkbase por empresa |
| capex parcial (AEP, Dominion) | componentes de Investing Activities com peso −1 |
| Equity sem interesses não-controlados (534 linhas) | identidade `Assets = LiabilitiesAndStockholdersEquity` |
| Bancos com métricas truncadas | conceito declarado, não adivinhado |
| `MANUAL_CAPEX_OVERRIDES` | extração real substitui transcrição |
| D&A em falta (10 802) | conceito no cash flow statement |

### NÃO resolve — são bugs de código ou de processo

| Problema | O que é preciso |
|---|---|
| Zeros globais de I&D/DPS (9 077 + 2 783) | **apagar** `init_db()` de `auto_heal_xbrl_tags.py` |
| capex = 0 → FCF fabricado (855) | trocar o fallback por NULL |
| `filedAt` ficcional (68% em prod) | corrigir a origem no ingestor |
| `@@unique` não protege anuais (`fiscalQuarter` NULL) | migração de schema |
| Sem histórico de migrações | processo Prisma |
| `prices` e 8 tabelas sem validação | escrever gates |
| `validate_database.ts` nunca falha o CI | dar-lhe exit-code |
| Dois algoritmos de Q4 | decidir um |

---

## 6. Ordem sugerida

### FEITO nesta sessão

1. ✅ **`init_db()` desativado** em `auto_heal_xbrl_tags.py` — deixa de poder
   escrever zeros globais. **Nenhum dado foi revertido**: a verificação mostrou
   que os zeros existentes são maioritariamente corretos (ver correção em §2.3).
2. ✅ **`validate_fundamentals.py` ligado ao CI como bloqueante**
   (`.github/workflows/validate-database.yml`). Baseline regenerada com as 847
   violações atuais (antiga guardada em `validator_baseline.pre20260808.json`);
   o gate passa a apanhar **regressões**. A baseline é a lista de trabalho e deve
   encolher, nunca crescer.

### A fazer

3. **Os ~97 capex = 0 em setores intensivos em capital** (39 Industrials,
   25 Utilities, 20 Materials, 7 Energy, 6 IT) — o fallback só cobre Financials e
   Real Estate, logo estes vêm de outro caminho e são quase de certeza falhas de
   extração. Investigar antes de tocar nos 758 de Financials/Real Estate, que são
   política deliberada.
4. **Extrator de fundamentals por calculation linkbase**, começando por um
   comparativo em dry-run (lista atual vs linkbase) para as 527 empresas, a ver
   onde divergem — sem escrever nada. É aqui que se atacam as 847 violações da
   baseline, com destaque para `GP_IDENTITY` (275), `DEBT_GE_LTD` (242) e
   `SHARES_QOQ_JUMP` (114 — na ANET os shares oscilam 80M→323M→80M, exatamente
   4×, sinal claro de mistura de conceito anual vs trimestral).
5. Campo `minorityInterest` + identidade de fecho do balanço (534 linhas).
6. `filedAt`, schema (`@@unique` com `fiscalQuarter` NULL), e gates para as
   tabelas sem validação nenhuma (`prices`, `companies`, e mais 7).

A regra que este estudo confirma: **verificar antes de corrigir**. A hipótese mais
alarmante (11 860 linhas de zeros falsos) não sobreviveu à verificação, e agir
sobre ela teria destruído dados corretos.
