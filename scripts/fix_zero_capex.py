"""
fix_zero_capex.py — Corrige linhas com `capex = 0` que têm capex real no XBRL.

Um capex de zero não é um valor em falta: é um número ERRADO com aparência de
correto, e propaga-se. Como `freeCashFlow = operatingCashFlow − capex`, um capex
nulo faz o FCF igualar o cash flow operacional — e o FCF é a base de qualquer
valuation por fluxos descontados.

A Freeport-McMoRan (mineira de cobre) tinha capex 0 em 2022 e 2023, com o FCF a
aparecer como 5 139 M e 5 279 M. O capex real era 3 469 M e 4 824 M, pelo que o
FCF estava inflacionado em quase 5 mil milhões. Os próprios trimestres da FCX
traziam 1 121, 1 163 e 1 178 M — só a linha ANUAL é que saiu a zero.

Origem dos zeros (duas, distintas):
  - `ingest_fundamentals.py`, fallback de setor: bancos e imobiliário recebem
    `capex = 0.0` por convenção. Defensável para bancos, não para os restantes.
  - Falha de extração na linha anual, que escreve 0 em vez de NULL.

Este script só toca em linhas onde AMBAS as condições se verificam: capex igual
a zero na BD **e** capex real encontrado no XBRL. Recalcula o freeCashFlow.
Sectores financeiros ficam de fora por omissão (--include-financials para os
incluir), porque aí o zero é convenção assumida e documentada.
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="scripts/out/capex_v2_20260810.csv",
                    help="relatório de compare_fundamentals_xbrl.py")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--include-financials", action="store_true",
                    help="incluir bancos/seguradoras, cujo zero é convenção")
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()

    alvos = []
    with open(args.csv, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["metrica"] != "capex":
                continue
            if float(r["valor_bd"]) != 0:
                continue
            if float(r["valor_xbrl"]) <= 0:
                continue
            alvos.append(r)

    print(f"{len(alvos)} linhas com capex zero e valor real no XBRL")
    stats = defaultdict(int)
    updates = []

    for r in alvos:
        cur.execute(
            'SELECT f.id, c.sector, f."operatingCashFlow" '
            'FROM fundamentals f JOIN companies c ON c.id = f."companyId" '
            'WHERE c.ticker = %s AND f."periodType" = %s::"period_type" '
            'AND f."periodEnd"::date = %s::date',
            (r["ticker"], r["periodType"], r["periodEnd"]))
        row = cur.fetchone()
        if not row:
            stats["linha_nao_encontrada"] += 1
            continue
        rid, sector, ocf = row
        if sector == "Financials" and not args.include_financials:
            stats["financeiras_ignoradas"] += 1
            continue

        capex = float(r["valor_xbrl"])
        fcf = (float(ocf) - capex) if ocf is not None else None
        updates.append((capex, fcf, rid))
        print(f"  {r['ticker']:6s} {r['periodEnd']} {r['periodType']:9s} "
              f"capex 0 → {capex/1e6:,.0f} M | FCF → "
              f"{fcf/1e6:,.0f} M" if fcf is not None else "FCF → NULL")
        stats["corrigidas"] += 1

    if updates and args.apply:
        cur.executemany(
            'UPDATE fundamentals SET capex = %s, "freeCashFlow" = %s WHERE id = %s',
            updates)
        conn.commit()
        print(f"\n{len(updates)} linhas escritas.")
    else:
        print("\ndry-run: nada escrito (usar --apply).")

    print(f"Resumo: {dict(stats)}")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
