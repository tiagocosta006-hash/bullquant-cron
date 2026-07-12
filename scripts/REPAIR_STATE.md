# Estado da Reparação de Fundamentais — FASE LOCAL CONCLUÍDA (2026-07-12)

> Relatório completo: `docs/audit/fundamentals-repair-2026-07-12.md`
> Aplicação à BD de produção: `scripts/RUNBOOK_supabase_apply.md`

## ⚠️ IMPORTANTE — BD alvo

A BD reparada foi a **local (localhost/bullquant)** — serviu de sandbox de
validação da lógica. **O Tiago confirmou que a BD configurada no projeto NÃO
é a correta**: a aplicação final será feita à BD NOVA, cujos dados de ligação
(DIRECT_URL) têm de ser fornecidos por ele. Nunca aplicar a produção sem os
dados dele + aprovação explícita. O branch continua **sem push**.

## Estado final da fase local

- Pipeline de extração totalmente reparado (12 causas raiz, ver relatório)
- Validador: 0 violações novas; ~1.86k resolvidas vs baseline (−85%)
- Auditoria whitelist-aware com classificação POR-CÉLULA verificada
- Goldens 15/15; BTI/TTE/DEO/ERIC ressuscitadas; frontend null-safe
- Ferramentas permanentes: explain_holes, validate_fundamentals,
  diff_reingest, audit whitelist-aware, check_repair_integrity (19 invariantes)

## Para aplicar à BD nova (quando o Tiago der os dados)

1. `python3 scripts/check_repair_integrity.py` (19/19 ✓)
2. Confirmar que a BD nova tem `companies` semeada com CIKs (o ingest precisa);
   se vazia: schema via prisma + seed_companies primeiro
3. Seguir o RUNBOOK (backup → baseline → piloto → completo → splits →
   validador → auditoria), com `DIRECT_URL="<nova>"` + `--allow-remote`
4. Verificar `revenueSegments`/`businessKpis` não-nulos ANTES (re-ingest apaga)
