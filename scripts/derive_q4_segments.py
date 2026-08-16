"""
derive_q4_segments.py — Deriva os segmentos do Q4 por diferença (anual − Q1−Q2−Q3).

Porquê: as empresas NÃO entregam 10-Q do quarto trimestre (a SEC não o exige,
porque nesse período entregam o 10-K). Logo não existe facto XBRL com duração
trimestral para o Q4 e o extrator deixa-o vazio — 2% de cobertura contra 66-71%
nos outros trimestres, ou seja 4 876 linhas por preencher.

O valor é obtido por diferença, tal como o `synthesize_q4` do ingest_fundamentals
já faz para as restantes métricas.

Condições para derivar (todas obrigatórias — na dúvida não escreve):
  1. Existem os quatro períodos do mesmo ano fiscal com o mesmo eixo.
  2. As CHAVES dos quatro são idênticas. Se a empresa mudou a composição dos
     segmentos a meio do ano, a diferença misturaria partições distintas.
  3. Nenhum segmento derivado fica materialmente negativo. Um trimestre de
     receita negativa denuncia bases contabilísticas diferentes (reapresentação)
     e não um Q4 real.
  4. A soma derivada bate com a receita do Q4 (±5%), quando essa receita existe.

Escreve `revenueSegments` e `revenueSegmentsByAxis`, marcando a proveniência no
segundo com "__derived": true, para que nunca se confunda um valor calculado com
um valor reportado.
"""

import os
import sys
import json
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

# Tolerância na reconciliação da soma derivada com a receita do Q4. Mais folgada
# que os 2% da extração porque aqui acumulam-se os arredondamentos de 4 períodos.
RECONCILE_TOL = 0.05
# Um segmento derivado pode ficar ligeiramente negativo por arredondamento ou por
# ser uma rubrica de eliminação; só se rejeita quando é material face ao total.
NEGATIVE_TOL = 0.02


def derive_axis(anual, q1, q2, q3):
    """Q4 de um eixo, ou None se as condições não se verificarem."""
    if not (anual and q1 and q2 and q3):
        return None
    chaves = set(anual)
    if any(set(p) != chaves for p in (q1, q2, q3)):
        return None  # composição mudou durante o ano
    out = {}
    for k in chaves:
        try:
            out[k] = float(anual[k]) - float(q1[k]) - float(q2[k]) - float(q3[k])
        except (TypeError, ValueError):
            return None
    total = sum(abs(v) for v in out.values())
    if total <= 0:
        return None
    if any(v < -NEGATIVE_TOL * total for v in out.values()):
        return None
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()

    sql = ('SELECT c.ticker, f.id, f."companyId", f."periodType", f."fiscalYear", '
           'f."fiscalQuarter", f.revenue, f."revenueSegments", f."revenueSegmentsByAxis" '
           'FROM fundamentals f JOIN companies c ON c.id = f."companyId"')
    if args.tickers:
        wanted = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        cur.execute(sql + ' WHERE c.ticker = ANY(%s)', (wanted,))
    else:
        cur.execute(sql)

    # (ticker, ano) -> {"A": row, 1: row, 2: row, 3: row, 4: row}
    grupos = defaultdict(dict)
    for tic, rid, cid, ptype, fy, fq, rev, segs, byaxis in cur.fetchall():
        chave = "A" if ptype == "ANNUAL" else fq
        if chave in ("A", 1, 2, 3, 4):
            grupos[(tic, fy)][chave] = {
                "id": rid, "revenue": rev, "segs": segs, "byaxis": byaxis,
            }

    stats = defaultdict(int)
    updates = []
    for (tic, fy), g in grupos.items():
        q4 = g.get(4)
        if not q4 or q4["segs"]:
            continue  # sem linha Q4, ou já tem segmentos
        if not all(k in g for k in ("A", 1, 2, 3)):
            stats["periodos_em_falta"] += 1
            continue

        # Derivar eixo a eixo, a partir de revenueSegmentsByAxis.
        eixos = {}
        for axis in ("segment", "product", "geography"):
            partes = [(g[k].get("byaxis") or {}).get(axis) for k in ("A", 1, 2, 3)]
            got = derive_axis(*partes)
            if got:
                eixos[axis] = got
        if not eixos:
            # Sem byAxis (linhas antigas): tentar a coluna principal.
            got = derive_axis(*[g[k].get("segs") for k in ("A", 1, 2, 3)])
            if got:
                eixos["segment"] = got
        if not eixos:
            stats["nao_derivavel"] += 1
            continue

        principal = eixos.get("segment") or eixos.get("product") or eixos.get("geography")

        # Verificação final contra a receita do Q4, quando existe.
        rev_q4 = q4["revenue"]
        if rev_q4 is not None and float(rev_q4) > 0:
            soma = sum(principal.values())
            if abs(soma - float(rev_q4)) > RECONCILE_TOL * float(rev_q4):
                stats["nao_reconcilia"] += 1
                continue

        payload = dict(eixos)
        payload["__derived"] = True  # proveniência: calculado, não reportado
        updates.append((json.dumps(principal), json.dumps(payload), q4["id"]))
        stats["derivados"] += 1

    print(f"Q4 derivados: {stats['derivados']} | não derivável: {stats['nao_derivavel']} "
          f"| não reconcilia: {stats['nao_reconcilia']} | períodos em falta: "
          f"{stats['periodos_em_falta']}")

    if updates and not args.dry_run:
        cur.executemany(
            'UPDATE fundamentals SET "revenueSegments" = %s, "revenueSegmentsByAxis" = %s '
            'WHERE id = %s', updates)
        conn.commit()
        print(f"{len(updates)} linhas escritas.")
    elif args.dry_run:
        print("dry-run: nada escrito.")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
