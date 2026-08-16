"""
fix_balance_block.py — Corrige o balanço como BLOCO ATÓMICO, nunca campo a campo.

Corrigir métricas isoladamente parece inofensivo e não é. Numa primeira tentativa
substituí `totalAssets`, `totalLiabilities` e `totalEquity` um a um pelos valores
da SEC: cada valor ficou individualmente mais correto e as linhas ficaram
INTERNAMENTE CONTRADITÓRIAS — o ativo deixou de fechar com passivo mais capital,
e o validador acusou 76 violações novas. Uma linha com valores certos que se
contradizem é pior do que uma linha com um erro conhecido, porque parece boa.

Aqui a regra é: ou entram os três valores de uma vez e a identidade
`Ativo = Passivo + Capital Próprio + Interesses Não-Controlados` fecha depois da
substituição, ou não se escreve nada nessa linha.

Fonte: Financial Statement Data Sets da SEC (a extração da própria SEC, caminho
independente do nosso). Ver scripts/arbitrate_dera.py.
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

TOL = 0.02  # tolerância da identidade do balanço, igual à do gate


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="scripts/out/arbitragem_dera_11anos.csv")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    # Divergências da DERA por linha e por campo do balanço.
    dera = defaultdict(dict)
    for r in csv.DictReader(open(args.csv, encoding="utf-8")):
        if r["metrica"] in ("totalAssets", "totalLiabilities", "totalEquity"):
            dera[(r["ticker"], r["periodType"], r["periodEnd"])][r["metrica"]] = \
                float(r["valor_dera"])

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    stats = defaultdict(int)
    updates = []

    for (tic, ptype, pend), corr in sorted(dera.items()):
        cur.execute(
            'SELECT f.id, f."totalAssets", f."totalLiabilities", f."totalEquity", '
            'f."minorityInterest" FROM fundamentals f JOIN companies c ON c.id = f."companyId" '
            'WHERE c.ticker = %s AND f."periodType" = %s::"period_type" '
            'AND f."periodEnd"::date = %s::date', (tic, ptype, pend))
        row = cur.fetchone()
        if not row:
            stats["linha_ausente"] += 1
            continue
        rid, ta, tl, te, mi = row

        # Valores propostos: os da SEC onde divergem, os nossos onde não.
        novo_ta = corr.get("totalAssets", float(ta) if ta is not None else None)
        novo_tl = corr.get("totalLiabilities", float(tl) if tl is not None else None)
        novo_te = corr.get("totalEquity", float(te) if te is not None else None)
        if novo_ta is None or novo_tl is None or novo_te is None or novo_ta <= 0:
            stats["incompleto"] += 1
            continue

        nci = float(mi) if mi is not None else 0.0
        gap_antes = abs(float(ta) - (float(tl) + float(te) + nci)) if None not in (ta, tl, te) else None
        gap_depois = abs(novo_ta - (novo_tl + novo_te + nci))

        # Só escrever se a identidade FECHAR depois — e melhorar face ao que
        # estava. Sem isto, trocar dois dos três campos deixa a linha pior.
        if gap_depois > TOL * novo_ta:
            stats["identidade_nao_fecha"] += 1
            continue
        if gap_antes is not None and gap_depois >= gap_antes:
            stats["nao_melhora"] += 1
            continue

        updates.append((novo_ta, novo_tl, novo_te, rid))
        stats["corrigidas"] += 1

    print(f"{len(dera)} linhas candidatas | {stats['corrigidas']} passam o teste da identidade")
    if updates and args.apply:
        cur.executemany('UPDATE fundamentals SET "totalAssets"=%s, "totalLiabilities"=%s, '
                        '"totalEquity"=%s WHERE id=%s', updates)
        conn.commit()
        print(f"{len(updates)} linhas escritas.")
    else:
        print("dry-run: nada escrito (usar --apply).")
    print(f"Resumo: {dict(sorted(stats.items()))}")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
