"""
diff_reingest.py — Compara um dump de dry-run com a BD atual, campo a campo.

O gate humano entre "a lógica nova parece certa" e "vamos reescrever a BD":
classifica cada (empresa, período, campo) numa de:

  FILLED          NULL na BD → valor no dump (buraco curado)
  REGRESSED       valor na BD → NULL no dump (REVER: perda de dado…
                  ou remoção deliberada de um valor fabricado)
  CHANGED_MAJOR   |Δ| relativo > 20% ou troca de sinal (REVER)
  CHANGED_MINOR   0.1% < |Δ| ≤ 20%
  UNCHANGED       |Δ| ≤ 0.1% (tolerâncias absolutas para per-share/margens)
  ROW_NEW         período no dump que não existe na BD
  ROW_MISSING     período na BD ausente do dump (anotado se drop_q4)

Uso: python scripts/diff_reingest.py scripts/out/dryrun_full.json \
        [--report scripts/out/diff_report.md] [--csv scripts/out/diff_major.csv]

Só leitura. GOOG/FOX/NWS (irmãs dual-class) são excluídas do diff — os seus
dados são cópia da primária via sync_dual_class.
"""

import os
import sys
import json
import csv
import collections

import psycopg2

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(__file__))
import ingest_fundamentals as ing

DUAL_CLASS_SIBLINGS = {"GOOG", "FOX", "NWS"}

# Campos comparados (todos os que build_row escreve, menos ids/datas)
VALUE_FIELDS = [
    "revenue", "costOfRevenue", "grossProfit", "operatingExpenses",
    "operatingIncome", "interestExpense", "taxExpense", "netIncome",
    "epsDiluted", "sharesOutstanding", "operatingCashFlow", "capex",
    "freeCashFlow", "totalAssets", "totalCurrentLiab", "longTermDebt",
    "totalDebt", "cash", "totalEquity", "grossMargin", "operatingMargin",
    "netMargin", "roic", "returnOnEquity", "dividendPerShare",
    "researchAndDevelopment", "sellingGeneralAndAdmin", "ebitda",
]
# Tolerâncias absolutas por tipo de campo (Decimal na BD arredonda)
ABS_TOL = {f: 1e-3 for f in ("epsDiluted", "dividendPerShare")}
ABS_TOL.update({f: 1e-5 for f in ("grossMargin", "operatingMargin", "netMargin", "roic", "returnOnEquity")})
DEFAULT_ABS_TOL = 1.0  # valores monetários: $1 de ruído de arredondamento


def classify(old, new, field):
    if old is None and new is None:
        return "UNCHANGED"
    if old is None:
        return "FILLED"
    if new is None:
        return "REGRESSED"
    tol = ABS_TOL.get(field, DEFAULT_ABS_TOL)
    if abs(new - old) <= tol:
        return "UNCHANGED"
    if (old > 0) != (new > 0) and abs(new - old) > tol:
        return "CHANGED_MAJOR"
    base = max(abs(old), abs(new))
    rel = abs(new - old) / base if base else 0.0
    if rel > 0.20:
        return "CHANGED_MAJOR"
    if rel > 0.001:
        return "CHANGED_MINOR"
    return "UNCHANGED"


def main():
    if len(sys.argv) < 2:
        sys.exit("uso: diff_reingest.py <dump.json> [--report out.md] [--csv out.csv]")
    dump_path = sys.argv[1]
    report_path = sys.argv[sys.argv.index("--report") + 1] if "--report" in sys.argv else None
    csv_path = sys.argv[sys.argv.index("--csv") + 1] if "--csv" in sys.argv else None

    with open(dump_path, encoding="utf-8") as f:
        dump = json.load(f)
    companies = dump["companies"]

    conn = psycopg2.connect(ing.DIRECT_URL)
    cols = ", ".join(f'f."{c}"' for c in VALUE_FIELDS)
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT c.ticker, f."periodType", f."fiscalYear", f."fiscalQuarter", {cols}
            FROM fundamentals f JOIN companies c ON c.id = f."companyId"
            ORDER BY c.ticker
        """)
        db_rows = {}
        for r in cur.fetchall():
            key = (r[0], r[1], r[2], r[3])
            db_rows[key] = {f: (float(v) if v is not None else None)
                            for f, v in zip(VALUE_FIELDS, r[4:])}
    conn.close()

    counts = collections.Counter()                       # (field, class) -> n
    per_company = collections.Counter()                  # ticker -> reviewable
    dps_transitions = collections.Counter()
    rnd_transitions = collections.Counter()
    fx_rows = []
    major_rows = []                                      # para CSV
    row_new = row_missing = 0
    dump_keys = set()

    for ticker, cdata in companies.items():
        if ticker in DUAL_CLASS_SIBLINGS:
            continue
        drop_years = set(cdata.get("drop_q4_years") or [])
        for row in cdata["rows"]:
            key = (ticker, row["periodType"], row["fiscalYear"], row.get("fiscalQuarter"))
            dump_keys.add(key)
            old = db_rows.get(key)
            if old is None:
                row_new += 1
                continue
            for field in VALUE_FIELDS:
                new_v = row.get(field)
                new_v = float(new_v) if new_v is not None else None
                cls = classify(old[field], new_v, field)
                counts[(field, cls)] += 1
                if cls in ("REGRESSED", "CHANGED_MAJOR"):
                    per_company[ticker] += 1
                    major_rows.append((ticker, key[1], key[2], key[3], field, cls,
                                       old[field], new_v))
                if field == "dividendPerShare" and cls != "UNCHANGED":
                    payer = (cdata.get("evidence") or {}).get("is_dividend_payer")
                    if old[field] == 0.0 and new_v is None:
                        dps_transitions["0.0→NULL (payer: política)" if payer else "0.0→NULL (não-payer?!)"] += 1
                    elif old[field] == 0.0 and new_v and new_v > 0:
                        dps_transitions["0.0→valor (máscara curada)"] += 1
                    else:
                        dps_transitions[cls] += 1
                if field == "researchAndDevelopment" and cls != "UNCHANGED":
                    if old[field] == 0.0 and new_v is None:
                        rnd_transitions["0.0→NULL (tem linha R&D: política)"] += 1
                    elif old[field] == 0.0 and new_v and new_v != 0:
                        rnd_transitions["0.0→valor (máscara curada)"] += 1
                    else:
                        rnd_transitions[cls] += 1
        if cdata.get("fx_applied"):
            fy_max = max((r for r in cdata["rows"] if r["periodType"] == "ANNUAL"),
                         key=lambda r: r["fiscalYear"], default=None)
            if fy_max:
                key = (ticker, "ANNUAL", fy_max["fiscalYear"], None)
                old = db_rows.get(key) or {}
                fx_rows.append((ticker, cdata["reporting_currency"], fy_max["fiscalYear"],
                                old.get("revenue"), fy_max.get("revenue")))

    dump_tickers = set(companies) - DUAL_CLASS_SIBLINGS
    for key in db_rows:
        if key[0] in dump_tickers and key not in dump_keys:
            row_missing += 1

    # ── output ──
    lines = ["# Diff re-ingest vs BD atual\n"]
    lines.append(f"Dump: `{dump_path}` — {len(dump_tickers)} empresas | "
                 f"ROW_NEW: {row_new} | ROW_MISSING: {row_missing}\n")
    lines.append("## Matriz campo × classe\n")
    classes = ["FILLED", "REGRESSED", "CHANGED_MAJOR", "CHANGED_MINOR", "UNCHANGED"]
    lines.append("| campo | " + " | ".join(classes) + " |")
    lines.append("|---|" + "---|" * len(classes))
    for field in VALUE_FIELDS:
        row_counts = [counts.get((field, c), 0) for c in classes]
        if sum(row_counts[:-1]) == 0:
            continue
        lines.append(f"| {field} | " + " | ".join(str(n) for n in row_counts) + " |")
    lines.append("\n## Transições DPS (política evidência-de-ausência)\n")
    for k, v in dps_transitions.most_common():
        lines.append(f"- {k}: **{v}**")
    lines.append("\n## Transições R&D\n")
    for k, v in rnd_transitions.most_common():
        lines.append(f"- {k}: **{v}**")
    lines.append("\n## Empresas FX (revenue FY mais recente, antes → depois)\n")
    lines.append("| ticker | moeda | FY | BD | dump |")
    lines.append("|---|---|---|---|---|")
    for t, cur_, fy, old_v, new_v in sorted(fx_rows):
        f_old = f"{old_v/1e9:,.2f}B" if old_v else "NULL"
        f_new = f"{new_v/1e9:,.2f}B" if new_v else "NULL"
        lines.append(f"| {t} | {cur_} | {fy} | {f_old} | {f_new} |")
    lines.append("\n## Top 25 empresas por itens a rever (REGRESSED+CHANGED_MAJOR)\n")
    for t, n in per_company.most_common(25):
        lines.append(f"- {t}: {n}")

    report = "\n".join(lines) + "\n"
    if report_path:
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"Relatório em {report_path}")
    else:
        print(report)

    if csv_path:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["ticker", "periodType", "fy", "fq", "field", "class", "old", "new"])
            w.writerows(major_rows)
        print(f"CSV de itens a rever em {csv_path} ({len(major_rows)} linhas)")

    total_reviewable = sum(v for (f_, c), v in counts.items() if c in ("REGRESSED", "CHANGED_MAJOR"))
    total_filled = sum(v for (f_, c), v in counts.items() if c == "FILLED")
    print(f"\nFILLED: {total_filled} | a rever (REGRESSED+MAJOR): {total_reviewable} "
          f"| ROW_NEW: {row_new} | ROW_MISSING: {row_missing}")


if __name__ == "__main__":
    main()
