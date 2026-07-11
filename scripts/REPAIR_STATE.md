# Estado da Reparação de Fundamentais — handoff (2026-07-11)

> Sessão pausada a pedido do Tiago (créditos). **A BD local NUNCA foi alterada**
> — todo o trabalho até agora foi lógica de extração + dry-runs sem escritas.
> Plano completo: `~/.claude/plans/prompt-de-contexto-e-zippy-puppy.md`.

## Onde estamos (branch `feat/fundamentals-repair`, SEM push)

| Fase | Estado |
|---|---|
| P0 backup + baselines | ✓ `scratch/backup_pre_repair_20260711_2203.dump` (restaurável); baseline = 6812 períodos/293 empresas |
| P1 cache EDGAR + guard localhost | ✓ commit `c6b372a` |
| P2 motor de evidência (explain_holes) | ✓ commit `ef38a04`; outputs em `scripts/out/` |
| P3 correções de extração | ✓ commits `513bddb`+`ef38a04` — goldens verificados em dry-run |
| P4 tooling (diff + validador) | ✓ escritos e compilados (este commit) — **ainda não exercitados** |
| P5 dry-run 527 + revisão diff | ⏳ POR FAZER |
| P6 re-ingest live local | ⏳ POR FAZER |
| P7 hardening frontend | ⏳ POR FAZER |
| P8 auditoria final + runbook Supabase | ⏳ POR FAZER |

## Goldens já confirmados em dry-run (sem escrever na BD)

AAPL Q4'19 DPS 0.1925 / Q4'18 0.1825 (paradoxo da Apple resolvido — bases de
split mistas na síntese Q4) · NVO $40.45B (era 290B DKK cru) · RACE $6.94B ·
JPM totalDebt $401B (era $52.9B), cash $469.3B, EBITDA/grossProfit NULL
estrutural · WDAY FY2020 EPS −2.12 / 224M shares · AZN $54.07B / 1.55B shares ·
AEP capex $7.63B (era $0.4B parcial) · ACGL totalDebt NULL honesto + DPS $5.00
(dividendo especial real de Dez 2024) · BTI $34.5B / TTE $201B / DEO / ERIC
ressuscitadas de 0 rows (bug de namespace) com FX GBP/SEK correto.

## Sequência exata para retomar (P5 em diante)

```bash
cd ~/Documents/antigravity/blissful-rutherford/bullquant

# 0. SEMPRE primeiro — sentinela contra edições concorrentes do IDE:
python3 scripts/check_repair_integrity.py       # tem de dar 17/17 ✓

# 1. Baseline do validador (pré-reparação, contra a BD atual):
python3 scripts/validate_fundamentals.py --baseline

# 2. Dry-run completo (527 empresas; cache EDGAR quente → ~15-30 min):
python3 scripts/ingest_fundamentals.py --dry-run scripts/out/dryrun_full.json

# 3. Diff + validação do dump (gates humanos):
python3 scripts/diff_reingest.py scripts/out/dryrun_full.json \
    --report scripts/out/diff_report.md --csv scripts/out/diff_major.csv
python3 scripts/validate_fundamentals.py --dump scripts/out/dryrun_full.json
# Rever diff_report.md: REGRESSED fora das transições de política ≈ 0;
# CHANGED_MAJOR das europeias explicado por FX; transições DPS/R&D coerentes.

# 4. Re-ingest live por batches (piloto → Financials/RealEstate → EU → resto):
python3 scripts/ingest_fundamentals.py --tickers AAPL,MSFT,JPM,ACGL,PLD,NEE,WDAY,WBD,NVO,RACE
python3 scripts/validate_fundamentals.py --tickers AAPL,MSFT,JPM,ACGL,PLD,NEE,WDAY,WBD,NVO,RACE
# ... batches seguintes (gerar listas por setor da BD), depois:
python3 scripts/adjust_splits.py
python3 scripts/validate_fundamentals.py

# 5. Auditoria final + frontend (P7/P8 — ver plano)
```

## Por fazer em P7/P8 (detalhe no plano)

- **P7 frontend** (`components/stock/`): TTM null-aware em
  `FinancialsEngine.tsx:93-146` (copiar semântica de `StockSnapshot.tsx:101-106`),
  guards de divisão por revenue, `Number.isFinite` em
  `DecisionChart.tsx` formatters + CAGR, strings PT hardcoded → i18n
  (`:202,307` + tooltip REIT), `calcCAGR` guard `end<=0`.
- **P8**: `null_whitelist.json` (razões: SECTOR_NO_COGS, SECTOR_NO_EBITDA_BANK,
  NON_PAYER_VERIFIED, NO_RND_LINE_VERIFIED, SEMIANNUAL_FILER, PERIOD_NOT_FILED,
  BANK_DEBT_NOT_TAGGED, NO_XBRL_FACTS[FDXF], PRE_LISTING) + audit
  whitelist-aware → **0 buracos inexplicados**; runbook Supabase
  (`RUNBOOK_supabase_apply.md`): backup prod, verificar `revenueSegments`/
  `businessKpis` não-nulos ANTES do merge (re-ingest limpa-os; local=0, prod
  pode ter), `deduce_q4.py`/`auto_heal_xbrl_tags.py`/`rollback_false_heals.py`
  marcar DO-NOT-RUN.

## ⚠️ Avisos críticos

1. **NÃO fazer push** deste branch até o Tiago aprovar a fase Supabase — o
   cron de domingo 03h UTC aplica origin/main à produção.
2. **Agente do IDE Antigravity edita estes ficheiros em paralelo** — já
   removeu `dividendPerShare` de SUBTRACTIVE e inseriu um tag num bucket
   errado. Pausar o agente do Antigravity durante o trabalho; correr SEMPRE
   `check_repair_integrity.py` antes de cada fase e rever `git diff` antes de
   cada commit.
3. Rollback de emergência da BD local:
   `/opt/homebrew/opt/postgresql@17/bin/pg_restore` do dump de P0 (pg_dump do
   PATH é v14 e falha contra o servidor v17).
4. DEO: revenue extraído é sales BRUTO de excise (~$28B vs ~$20B net) — IFRS
   sem tag de excise mapeada; anotar no relatório final / follow-up.
5. ACGL-class (payer recente): períodos pré-primeiro-dividendo ficam NULL em
   vez de 0 — refinamento possível (first-dividend-year na evidência),
   não-bloqueante.
