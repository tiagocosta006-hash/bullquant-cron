#!/usr/bin/env python3
"""
clean_share_spikes.py — anula picos isolados de sharesOutstanding.

O DEFEITO QUE APANHA:
  Um período cujo número de ações é ~2x o dos DOIS vizinhos e volta ao normal
  a seguir. Um share count real não faz isso: cresce com emissões, encolhe com
  recompras, salta uma vez num split (e fica). Um pico isolado é sempre
  artefacto — na Visa vinha de somar a Classe A diluída (que já inclui B e C
  convertidas) com as classes individuais.

  Distingue-se de propósito PICO de DEGRAU: um degrau permanente (split,
  fusão, emissão massiva) tem vizinhos assimétricos e NÃO é tocado. Só se
  anula quando o valor destoa de ambos os lados.

O EPS VAI JUNTO:
  Onde o EPS satisfaz `eps x acoes = NI` ao cêntimo, foi derivado daquelas
  ações e herdou o mesmo erro — anula-se também, para não deixar um EPS
  metade do real a alimentar o P/E. Um EPS reportado (que não satisfaz a
  identidade exata) fica intacto.

Antes NULL que errado: sem forma de saber o valor certo, um buraco é honesto
e o frontend já lida com ele.

Uso:
  python scripts/clean_share_spikes.py                 # dry-run, todas
  python scripts/clean_share_spikes.py --tickers V,STZ
  python scripts/clean_share_spikes.py --apply
"""
import argparse
import os
import sys
from collections import defaultdict

import psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(HERE, "..", ".env.dev")
if os.path.exists(ENV_FILE):
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

# 1.6x é o mesmo limiar que o normalize_share_basis usa para separar "emissão
# normal" de "evento de base" — abaixo disto há recompras e emissões a sério.
LIMIAR = 1.6


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()

    filtro, params = "", []
    if args.tickers:
        alvos = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        filtro, params = "AND c.ticker = ANY(%s)", [alvos]

    cur.execute(
        f'''SELECT f.id, c.ticker, f."periodType", f."periodEnd"::date,
                   f."sharesOutstanding", f."epsDiluted", f."netIncome"
            FROM fundamentals f JOIN companies c ON c.id = f."companyId"
            WHERE f."sharesOutstanding" IS NOT NULL {filtro}
            ORDER BY c.ticker, f."periodType", f."periodEnd"''',
        params,
    )
    series = defaultdict(list)
    for rid, ticker, ptype, pend, sh, eps, ni in cur.fetchall():
        series[(ticker, ptype)].append((rid, pend, float(sh), eps, ni))

    picos = []
    for (ticker, ptype), linhas in series.items():
        for i in range(1, len(linhas) - 1):
            _rid, pend, sh, eps, ni = linhas[i]
            ant, seg = linhas[i - 1][2], linhas[i + 1][2]
            if not ant or not seg or not sh:
                continue
            # Os vizinhos têm de CONCORDAR ENTRE SI. Sem esta condição, uma
            # série que alterna entre duas bases (a Blackstone salta entre
            # ~670 M unidades da Classe A e ~1.210 M do total) faz com que TODAS
            # as linhas pareçam picos, e anular tudo não repara nada — esse é um
            # problema de base inconsistente, não um pico isolado, e pertence ao
            # normalize_share_basis.
            if max(ant, seg) / min(ant, seg) > 1.25:
                continue
            # Pico: destoa dos DOIS lados, na mesma direção.
            r_ant, r_seg = sh / ant, sh / seg
            if (r_ant > LIMIAR and r_seg > LIMIAR) or (r_ant < 1 / LIMIAR and r_seg < 1 / LIMIAR):
                # O EPS foi derivado destas ações? (identidade exata)
                eps_derivado = (
                    eps is not None and ni is not None and float(ni) != 0
                    and abs(float(eps) * sh - float(ni)) <= 0.01 * abs(float(ni))
                )
                picos.append((linhas[i][0], ticker, ptype, pend, sh, ant, seg, eps_derivado))

    print(f"{len(picos)} picos isolados de ações detetados.\n")
    for rid, ticker, ptype, pend, sh, ant, seg, epsd in picos[:20]:
        print(f"  {ticker:6} {ptype:9} {pend}  {sh:>16,.0f}   vizinhos {ant:,.0f} / {seg:,.0f}"
              f"{'  (+eps derivado)' if epsd else ''}")
    if len(picos) > 20:
        print(f"  ... e mais {len(picos) - 20}")

    if not args.apply:
        print("\nDry-run — nada escrito. Correr com --apply.")
        return

    for rid, _t, _pt, _pe, _sh, _a, _s, epsd in picos:
        if epsd:
            cur.execute('UPDATE fundamentals SET "sharesOutstanding" = NULL, '
                        '"epsDiluted" = NULL WHERE id = %s', (rid,))
        else:
            cur.execute('UPDATE fundamentals SET "sharesOutstanding" = NULL WHERE id = %s', (rid,))
    conn.commit()
    print(f"\nAnulados {len(picos)} picos.")
    conn.close()


if __name__ == "__main__":
    main()
