"""
validate_period_identity.py — Gate de IDENTIDADE DE PERÍODO FISCAL (read-only).

Fecha a lacuna que todos os outros validadores deixaram aberta: nenhum verifica
se a data `periodEnd` de uma linha é coerente com o par (fiscalYear, fiscalQuarter)
que lhe foi atribuído. O bug: o ingest confiava nos campos `fy`/`fp` do XBRL da
SEC (frequentemente errados em factos comparativos) para rotular o período, em
vez de derivar o ano/trimestre fiscal da própria data de fecho. Sintoma: linhas
"FY2020 Q1" com periodEnd de 2020-04-26 (que é fiscal-2021 Q1), trimestres a
faltar, e datas com anos de desfasamento (MTD "FY2021 Q3" @ 2023-06-30).

Só faz SELECT — seguro contra qualquer BD. Deriva o calendário fiscal de cada
empresa a partir das próprias datas na BD (moda do mês de fecho das ANNUAL).

Uso:
  python scripts/validate_period_identity.py            # valida vs baseline, reporta NOVAS
  python scripts/validate_period_identity.py --baseline # grava o estado atual como baseline
  python scripts/validate_period_identity.py --report PATH   # escreve relatório .md
  python scripts/validate_period_identity.py --json          # imprime as violações em JSON

Exit 1 se houver violações NOVAS (não na baseline nem em period_identity_accepted.json).
Bootstrap de env: usa DIRECT_URL do ambiente; senão carrega .env / .env.local / .env.dev.
"""

import os
import sys
import json
import math
import datetime
from collections import Counter, defaultdict

import psycopg2
from dotenv import load_dotenv

ROOT = os.path.join(os.path.dirname(__file__), "..")
BASELINE_PATH = os.path.join(os.path.dirname(__file__), "out", "period_identity_baseline.json")
ACCEPTED_PATH = os.path.join(os.path.dirname(__file__), "period_identity_accepted.json")

# ── Tolerâncias ──────────────────────────────────────────────────────────────
# Calendários 52/53 semanas (retalho: WMT/COST/TGT) fazem a data de fecho
# oscilar ±1 semana e por vezes cruzar a fronteira de mês/ano. Tolera-se ±1 mês
# no mês de fecho e, no ano, ±1 apenas para empresas com fecho perto da virada
# do ano (jan/fev/nov/dez). Erros reais são de ≥2 meses / ≥2 anos.
MONTH_TOL = 1
NEAR_YEAR_BOUNDARY_MONTHS = {1, 2, 11, 12}


def _bootstrap_env() -> str:
    url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if url:
        return url
    for fname in (".env", ".env.local", ".env.dev"):
        p = os.path.join(ROOT, fname)
        if os.path.exists(p):
            load_dotenv(p)
            url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
            if url:
                return url
    sys.exit("ERRO: DIRECT_URL/DATABASE_URL não definida (nem em .env/.env.local/.env.dev).")


def _month_diff(a: int, b: int) -> int:
    """Distância circular entre dois meses (1..12), 0..6."""
    d = abs(a - b) % 12
    return min(d, 12 - d)


def derive_fye_month(annual_ends: list[datetime.date]) -> int | None:
    """Mês de fecho do ano fiscal = moda do mês das datas de fecho anuais."""
    if not annual_ends:
        return None
    return Counter(d.month for d in annual_ends).most_common(1)[0][0]


def expected_quarter_month(fye_month: int, fq: int) -> int:
    """Mês esperado do fecho do trimestre fq (1..4) dado o mês de fecho anual.
    Q4 fecha em fye_month; Q3 −3; Q2 −6; Q1 −9 (circular 1..12)."""
    m = (fye_month - 3 * (4 - fq)) % 12
    return 12 if m == 0 else m


def ending_calendar_year(pe: datetime.date, fye_month: int) -> int:
    """Ano civil em que TERMINA o ano fiscal a que este período pertence. Um
    período que fecha no mês m do ano Y pertence ao FY que termina em Y (se
    m <= fye_month) ou em Y+1 (se m > fye_month)."""
    return pe.year + (1 if pe.month > fye_month else 0)


def expected_fy_from_annuals(d: datetime.date, annual_pairs: list[tuple]) -> int | None:
    """Ano fiscal esperado para um período que fecha em `d`, ancorado nas datas
    de fecho anuais REAIS da empresa (convention- e drift-agnóstico: herda a
    numeração das próprias anuais). Robusto a anuais em falta: usa a anual mais
    PRÓXIMA no tempo como âncora e conta anos fiscais inteiros (~365,25 dias) de
    distância — assim uma lacuna no meio das anuais não puxa o ano esperado para
    um valor errado (ex. MA/COST sem a anual de um ano).

    n = nº de fechos fiscais entre o fecho da âncora e `d` (>= d, com 7 dias de
    folga para o Q4 que fecha no mesmo dia do anual). `annual_pairs`: lista
    [(periodEnd, fiscalYear)]."""
    if not annual_pairs:
        return None
    grace = datetime.timedelta(days=7)
    pe_a, fy_a = min(annual_pairs, key=lambda p: abs((p[0] - d).days))
    n = math.ceil(((d - pe_a) - grace).days / 365.25)
    return fy_a + n


def load_rows(cur) -> dict[str, list[dict]]:
    cur.execute(
        """
        SELECT c.ticker, f."periodType", f."fiscalYear", f."fiscalQuarter", f."periodEnd"
        FROM fundamentals f JOIN companies c ON c.id = f."companyId"
        ORDER BY c.ticker, f."periodEnd"
        """
    )
    out: dict[str, list[dict]] = defaultdict(list)
    for ticker, ptype, fy, fq, pe in cur.fetchall():
        out[ticker].append({
            "periodType": ptype,
            "fiscalYear": fy,
            "fiscalQuarter": fq,
            "periodEnd": pe if isinstance(pe, datetime.date) else pe.date(),
        })
    return out


def check_company(ticker: str, rows: list[dict]) -> list[dict]:
    """Devolve lista de violações {key, ticker, check, detail}."""
    violations: list[dict] = []

    def add(check, fy, fq, detail):
        pt = "Q" if fq is not None else "A"
        key = f"{ticker}|{fy}|{fq if fq is not None else 'None'}|{check}"
        violations.append({"key": key, "ticker": ticker, "check": check, "detail": detail})

    quarters = [r for r in rows if r["periodType"] == "QUARTERLY"]
    annuals = [r for r in rows if r["periodType"] == "ANNUAL"]

    fye_month = derive_fye_month([r["periodEnd"] for r in annuals])

    # ── Check 1: inversão de ordem (calendar-free, o sintoma direto do bug) ──
    # Ordenar por (fiscalYear, fiscalQuarter) tem de coincidir com ordenar por
    # periodEnd. Qualquer par adjacente fora de ordem é uma mis-rotulagem.
    ordered = sorted(quarters, key=lambda r: (r["fiscalYear"], r["fiscalQuarter"] or 0))
    for i in range(1, len(ordered)):
        prev, cur_ = ordered[i - 1], ordered[i]
        if cur_["periodEnd"] <= prev["periodEnd"]:
            add("ORDER_INVERSION", cur_["fiscalYear"], cur_["fiscalQuarter"],
                f"FY{cur_['fiscalYear']}Q{cur_['fiscalQuarter']}@{cur_['periodEnd']} "
                f"não é > FY{prev['fiscalYear']}Q{prev['fiscalQuarter']}@{prev['periodEnd']}")

    # ── Check 2: ano fiscal do trimestre vs as próprias anuais da empresa ──
    # Ancora nas datas de fecho anuais reais (ground truth da numeração da
    # empresa). Só trimestres — as anuais definem as fronteiras; anuais más são
    # apanhadas pelo ANNUAL_MONTH_MISMATCH.
    annual_pairs = sorted((a["periodEnd"], a["fiscalYear"]) for a in annuals)
    for r in quarters:
        expected = expected_fy_from_annuals(r["periodEnd"], annual_pairs)
        if expected is not None and expected != r["fiscalYear"]:
            add("FY_YEAR_MISMATCH", r["fiscalYear"], r["fiscalQuarter"],
                f"Q{r['fiscalQuarter']}@{r['periodEnd'].date()} implica FY{expected} "
                f"(pelas anuais) mas está como FY{r['fiscalYear']}")

    # ── Check 3: mês do periodEnd vs esperado para o trimestre/ano ──
    if fye_month is not None:
        for r in annuals:
            if _month_diff(r["periodEnd"].month, fye_month) > MONTH_TOL:
                add("ANNUAL_MONTH_MISMATCH", r["fiscalYear"], None,
                    f"ANNUAL periodEnd mês {r['periodEnd'].month} vs fecho fiscal {fye_month}")
        for r in quarters:
            if r["fiscalQuarter"] is None:
                continue
            exp = expected_quarter_month(fye_month, r["fiscalQuarter"])
            if _month_diff(r["periodEnd"].month, exp) > MONTH_TOL:
                add("QUARTER_MONTH_MISMATCH", r["fiscalYear"], r["fiscalQuarter"],
                    f"Q{r['fiscalQuarter']} periodEnd mês {r['periodEnd'].month} vs esperado {exp} "
                    f"(fecho fiscal {fye_month})")

    # ── Check 4: periodEnd duplicado no mesmo (empresa, periodType) ──
    for pt in ("QUARTERLY", "ANNUAL"):
        seen = Counter(r["periodEnd"] for r in rows if r["periodType"] == pt)
        for pe, n in seen.items():
            if n > 1:
                add("DUP_PERIOD_END", pe.year, None,
                    f"{pt}: {n} linhas com periodEnd {pe}")

    return violations


def main():
    url = _bootstrap_env()
    make_baseline = "--baseline" in sys.argv
    want_json = "--json" in sys.argv
    report_path = sys.argv[sys.argv.index("--report") + 1] if "--report" in sys.argv else None

    host = url.split("@")[-1].split("/")[0] if "@" in url else "?"
    print(f"A validar identidade de período contra {host} (read-only)...")

    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cur:
            by_ticker = load_rows(cur)
    finally:
        conn.close()

    all_viol: list[dict] = []
    for ticker in sorted(by_ticker):
        all_viol.extend(check_company(ticker, by_ticker[ticker]))

    keys = [v["key"] for v in all_viol]
    by_check = Counter(v["check"] for v in all_viol)
    affected = sorted({v["ticker"] for v in all_viol})

    print(f"\nEmpresas analisadas: {len(by_ticker)} | violações: {len(keys)} "
          f"| empresas afetadas: {len(affected)}")
    for chk, n in by_check.most_common():
        print(f"  {chk}: {n}")

    if make_baseline:
        os.makedirs(os.path.dirname(BASELINE_PATH), exist_ok=True)
        with open(BASELINE_PATH, "w", encoding="utf-8") as f:
            json.dump({"keys": sorted(keys), "generatedAt": None,
                       "note": "identidade de período — congelado como baseline"}, f, indent=2)
        print(f"\nBaseline gravada: {BASELINE_PATH} ({len(keys)} violações)")
        return

    baseline: set[str] = set()
    if os.path.exists(BASELINE_PATH):
        with open(BASELINE_PATH, encoding="utf-8") as f:
            baseline = set(json.load(f)["keys"])
    else:
        print("\n(aviso: sem baseline — todas as violações contam como novas)")

    if os.path.exists(ACCEPTED_PATH):
        with open(ACCEPTED_PATH, encoding="utf-8") as f:
            accepted = json.load(f).get("accepted", [])
        baseline |= {a["key"] for a in accepted}
        print(f"(+{len(accepted)} exceções aceites com racional em period_identity_accepted.json)")

    new = [v for v in all_viol if v["key"] not in baseline]
    resolved = len([k for k in baseline if k not in set(keys)]) if baseline else 0
    print(f"\nTotal: {len(keys)} | na baseline/aceites: {len(keys) - len(new)} "
          f"| NOVAS: {len(new)} | resolvidas vs baseline: {resolved}")

    if report_path:
        lines = ["# Relatório de identidade de período fiscal\n",
                 f"- Empresas afetadas: {len(affected)}", f"- Violações totais: {len(keys)}\n"]
        for chk, n in by_check.most_common():
            lines.append(f"- **{chk}**: {n}")
        lines.append("\n## Detalhe por empresa\n")
        cur_t = None
        for v in sorted(all_viol, key=lambda x: x["ticker"]):
            if v["ticker"] != cur_t:
                cur_t = v["ticker"]
                lines.append(f"\n### {cur_t}")
            lines.append(f"- `{v['check']}` — {v['detail']}")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print(f"Relatório escrito: {report_path}")

    if want_json:
        print(json.dumps(all_viol, indent=2, ensure_ascii=False))

    if new:
        print(f"\n❌ {len(new)} violações NOVAS de identidade de período.")
        for v in new[:40]:
            print(f"  {v['ticker']}: {v['check']} — {v['detail']}")
        if len(new) > 40:
            print(f"  ... (+{len(new) - 40})")
        sys.exit(1)

    print("\n✓ Sem violações novas de identidade de período.")


if __name__ == "__main__":
    main()
