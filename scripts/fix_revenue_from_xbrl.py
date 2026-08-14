"""
fix_revenue_from_xbrl.py — Repõe `fundamentals.revenue` a partir do XBRL.

A receita é escolhida no ingestor por uma lista ORDENADA de 25 conceitos, em que
o primeiro que devolver valor ganha. Para emitentes que usam conceitos próprios —
sobretudo bancos, energia e utilities — isso escolhe uma rubrica parcial: o BNY
Mellon aparecia com 693 M num trimestre em que faturou ~4 039 M, e a Western
Digital com 6,3 mM num ano de 13,0 mM.

O erro foi descoberto pelos segmentos: como cada partição é validada contra o
total consolidado do XBRL antes de ser gravada, uma soma de segmentos que não
bate com `revenue` denuncia a receita, não os segmentos. São 819 linhas em 114
empresas.

Aqui a receita é lida diretamente do XBRL, com as mesmas regras já validadas na
extração de segmentos:
  - só factos SEM dimensões (uma fatia de segmento não é o total consolidado);
  - só conceitos da lista estrita de TOTAL (uma procura por substring apanhava
    PaymentsToAcquireAvailableForSaleSecurities, que contém "sales");
  - duração real do facto a decidir ANNUAL vs QUARTERLY, não a data de fim.

Por omissão NÃO escreve: imprime e exporta as divergências para revisão. A
receita alimenta margens, FCF e valuation, pelo que a escrita exige --apply.

⚠️ NÃO USAR --apply NO ESTADO ATUAL. A escolha do valor usa `idxmax()`, ou seja
fica com o MAIOR conceito-total do período, e isso está errado em dois casos
comuns:

  - Impostos especiais. Na Altria, o maior é a receita BRUTA (24 483 M em 2023)
    e a base tem a LÍQUIDA (20 502 M), que é o número que a empresa publica como
    principal e que os analistas usam. A base está certa.
  - Reapresentações por operações descontinuadas. A Western Digital reapresentou
    2023/2024 só com operações continuadas (~6,3 mM) depois de separar a Sandisk;
    o valor original (13,0 mM) não é "mais correto", é outra base.

Dos 968 casos do relatório de 2026-08-10, 813 caem na banda 0,5-0,98× — quase
todos desta natureza. Os candidatos a erro real são os extremos: 95 com a base
acima de 1,5× e 25 abaixo de 0,5× (ex.: BNY com 693 M num trimestre de 4 035 M).

Para tornar a escrita segura, o valor tem de vir do conceito que a empresa usa na
DEMONSTRAÇÃO DE RESULTADOS — o que alimenta GrossProfit/OperatingIncome no
calculation linkbase — e não do maior facto do período. A função
_seg._total_concepts_from_calculation() já faz essa leitura e hoje só é usada
como recurso; passar a usá-la como PRIMEIRA escolha é a correção pendente.
"""

import os
import sys
import csv
import time
import argparse
import datetime as _dt
import importlib.util
from pathlib import Path as _Path
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

import edgar  # noqa: E402
edgar.set_identity(os.getenv("SEC_IDENTITY", "Tiago Costa costa@engimov.pt"))

# Reutiliza as regras já validadas do extrator de segmentos em vez de as duplicar:
# a lista estrita de conceitos-total e o recurso ao calculation linkbase.
_spec = importlib.util.spec_from_file_location(
    "seg", os.path.join(os.path.dirname(__file__), "ingest_segments_xbrl.py"))
_seg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_seg)

TOL = 0.02


def revenue_by_period(filing):
    """{(periodType, periodEnd): (valor, conceito)} do total consolidado."""
    xbrl = filing.xbrl()
    if xbrl is None:
        return {}
    df = xbrl.query().with_dimensions().to_dataframe()
    if df is None or len(df) == 0:
        return {}
    dim = [c for c in df.columns if c.startswith("dim_")]
    if dim:
        df = df[df[dim].isna().all(axis=1)]
    df = df[df["numeric_value"].notna() & df["period_start"].notna()
            & df["period_end"].notna()]
    if len(df) == 0:
        return {}

    calc_totals = None
    out = {}
    for (ps, pe), grp in df.groupby(["period_start", "period_end"]):
        try:
            days = (_dt.date.fromisoformat(str(pe)[:10])
                    - _dt.date.fromisoformat(str(ps)[:10])).days
        except Exception:
            continue
        if 85 <= days <= 100:
            ptype = "QUARTERLY"
        elif 340 <= days <= 380:
            ptype = "ANNUAL"
        else:
            continue

        # 1ª escolha: o conceito que a PRÓPRIA empresa usa na demonstração de
        # resultados, lido do calculation linkbase. É o que separa a receita
        # líquida da bruta: na Altria o maior facto é a receita COM impostos
        # especiais (24 483 M), mas o número que ela publica — e que alimenta o
        # resultado — é o líquido (20 502 M). Ficar com o maior invertia isso.
        if calc_totals is None:
            calc_totals = _seg._total_concepts_from_calculation(xbrl)
        sel = grp[grp["concept"].map(lambda c: _seg._norm(c) in calc_totals)] \
            if calc_totals else grp.iloc[0:0]
        # 2ª escolha: lista estrita de conceitos-total us-gaap.
        if len(sel) == 0:
            sel = grp[grp["concept"].map(_seg._is_total_revenue_concept)]
        if len(sel) == 0:
            continue
        r = sel.loc[sel["numeric_value"].idxmax()]
        v = float(r["numeric_value"])
        if v <= 0:
            continue
        key = (ptype, str(pe)[:10])
        # Filings recentes reapresentam períodos antigos; o mais recente manda.
        out[key] = (v, str(r["concept"]).split(":")[-1])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--tenks", type=int, default=4)
    ap.add_argument("--tenqs", type=int, default=16)
    # O --apply foi REMOVIDO de propósito. A escolha do valor usa idxmax(), que
    # está errada para impostos especiais e operações descontinuadas (ver o aviso
    # no cabeçalho). Este script fica read-only até a seleção ser reescrita com o
    # calculation linkbase; a arbitragem DERA + fix_income_block.py é o caminho
    # correto para escrever receita.
    ap.add_argument("--out", default="scripts/out/revenue_fix_report.csv")
    ap.add_argument("--sleep", type=float, default=0.2)
    args = ap.parse_args()
    args.apply = False

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    # Só empresas com divergência conhecida entre a soma dos segmentos (validada
    # contra o XBRL) e o campo revenue — é aí que há suspeita fundamentada.
    base = ('SELECT DISTINCT c.id, c.ticker, c.cik FROM companies c '
            'JOIN fundamentals f ON f."companyId" = c.id '
            'WHERE c.cik IS NOT NULL AND f."revenueSegmentsByAxis" IS NOT NULL '
            'AND f.revenue > 0 AND abs((SELECT SUM(v::numeric) FROM '
            '  jsonb_each_text(f."revenueSegments") x(k,v)) - f.revenue::numeric) '
            '  > 0.02 * f.revenue::numeric')
    if args.tickers:
        wanted = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        cur.execute(base + ' AND c.ticker = ANY(%s) ORDER BY 2', (wanted,))
    else:
        cur.execute(base + ' ORDER BY 2')
    companies = cur.fetchall()

    total = len(companies)
    print(f"{total} empresas com receita suspeita. apply={args.apply}", flush=True)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    fh = open(args.out, "w", newline="", encoding="utf-8")
    w = csv.writer(fh)
    w.writerow(["ticker", "periodType", "periodEnd", "revenue_bd", "revenue_xbrl",
                "racio", "conceito"])

    stats = defaultdict(int)
    for i, (company_id, ticker, cik) in enumerate(companies, 1):
        try:
            co = edgar.Company(int(cik))
            filings = []
            for form, n in (("10-K", args.tenks), ("10-Q", args.tenqs)):
                if n <= 0:
                    continue
                try:
                    got = co.get_filings(form=form).latest(n)
                except Exception:
                    continue
                if got is None:
                    continue
                filings += list(got) if hasattr(got, "__len__") else [got]

            def _fdate(f):
                return str(getattr(f, "filing_date", "") or "")

            xv = {}
            for f in sorted(filings, key=_fdate):
                try:
                    xv.update(revenue_by_period(f))
                except Exception:
                    continue
                time.sleep(args.sleep)
            if not xv:
                stats["sem_xbrl"] += 1
                continue

            cur.execute('SELECT id, "periodType", "periodEnd"::date, revenue '
                        'FROM fundamentals WHERE "companyId" = %s AND revenue > 0',
                        (company_id,))
            updates, n_div = [], 0
            for rid, ptype, pend, rev in cur.fetchall():
                got = xv.get((ptype, pend.isoformat()))
                if not got:
                    continue
                xval, concept = got
                d = float(rev)
                if abs(d - xval) / xval <= TOL:
                    continue
                w.writerow([ticker, ptype, pend, f"{d:.0f}", f"{xval:.0f}",
                            f"{d/xval:.3f}", concept])
                updates.append((xval, rid))
                n_div += 1

            if updates and args.apply:
                cur.executemany('UPDATE fundamentals SET revenue = %s WHERE id = %s',
                                updates)
                conn.commit()
            fh.flush()
            print(f"[{i}/{total}] {ticker}: {n_div} divergências", flush=True)
            stats["ok"] += 1
            stats["divergencias"] += n_div
        except Exception as e:
            conn.rollback()
            print(f"[{i}/{total}] {ticker}: ERRO {e!r}", flush=True)
            stats["erro"] += 1
        if i % 15 == 0:
            _seg.purge_edgar_cache_if_big(3.0)

    fh.close()
    cur.close()
    conn.close()
    print(f"\nResumo: {dict(stats)}\nCSV: {args.out}")


if __name__ == "__main__":
    main()
