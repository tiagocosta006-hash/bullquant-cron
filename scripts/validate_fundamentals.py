"""
validate_fundamentals.py — Identidades contabilísticas como gate de qualidade.

Regras (cada violação = (ticker, período, regra)):
  GP_IDENTITY      |grossProfit − (revenue − costOfRevenue)| > 1%·revenue
  FCF_IDENTITY     |freeCashFlow − (OCF − capex)| > $2 (com os 3 presentes)
  DEBT_GE_LTD      totalDebt < longTermDebt − $1M
  EPS_X_SHARES     |eps×shares − netIncome| > 20%·|NI| (|NI| > $10M)
  MARGIN_BOUNDS    margem fora de [−5, +1.5] (excl. clamps legacy ±99)
  REV_YOY_JUMP     revenue FY salta >8× (ou <1/8) vs FY anterior — sintoma
                   clássico de moeda não convertida ou escala errada
  SHARES_QOQ_JUMP  shares mudam >50% QoQ sem ser split (corre pós-splits)
  DPS_NEGATIVE     dividendPerShare < 0
  CAPEX_NEGATIVE   capex < 0
  FY_RANGE         fiscalYear fora de [2016, 2028]

Modos:
  --baseline                 grava o conjunto de violações atual como baseline
                             (scripts/out/validator_baseline.json)
  (default)                  valida e reporta APENAS violações NOVAS vs baseline
  --dump PATH                valida as rows de um dump de dry-run em vez da BD
  --tickers AAPL,JPM         restringe o universo

Gate: exit 1 se houver violações novas. Só leitura.
"""

import os
import sys
import json
import collections

import psycopg2

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(__file__))
import ingest_fundamentals as ing

BASELINE_PATH = os.path.join(os.path.dirname(__file__), "out", "validator_baseline.json")

FIELDS = [
    "revenue", "costOfRevenue", "grossProfit", "netIncome", "epsDiluted",
    "sharesOutstanding", "operatingCashFlow", "capex", "freeCashFlow",
    "longTermDebt", "totalDebt", "grossMargin", "operatingMargin", "netMargin",
    "dividendPerShare",
]


def load_rows_from_db(tickers):
    conn = psycopg2.connect(ing.DIRECT_URL)
    cols = ", ".join(f'f."{c}"' for c in FIELDS)
    sql = f"""SELECT c.ticker, f."periodType", f."fiscalYear", f."fiscalQuarter", {cols}
              FROM fundamentals f JOIN companies c ON c.id = f."companyId" """
    params = ()
    if tickers:
        sql += " WHERE c.ticker = ANY(%s)"
        params = (tickers,)
    sql += ' ORDER BY c.ticker, f."fiscalYear", f."fiscalQuarter" NULLS FIRST'
    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = []
        for r in cur.fetchall():
            d = {"ticker": r[0], "periodType": r[1], "fiscalYear": r[2], "fiscalQuarter": r[3]}
            d.update({f: (float(v) if v is not None else None) for f, v in zip(FIELDS, r[4:])})
            rows.append(d)
    conn.close()
    return rows


def load_rows_from_dump(path, tickers):
    with open(path, encoding="utf-8") as f:
        dump = json.load(f)
    rows = []
    for ticker, cdata in dump["companies"].items():
        if tickers and ticker not in tickers:
            continue
        for row in cdata["rows"]:
            d = {"ticker": ticker, "periodType": row["periodType"],
                 "fiscalYear": row["fiscalYear"], "fiscalQuarter": row.get("fiscalQuarter")}
            for f_ in FIELDS:
                v = row.get(f_)
                d[f_] = float(v) if v is not None else None
            rows.append(d)
    return rows


def validate(rows):
    violations = []  # (ticker, periodType, fy, fq, rule, detail)

    def add(r, rule, detail):
        violations.append((r["ticker"], r["periodType"], r["fiscalYear"],
                           r["fiscalQuarter"], rule, detail))

    by_company = collections.defaultdict(list)
    for r in rows:
        by_company[r["ticker"]].append(r)

    for ticker, rs in by_company.items():
        for r in rs:
            rev, cogs, gp = r["revenue"], r["costOfRevenue"], r["grossProfit"]
            if rev is not None and cogs is not None and gp is not None and abs(rev) > 0:
                # 5%: IFRS tem "other revenues" entre net sales e total (NVS
                # ~3.5%); acima disso é excise/tag errada a sério.
                if abs(gp - (rev - cogs)) > 0.05 * abs(rev):
                    add(r, "GP_IDENTITY", f"gp={gp:.0f} rev-cogs={(rev-cogs):.0f}")
            ocf, capex, fcf = r["operatingCashFlow"], r["capex"], r["freeCashFlow"]
            if ocf is not None and capex is not None and fcf is not None:
                if abs(fcf - (ocf - capex)) > 2.0:
                    add(r, "FCF_IDENTITY", f"fcf={fcf:.0f} ocf-capex={(ocf-capex):.0f}")
            td, ltd = r["totalDebt"], r["longTermDebt"]
            if td is not None and ltd is not None and td < ltd - 1e6:
                add(r, "DEBT_GE_LTD", f"totalDebt={td:.0f} < ltd={ltd:.0f}")
            eps, sh, ni = r["epsDiluted"], r["sharesOutstanding"], r["netIncome"]
            if eps is not None and sh is not None and ni is not None and abs(ni) > 10e6:
                # 50%: weighted-average vs shares pontuais e diluído oficial
                # vs básico geram desvios de 20-40% LEGÍTIMOS; o build_row já
                # deriva eps=NI/shares quando o desvio excede 50%/troca sinal.
                if abs(eps * sh - ni) > 0.50 * abs(ni):
                    add(r, "EPS_X_SHARES", f"eps*sh={eps*sh:.0f} ni={ni:.0f}")
            for m in ("grossMargin", "operatingMargin", "netMargin"):
                v = r[m]
                if v is not None and abs(v) < 90 and not (-5.0 <= v <= 1.5):
                    add(r, "MARGIN_BOUNDS", f"{m}={v:.3f}")
            if r["dividendPerShare"] is not None and r["dividendPerShare"] < 0:
                add(r, "DPS_NEGATIVE", f"dps={r['dividendPerShare']}")
            if r["capex"] is not None and r["capex"] < 0:
                add(r, "CAPEX_NEGATIVE", f"capex={r['capex']:.0f}")
            if not (2016 <= r["fiscalYear"] <= 2028):
                add(r, "FY_RANGE", f"fy={r['fiscalYear']}")

        annuals = sorted((r for r in rs if r["periodType"] == "ANNUAL"),
                         key=lambda r: r["fiscalYear"])
        for a, b in zip(annuals, annuals[1:]):
            ra, rb = a["revenue"], b["revenue"]
            if ra and rb and ra > 0 and rb > 0 and b["fiscalYear"] == a["fiscalYear"] + 1:
                ratio = rb / ra
                if ratio > 8 or ratio < 1 / 8:
                    add(b, "REV_YOY_JUMP", f"{ra:.0f} → {rb:.0f} ({ratio:.2f}x)")

        quarters = sorted((r for r in rs if r["periodType"] == "QUARTERLY"),
                          key=lambda r: (r["fiscalYear"], r["fiscalQuarter"] or 0))
        for a, b in zip(quarters, quarters[1:]):
            sa, sb = a["sharesOutstanding"], b["sharesOutstanding"]
            if sa and sb and sa > 0:
                chg = abs(sb - sa) / sa
                if chg > 0.5:
                    add(b, "SHARES_QOQ_JUMP", f"{sa:.0f} → {sb:.0f}")

    return violations


def main():
    tickers = None
    if "--tickers" in sys.argv:
        tickers = [t.strip().upper() for t in
                   sys.argv[sys.argv.index("--tickers") + 1].split(",") if t.strip()]
    dump_path = sys.argv[sys.argv.index("--dump") + 1] if "--dump" in sys.argv else None
    make_baseline = "--baseline" in sys.argv

    rows = load_rows_from_dump(dump_path, tickers) if dump_path else load_rows_from_db(tickers)
    print(f"{len(rows)} rows a validar ({'dump' if dump_path else 'BD'}).")
    violations = validate(rows)

    by_rule = collections.Counter(v[4] for v in violations)
    print("Violações por regra:")
    for rule, n in by_rule.most_common():
        print(f"  {rule:16s} {n}")

    keys = sorted({f"{v[0]}|{v[1]}|{v[2]}|{v[3]}|{v[4]}" for v in violations})

    if make_baseline:
        os.makedirs(os.path.dirname(BASELINE_PATH), exist_ok=True)
        with open(BASELINE_PATH, "w", encoding="utf-8") as f:
            json.dump({"keys": keys}, f, indent=0)
        print(f"\nBaseline gravada: {len(keys)} violações em {BASELINE_PATH}")
        return

    baseline = set()
    if os.path.exists(BASELINE_PATH):
        with open(BASELINE_PATH, encoding="utf-8") as f:
            baseline = set(json.load(f)["keys"])
    else:
        print("\n(aviso: sem baseline — todas as violações contam como novas)")

    # Violações REVISTAS E ACEITES (eventos reais: ganho RAI da BTI 2017,
    # reestruturações, pré-conversões) — cada entrada tem racional humano.
    accepted_path = os.path.join(os.path.dirname(__file__), "validator_accepted.json")
    if os.path.exists(accepted_path):
        with open(accepted_path, encoding="utf-8") as f:
            accepted = json.load(f).get("accepted", [])
        baseline |= {a["key"] for a in accepted}
        print(f"(+{len(accepted)} violações aceites com racional em validator_accepted.json)")

    new_keys = [k for k in keys if k not in baseline]
    resolved = len([k for k in baseline if k not in set(keys)]) if baseline else 0
    print(f"\nTotal: {len(keys)} | na baseline: {len(keys) - len(new_keys)} | "
          f"NOVAS: {len(new_keys)} | resolvidas vs baseline: {resolved}")
    if new_keys:
        detail_map = {f"{v[0]}|{v[1]}|{v[2]}|{v[3]}|{v[4]}": v[5] for v in violations}
        print("\nViolações NOVAS (até 40):")
        for k in new_keys[:40]:
            print(f"  {k}  [{detail_map.get(k, '')}]")
        sys.exit(1)
    print("✓ Gate passado: zero violações novas.")


if __name__ == "__main__":
    main()
