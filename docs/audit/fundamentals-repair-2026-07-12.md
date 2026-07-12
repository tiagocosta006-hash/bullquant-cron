# Reparação da BD de Fundamentais — Relatório Final (2026-07-12)

> Executada por Claude (Fable 5) sob direção do Tiago, branch
> `feat/fundamentals-repair`, **BD local apenas** (localhost/bullquant).
> Aplicação à Supabase: ver `scripts/RUNBOOK_supabase_apply.md` — exige
> aprovação explícita. **Nada foi pushed.**

## Resultado em números

| métrica | antes | depois |
|---|---|---|
| Violações de identidades contabilísticas | 2.174 | 328 (todas pré-existentes na baseline; **0 novas**; −85%) |
| Buracos "6812/293" da auditoria original | 6.812 períodos / 293 empresas | **101 períodos / 40 empresas** (119 células = 0,03%), TODOS com evidência anexada em `scripts/out/hole_explanations.json` — backlog acionável |
| Células estruturais classificadas | 0 | 17.974 verificadas POR-CÉLULA contra as filings + 188 por regras setoriais |
| Empresas com CIK e ZERO rows | 5 (BTI, TTE, DEO, ERIC, FDXF) | 1 (FDXF — não tem XBRL de todo; whitelisted) |
| DPS/R&D forçados a 0.0 (máscara) | ~18.000 células | 0 — política evidência-de-ausência por ano-de-facto |
| Moedas cruas na BD (NVO em DKK, GSK em GBP) | sim | 0 — FX BCE com abort-on-fail |

Goldens na BD final: AAPL Q4'19 DPS 0.1925 · ABBV Q4'24 1.64 (declarações
instant mapeadas) · JPM $401.4B/$469.3B · NVO $40.45B · DEO $20.27B net ·
Dominion capex $12.43B · WDAY −2.12 · GOOG≡GOOGL · BTI $32.4B.

## Causas raiz encontradas e corrigidas

1. **Paradoxo da Apple** (Q4 DPS): 10-Ks pós-split retaggam o DPS anual
   ajustado, os trimestres ficam nos 10-Qs originais pré-split → a síntese
   Q4 = FY−ΣQ subtraía bases mistas → negativo → mascarado com 0.0.
   Fix: `derive_q4_dps` testa fatores de split e devolve o Q4 na base do FY.
2. **Força-0.0 cega em DPS/R&D**: substituída por evidência-de-ausência por
   ANO-de-facto (common-only): 0.0 só em anos sem QUALQUER facto de dividendo
   a common (META pré-2024 ✓, ACGL fora do especial de Dez-2024 ✓); NULL nos
   gaps de anos pagadores.
3. **NVO em DKK cru / GSK em GBP cru**: DKK/SEK/NOK fora da lista de moedas +
   falha de FX silenciosamente não-fatal. Fix: moedas adicionadas; falha de
   FX **aborta** a escrita da empresa; FX migrado de yfinance → Frankfurter/BCE
   (compliance com o CLAUDE.md).
4. **`NoncurrentLiabilities` como longTermDebt** (IFRS = TODOS os passivos
   não correntes): removido — sobrestimava a dívida das europeias (UL "32.7B").
5. **JPM-class**: bancos deixaram de taggar LT debt sem dimensões (~2014);
   total só-ST ($52.9B vs $463B) era 8× errado. Guards has_ltd_ever +
   CVNA-class (total direto < LTD = parcial) + composto bancário
   (FHLB+sub+other+LoC, nunca Deposits). JPM agora: $401.4B (leases-inclusive).
6. **Namespace BTI/DEO-class**: `us-gaap` residual de 1 tag escolhido sobre
   `ifrs-full` de 372 → empresas com ZERO rows. Fix: namespace por tamanho.
   BTI/TTE/DEO/ERIC ressuscitadas com histórico completo.
7. **Dual-unit per-share** (1.480 células): DPS taggado em "USD" e
   "USD/shares" com períodos exclusivos de cada unidade → concat de unidades.
8. **Dual-currency BCS-class**: USD-first global escolhia a unidade dual
   incompleta → moeda de reporte (por contagem de entradas) primeiro.
9. **Ordenação de tags de capex**: tags estreitos (Projects $202M) roubavam a
   prioridade a totais (Dominion ProceedsFromProductiveAssets $12.4B); CIP de
   utilities acima de ProductiveAssets (AEP $7.63B vs $0.4B).
10. **Excise IFRS (DEO)**: revenue bruto $27.9B vs net sales — corrigido por
    identidade (net = gp + cogs = $20.3B) quando os três estão taggados.
11. **EPS incoerente com NI** (HAL ×10⁶; LYV sinal trocado): identidade
    EPS×shares≈NI passa a vencer o EPS extraído incoerente (>50%/sinal).
12. **EBITDA/margem bruta de bancos**: eram fabricados (síntese/gp=revenue);
    agora NULL estrutural — a UI esconde os cards (isBank).

## Arquitetura de verificação (fica no repo)

- `scripts/explain_holes.py` — motor de evidência: classifica cada buraco
  contra o companyfacts com âmbito de demonstração (instant vs duration
  verificado estruturalmente, denylists); emite `structural_nulls.json`
  (whitelist POR-CÉLULA com prova) e tabelas de candidatos para revisão CFA.
- `scripts/validate_fundamentals.py` — 10 identidades contabilísticas, gate
  "zero violações novas" vs baseline; `validator_accepted.json` para eventos
  reais revistos (ganho RAI da BTI 2017, Chapter 11 da EXE, …).
- `scripts/diff_reingest.py` — dry-run vs BD com classes
  FILLED/REGRESSED/CHANGED e secções de política/FX.
- `scripts/audit_null_fundamentals.py` — whitelist-aware (regras +
  por-célula), check de empresas zero-rows, exit code para CI.
- `scripts/check_repair_integrity.py` — 19 invariantes do pipeline (~1s);
  nasceu porque o agente do IDE Antigravity editou os ficheiros em paralelo
  durante a reparação (2 mutações apanhadas).
- `--dry-run` no ingest: pipeline completo sem escritas.

## Decisões CFA registadas (racional no código)

Aceites ~40 tags com âmbito verificado; rejeitados e documentados: buybacks
como capex, capacidade de crédito como dívida, ativos de bancos
(LoansAndAdvances*) como dívida, AvailableForSale* (carteira) como dívida,
repos como term debt, ProForma, D&A com imparidades, componentes parciais
como totais. Regra de ouro mantida em todo o lado: **antes NULL que errado**.

## Residual conhecido (documentado, não bloqueia)

- Revenue de bancos IFRS (BCS/HSBC/UBS): composto interest+fees parcialmente
  mapeável — margens marcadas como aceites; melhoria em follow-up.
- SNY/NVS: "other revenues" fora do net sales (GP ~7% off — aceite).
- Splits ainda via yfinance (migração Polygon em follow-up; FX já é BCE).
- FDXF: sem XBRL (namespace ffd) — whitelisted NO_XBRL_FACTS.

## Frontend (Decision Engine)

TTM null-aware (fim dos 0 fabricados), margens só com revenue>0 (fim de
NaN%), tooltips preservam null (fim do $0.00 falso), CAGR com guard de
negativos, strings hardcoded → i18n (9 locales). Bancos já escondiam
FCF/EBITDA/GROSS via isBank.
