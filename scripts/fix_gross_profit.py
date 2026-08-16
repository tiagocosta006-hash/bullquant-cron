"""
fix_gross_profit.py — Fecha a identidade `grossProfit = revenue − costOfRevenue`.

O PROBLEMA: em 60 empresas o custo das vendas está muito subestimado, porque a
lista ordenada de conceitos apanha uma rubrica lateral em vez do custo principal
do negócio. A Centene, seguradora de saúde, tinha:

    receita        174 581 M
    custo vendido    2 670 M   ← rubrica lateral
    lucro bruto     14 209 M

O lucro bruto implica um custo de 160 372 M, que são os custos médicos reais da
Centene (~92% da receita, coerente com o medical loss ratio do setor). Ou seja o
LUCRO BRUTO está certo e o CUSTO está mal extraído — o conceito us-gaap que os
seguradores usam (`BenefitsLossesAndExpenses`) não estava na lista.

A REGRA: onde a identidade não fecha, usa-se a fonte independente (DERA/SEC) para
decidir qual dos dois campos está errado; onde a SEC não opina, deriva-se o custo
a partir do lucro bruto — mas SÓ se a margem resultante for plausível para o
setor. Nunca se deriva o lucro bruto a partir do custo, porque é o custo que está
comprovadamente mal extraído.

Margens implausíveis (negativas, ou acima de 95% em setores de custo intensivo)
são deixadas em paz e sinalizadas: sem terceira fonte, adivinhar é pior.
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

GP_TOL = 0.05


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="scripts/out/arbitragem_v3.csv",
                    help="arbitragem da SEC, para decidir qual campo está errado")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    # O que a SEC diz sobre custo das vendas e lucro bruto, por linha.
    sec = defaultdict(dict)
    if os.path.exists(args.csv):
        for r in csv.DictReader(open(args.csv, encoding="utf-8")):
            if r["metrica"] in ("costOfRevenue", "grossProfit"):
                sec[(r["ticker"], r["periodType"], r["periodEnd"])][r["metrica"]] = \
                    float(r["valor_dera"])

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    cur.execute(
        'SELECT f.id, c.ticker, f."periodType"::text, f."periodEnd"::date, f.revenue, '
        'f."costOfRevenue", f."grossProfit" '
        'FROM fundamentals f JOIN companies c ON c.id = f."companyId" '
        'WHERE f.revenue > 0 AND f."costOfRevenue" IS NOT NULL AND f."grossProfit" IS NOT NULL '
        'AND abs(f."grossProfit" - (f.revenue - f."costOfRevenue")) > %s * f.revenue',
        (GP_TOL,))
    linhas = cur.fetchall()
    print(f"{len(linhas)} linhas com a identidade do lucro bruto aberta")

    stats = defaultdict(int)
    updates = []
    for rid, tic, ptype, pend, rev, cogs, gp in linhas:
        rev, cogs, gp = float(rev), float(cogs), float(gp)
        do_sec = sec.get((tic, ptype, pend.isoformat()), {})

        novo_cogs, novo_gp = cogs, gp
        origem = None

        if "costOfRevenue" in do_sec:
            # A SEC diz que o custo está errado: usa-se o dela e o lucro bruto
            # passa a ser derivado, ficando a identidade fechada por construção.
            novo_cogs = do_sec["costOfRevenue"]
            novo_gp = rev - novo_cogs
            origem = "sec_cogs"
        elif "grossProfit" in do_sec:
            novo_gp = do_sec["grossProfit"]
            novo_cogs = rev - novo_gp
            origem = "sec_gp"
        else:
            # Sem opinião da SEC: derivar o CUSTO a partir do lucro bruto. É o
            # custo que está comprovadamente mal extraído (Centene: 2 670 M numa
            # empresa com 160 372 M de custos médicos).
            novo_cogs = rev - gp
            novo_gp = gp
            origem = "derivado"

        margem = novo_gp / rev
        if not (-0.5 <= margem <= 0.98):
            stats["margem_implausivel"] += 1
            continue
        if novo_cogs < 0:
            stats["custo_negativo"] += 1
            continue

        updates.append((novo_cogs, novo_gp, margem, rid))
        stats[origem] += 1

    print(f"a corrigir: {len(updates)} | por origem: {dict(sorted(stats.items()))}")
    if updates and args.apply:
        cur.executemany(
            'UPDATE fundamentals SET "costOfRevenue"=%s, "grossProfit"=%s, '
            '"grossMargin"=%s WHERE id=%s', updates)
        conn.commit()
        print(f"{len(updates)} linhas escritas.")
    else:
        print("dry-run: nada escrito (usar --apply).")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
