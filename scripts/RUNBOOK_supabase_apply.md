# Runbook — Aplicar a reparação de fundamentais à Supabase (produção)

> **Pré-condição:** aprovação explícita do Tiago. Este runbook existe porque a
> fase local foi concluída e validada; NADA disto corre automaticamente.
> Branch: `feat/fundamentals-repair` (local, sem push até ao passo 4).

## O que muda em produção quando isto correr

- ~2.500+ buracos preenchidos com valores verificados (EDGAR + identidades)
- Zeros mascarados de DPS/R&D substituídos por valores reais ou NULL honesto
- Europeias convertidas a USD/BCE (NVO estava em DKK cru; GSK em GBP)
- Bancos: EBITDA/margem bruta deixam de ser inventados (NULL estrutural; UI esconde)
- JPM-class: totalDebt honesto ($401B via tag de leases-inclusive, não $52.9B)
- FX passa de yfinance (proibido pelo CLAUDE.md) para Frankfurter/BCE

## Passos

### 0. Verificações prévias (obrigatórias)

```bash
cd ~/Documents/antigravity/blissful-rutherford/bullquant
python3 scripts/check_repair_integrity.py            # 19/19 ✓ ou PARAR
git log --oneline -6                                  # confirmar commits da reparação
```

**⚠️ CRÍTICO — enriquecimentos que o re-ingest APAGA:** o pipeline é
DELETE-then-INSERT e `insert_fundamental` não escreve `revenueSegments` nem
`businessKpis`. Na BD local estavam a 0 rows; **em produção PODEM existir**
(pipelines Gemini/segments). Verificar ANTES:

```sql
SELECT count(*) FILTER (WHERE "revenueSegments" IS NOT NULL) AS segs,
       count(*) FILTER (WHERE "businessKpis"   IS NOT NULL) AS kpis
FROM fundamentals;
```

Se >0: exportar primeiro (`CREATE TABLE seg_backup AS SELECT id, "companyId",
"periodType", "fiscalYear", "fiscalQuarter", "revenueSegments", "businessKpis"
FROM fundamentals WHERE "revenueSegments" IS NOT NULL OR "businessKpis" IS NOT
NULL;`) e re-aplicar por UPDATE-join à chave natural após o re-ingest — ou
re-correr `ingest_segments.py`/pipeline KPIs.

### 1. Backup de produção

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_dump -Fc \
  -f scratch/backup_SUPABASE_$(date +%Y%m%d_%H%M).dump "<DIRECT_URL de produção>"
/opt/homebrew/opt/postgresql@17/bin/pg_restore --list scratch/backup_SUPABASE_*.dump | head
```

### 2. Baseline do validador contra produção

```bash
DIRECT_URL="<prod>" python3 scripts/validate_fundamentals.py --baseline --allow-remote
```

### 3. Re-ingest de produção (mesma sequência validada localmente)

```bash
# piloto
DIRECT_URL="<prod>" python3 scripts/ingest_fundamentals.py --allow-remote \
  --tickers AAPL,MSFT,JPM,ACGL,PLD,NEE,WDAY,WBD,NVO,RACE
DIRECT_URL="<prod>" python3 scripts/validate_fundamentals.py --allow-remote \
  --tickers AAPL,MSFT,JPM,ACGL,PLD,NEE,WDAY,WBD,NVO,RACE
# completo (cache EDGAR local reutilizada; contra Supabase remoto conta ~1-2h
# pelos round-trips de rede)
DIRECT_URL="<prod>" python3 scripts/ingest_fundamentals.py --allow-remote
DIRECT_URL="<prod>" python3 scripts/adjust_splits.py
DIRECT_URL="<prod>" python3 scripts/validate_fundamentals.py --allow-remote
DIRECT_URL="<prod>" python3 scripts/audit_null_fundamentals.py
```

Gates idênticos aos locais: zero violações novas; auditoria com 0 inexplicados.

### 4. Merge + push (SÓ depois do passo 3 verde)

```bash
git push -u origin feat/fundamentals-repair
# PR → main. A partir do merge, o cron de domingo 03h UTC perpetua a lógica
# nova (workflow corre ingest + adjust_splits com secrets.DIRECT_URL).
```

Nota `assert_local_db`: no cron, `GITHUB_ACTIONS=true` isenta o guard — não é
preciso mexer no workflow.

### 5. Pós-cron seguinte

Confirmar no domingo seguinte: `validate_fundamentals.py --allow-remote` limpo
e auditoria sem novos inexplicados.

## Ferramentas QUARENTENADAS — NUNCA correr

| Script | Porquê |
|---|---|
| `auto_heal_xbrl_tags.py` | O desastre original: fuzzy matching cruzou os 3 mapas (cash flow → dívida, PP&E → capex). Substituído por explain_holes.py. |
| `rollback_false_heals.py` | Só fazia sentido para reverter o auto-healer; hoje apagaria dados bons. |
| `deduce_q4.py` | Backfill legacy com DPS por proxy do Q3 e ON CONFLICT DO NOTHING — ressuscitaria Q4s que a síntese atual descarta deliberadamente (base-mismatch). A síntese nativa do ingest cobre tudo. |

## Rollback de emergência (produção)

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_restore --clean --if-exists \
  -d "<DIRECT_URL de produção>" scratch/backup_SUPABASE_<stamp>.dump
```

## Follow-ups conhecidos (não bloqueiam)

1. **Splits ainda via yfinance** (`apply_stock_splits` + `adjust_splits.py` é
   EDGAR) — migrar para Polygon (`/v3/reference/splits`, key já existe).
2. **Revenue de bancos IFRS (BCS/HSBC/UBS)**: composto interest+fees só
   parcialmente mapeável — margens marcadas em validator_accepted.json.
3. **SNY/NVS**: "other revenues" fora do net sales taggado (GP_IDENTITY ~7%,
   aceite com racional).
4. **ACGL-class**: períodos em anos SEM factos de dividendos ficam 0.0 (verdade);
   anos COM factos mas sem DPS extraível ficam NULL — residual pequeno.
5. **Antigravity IDE**: o agente edita ficheiros em paralelo — manter
   `check_repair_integrity.py` antes de cada operação e rever `git diff`.
