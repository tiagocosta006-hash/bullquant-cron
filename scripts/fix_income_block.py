"""
fix_income_block.py — Corrige a demonstração de resultados como BLOCO ATÓMICO.

Mesma regra do balanço: nunca campo a campo. Substituir só o `netIncome` deixa o
`epsDiluted` a apontar para o valor antigo e a linha passa a contradizer-se —
numa tentativa anterior isso gerou 76 violações novas de `EPS_X_SHARES` e
`MARGIN_BOUNDS`.

Aqui, uma linha só é escrita se, DEPOIS de aplicar os valores da SEC, todas as
identidades verificarem:

  1. grossProfit = revenue − costOfRevenue        (quando há custo das vendas)
  2. epsDiluted × sharesOutstanding ≈ netIncome   (tolerância larga: as ações
     em circulação são um instantâneo e o EPS usa a média ponderada do período)
  3. as margens dentro de limites plausíveis

A RECEITA fica de fora por omissão (--include-revenue para a incluir). Entre a
receita bruta e a líquida de impostos especiais não há regra técnica: a Altria
publica 24 483 M e 20 502 M, ambos factos XBRL válidos, e a DERA usa sempre o
bruto. Trocar em massa mudava a base de comparação de todo o histórico.
"""

import os
import sys
import csv
import argparse
from collections import defaultdict

import psycopg2
from dotenv import load_dotenv

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENV_FILE = os.path.join(ROOT, ".env.dev")
if os.path.exists(ENV_FILE):
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

CAMPOS = ("revenue", "grossProfit", "operatingIncome", "netIncome", "epsDiluted")
GP_TOL = 0.05       # igual ao gate: IFRS tem "other revenues" entre vendas e total
EPS_TOL = 0.30      # ações em circulação são instantâneo, EPS usa média ponderada
MARGIN_MAX = 5.0    # margens acima de 500% denunciam unidades trocadas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="scripts/out/arbitragem_completa.csv")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--include-revenue", action="store_true")
    args = ap.parse_args()

    campos = CAMPOS if args.include_revenue else tuple(c for c in CAMPOS if c != "revenue")

    dera = defaultdict(dict)
    for r in csv.DictReader(open(args.csv, encoding="utf-8")):
        if r["metrica"] in campos:
            dera[(r["ticker"], r["periodType"], r["periodEnd"])][r["metrica"]] = \
                float(r["valor_dera"])

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    stats = defaultdict(int)
    updates = []

    for (tic, ptype, pend), corr in sorted(dera.items()):
        cur.execute(
            'SELECT f.id, f.revenue, f."costOfRevenue", f."grossProfit", '
            'f."operatingIncome", f."netIncome", f."epsDiluted", f."sharesOutstanding" '
            'FROM fundamentals f JOIN companies c ON c.id = f."companyId" '
            'WHERE c.ticker = %s AND f."periodType" = %s::"period_type" '
            'AND f."periodEnd"::date = %s::date', (tic, ptype, pend))
        row = cur.fetchone()
        if not row:
            stats["linha_ausente"] += 1
            continue
        rid, rev, cogs, gp, opinc, ni, eps, shares = row

        def val(nome, atual):
            v = corr.get(nome)
            if v is not None:
                return v
            return float(atual) if atual is not None else None

        n_rev = val("revenue", rev)
        n_gp = val("grossProfit", gp)
        n_op = val("operatingIncome", opinc)
        n_ni = val("netIncome", ni)
        n_eps = val("epsDiluted", eps)

        if n_rev is None or n_rev <= 0:
            stats["sem_receita"] += 1
            continue

        # 1) lucro bruto = receita − custo das vendas
        if n_gp is not None and cogs is not None:
            if abs(n_gp - (n_rev - float(cogs))) > GP_TOL * abs(n_rev):
                stats["gp_nao_fecha"] += 1
                continue

        # 2) EPS × ações ≈ resultado líquido
        if n_eps is not None and n_ni is not None and shares and float(shares) > 0:
            esperado = n_eps * float(shares)
            if abs(n_ni) > 1e6 and abs(esperado - n_ni) > EPS_TOL * abs(n_ni):
                stats["eps_nao_fecha"] += 1
                continue

        # 3) margens plausíveis
        margens = [m / n_rev for m in (n_gp, n_op, n_ni) if m is not None]
        if any(abs(m) > MARGIN_MAX for m in margens):
            stats["margem_absurda"] += 1
            continue

        gm = (n_gp / n_rev) if n_gp is not None else None
        om = (n_op / n_rev) if n_op is not None else None
        nm = (n_ni / n_rev) if n_ni is not None else None
        updates.append((n_rev, n_gp, n_op, n_ni, n_eps, gm, om, nm, rid))
        for k in corr:
            stats[f"corr_{k}"] += 1
        stats["corrigidas"] += 1

    print(f"{len(dera)} linhas candidatas | {stats['corrigidas']} passam as identidades")
    if updates and args.apply:
        cur.executemany(
            'UPDATE fundamentals SET revenue=%s, "grossProfit"=%s, "operatingIncome"=%s, '
            '"netIncome"=%s, "epsDiluted"=%s, "grossMargin"=COALESCE(%s,"grossMargin"), '
            '"operatingMargin"=COALESCE(%s,"operatingMargin"), '
            '"netMargin"=COALESCE(%s,"netMargin") WHERE id=%s', updates)
        conn.commit()
        print(f"{len(updates)} linhas escritas.")
    else:
        print("dry-run: nada escrito (usar --apply).")
    print(f"Resumo: {dict(sorted(stats.items()))}")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
