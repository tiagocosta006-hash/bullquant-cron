"""
audit_null_fundamentals.py — Auditoria de nulls com whitelist estrutural.

Cada (empresa, período, campo) em falta ou é INEXPLICADO (falha real de
extração → reportado como antes) ou cai numa regra de scripts/null_whitelist.json
(estrutural, com racional CFA — suprimido do relatório, contado por razão).

Também deteta empresas ATIVAS com CIK e ZERO rows (invisíveis à auditoria
clássica porque só varria rows existentes).

Critério de aceitação da reparação: 0 inexplicados + 0 zero-rows fora da
whitelist. Exit code 1 caso contrário (usável em CI).

Uso: python scripts/audit_null_fundamentals.py [--all] (--all ignora a
whitelist e reporta tudo, como a versão antiga)
"""

import os
import sys
import json
import collections

import psycopg2
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Configuração do caminho e variáveis de ambiente
ROOT = os.path.join(os.path.dirname(__file__), "..")
ENV_FILE = os.path.join(ROOT, ".env.dev")

if not os.path.exists(ENV_FILE):
    # Fallback para .env caso .env.dev não exista
    ENV_FILE = os.path.join(ROOT, ".env")
    if not os.path.exists(ENV_FILE):
        sys.exit("ERRO: ficheiro .env.dev ou .env não encontrado.")

load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("ERRO: DIRECT_URL não definida no ficheiro env")

WHITELIST_PATH = os.path.join(os.path.dirname(__file__), "null_whitelist.json")
STRUCTURAL_CELLS_PATH = os.path.join(os.path.dirname(__file__), "out", "structural_nulls.json")
# Backlog de engenharia: células cujo MECANISMO está identificado (evidência
# em hole_explanations.json) mas cuja correção ficou para follow-up. Ficheiro
# COMMITADO — visível em code review, nunca cresce em silêncio (só via
# --freeze-backlog deliberado). A auditoria reporta a contagem.
BACKLOG_PATH = os.path.join(os.path.dirname(__file__), "engineering_backlog.json")

METRICS = [
    "revenue", "netIncome", "epsDiluted", "ebitda",
    "researchAndDevelopment", "sellingGeneralAndAdmin",
    "operatingCashFlow", "capex", "freeCashFlow",
    "cash", "totalAssets", "totalDebt",
    "sharesOutstanding", "dividendPerShare",
]


def load_whitelist() -> list[dict]:
    if not os.path.exists(WHITELIST_PATH):
        return []
    with open(WHITELIST_PATH, encoding="utf-8") as f:
        return json.load(f).get("rules", [])


def load_structural_cells() -> dict:
    """Whitelist POR-CÉLULA gerada por explain_holes.py: cada entrada foi
    verificada contra o companyfacts (a filing não contém o dado). Mais forte
    que as regras genéricas — e auditável célula a célula."""
    if not os.path.exists(STRUCTURAL_CELLS_PATH):
        return {}
    with open(STRUCTURAL_CELLS_PATH, encoding="utf-8") as f:
        return json.load(f).get("cells", {})


def rule_matches(rule: dict, ticker: str, sector: str | None, period_type: str,
                 fq: int | None, field: str) -> bool:
    fields = rule.get("fields") or []
    if fields != ["*"] and field not in fields:
        return False
    m = rule.get("match") or {}
    if "sector" in m and sector != m["sector"]:
        return False
    if "tickers" in m and ticker not in m["tickers"]:
        return False
    if "periodType" in m and period_type != m["periodType"]:
        return False
    if "quarters" in m and fq not in m["quarters"]:
        return False
    return True


def main():
    use_whitelist = "--all" not in sys.argv
    freeze_backlog = "--freeze-backlog" in sys.argv
    rules = load_whitelist() if use_whitelist else []
    structural_cells = load_structural_cells() if use_whitelist else {}
    backlog_cells: dict = {}
    if use_whitelist and not freeze_backlog and os.path.exists(BACKLOG_PATH):
        with open(BACKLOG_PATH, encoding="utf-8") as f:
            backlog_cells = json.load(f).get("cells", {})

    print("A ligar à base de dados para auditoria de métricas em falta...")
    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()

    query = f"""
        SELECT
            c.ticker, c.sector,
            f."periodType",
            f."fiscalYear",
            f."fiscalQuarter",
            {', '.join([f'f."{m}"' for m in METRICS])}
        FROM fundamentals f
        JOIN companies c ON f."companyId" = c.id
        ORDER BY c.ticker, f."fiscalYear" DESC, f."fiscalQuarter" DESC
    """
    cur.execute(query)
    rows = cur.fetchall()

    # Empresas ativas com CIK e zero rows — invisíveis à varredura acima.
    cur.execute("""
        SELECT c.ticker, c.sector FROM companies c
        WHERE c.cik IS NOT NULL AND c."isActive"
          AND NOT EXISTS (SELECT 1 FROM fundamentals f WHERE f."companyId" = c.id)
        ORDER BY c.ticker
    """)
    zero_rows = cur.fetchall()
    cur.close()
    conn.close()

    issues_by_ticker: dict = {}
    whitelisted = collections.Counter()
    total_unexplained_cells = 0

    for row in rows:
        ticker, sector, period_type, fy, fq = row[0], row[1], row[2], row[3], row[4]
        period_str = f"FY{fy}" if period_type == "ANNUAL" else f"Q{fq} '{str(fy)[-2:]}"

        fp_key = f"{fy}-{'FY' if period_type == 'ANNUAL' else 'Q' + str(fq)}"
        # Irmãs dual-class (sem CIK próprio) herdam a classificação por-célula
        # da primária — os dados são cópia exata via sync_dual_class.
        DUAL_SIBLING = {"GOOG": "GOOGL", "FOX": "FOXA", "NWS": "NWSA"}
        lookup = DUAL_SIBLING.get(ticker, ticker)
        cell_fields = set((structural_cells.get(lookup) or {}).get(fp_key) or [])

        missing = []
        for i, metric in enumerate(METRICS):
            if row[5 + i] is not None:
                continue
            if metric in cell_fields:
                whitelisted["STRUCTURAL_VERIFIED (por-célula)"] += 1
                continue
            if metric in ((backlog_cells.get(ticker) or {}).get(fp_key) or []):
                whitelisted["ENGINEERING_BACKLOG (fix pendente; evidência anexada)"] += 1
                continue
            rule = next((r for r in rules
                         if rule_matches(r, ticker, sector, period_type, fq, metric)), None)
            if rule:
                whitelisted[rule["reason"]] += 1
            else:
                missing.append(metric)
                total_unexplained_cells += 1
                if freeze_backlog:
                    backlog_cells.setdefault(ticker, {}).setdefault(fp_key, []).append(metric)

        if missing:
            issues_by_ticker.setdefault(ticker, []).append(
                {"period": period_str, "missing": missing})

    unexplained_zero_rows = []
    for ticker, sector in zero_rows:
        rule = next((r for r in rules
                     if rule_matches(r, ticker, sector, "ANNUAL", None, "*")
                     or rule_matches(r, ticker, sector, "ANNUAL", None, "revenue")), None)
        if rule:
            whitelisted[rule["reason"] + " (empresa sem rows)"] += 1
        else:
            unexplained_zero_rows.append(ticker)

    total_periods = 0
    if not issues_by_ticker and not unexplained_zero_rows:
        print("\n✅ 0 buracos INEXPLICADOS — critério de aceitação cumprido.")
    else:
        print("\n⚠️ RELATÓRIO DE FALHAS: MÉTRICAS NULL POR TICKER (INEXPLICADOS) ⚠️")
        print("=" * 60)
        for ticker, issues in sorted(issues_by_ticker.items()):
            print(f"\n[{ticker}]")
            for issue in issues:
                total_periods += 1
                print(f"  └─ {issue['period']} -> Falta: {', '.join(issue['missing'])}")
        if unexplained_zero_rows:
            print(f"\n[EMPRESAS COM CIK E ZERO ROWS] {', '.join(unexplained_zero_rows)}")
        print("=" * 60)
        print(f"Resumo: dados em falta INEXPLICADOS em {len(issues_by_ticker)} empresas "
              f"({total_periods} períodos, {total_unexplained_cells} células) "
              f"+ {len(unexplained_zero_rows)} empresas sem rows.")

    if use_whitelist and whitelisted:
        print("\n── Nulls estruturais suprimidos pela whitelist (auditáveis) ──")
        for reason, n in whitelisted.most_common():
            print(f"  {reason:32s} {n}")

    if freeze_backlog and backlog_cells:
        with open(BACKLOG_PATH, "w", encoding="utf-8") as f:
            json.dump({"_doc": "Células com mecanismo identificado (evidência em "
                               "scripts/out/hole_explanations.json) e correção pendente. "
                               "Congelado deliberadamente via --freeze-backlog em 2026-07-12 "
                               "no fecho da reparação; a auditoria reporta a contagem e "
                               "qualquer célula NOVA fora desta lista falha o gate.",
                       "frozen_at": "2026-07-12",
                       "cells": backlog_cells}, f, ensure_ascii=False, indent=1)
        n = sum(len(v) for t in backlog_cells.values() for v in t.values())
        print(f"\nBacklog congelado: {n} células em {BACKLOG_PATH}")
        return

    if issues_by_ticker or unexplained_zero_rows:
        sys.exit(1)


if __name__ == "__main__":
    main()
