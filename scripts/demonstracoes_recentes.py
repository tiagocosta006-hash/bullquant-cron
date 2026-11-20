"""
demonstracoes_recentes.py — As linhas impressas dos filings que o DERA ainda não publicou.

Os Financial Statement Data Sets da SEC (dera_demonstracoes.py) são TRIMESTRAIS e saem
depois de o trimestre fechar: os 10-Q entregues em outubro e novembro só aparecem em
janeiro. Sem isto, durante semanas, a receita, a dívida e a caixa dos filings novos
ficavam sem as linhas impressas (receita_impressa / divida_balanco / aplicacoes_balanco)
e o motor caía só nas tags — precisamente nos filings que interessam.

Lê cada filing recente pelo XBRL do próprio filing (edgartools: a mesma ordem e os
mesmos rótulos da demonstração) e grava-o NO MESMO FORMATO do DERA, em
scripts/.cache/dera/recentes.json.gz — os três leitores apanham-no sem mudar nada.
Quando o trimestre DERA sair, o mesmo filing aparece nos dois sítios com o mesmo
conteúdo; os leitores ficam com o filing mais recente por data, por isso não duplica.

  python3 scripts/demonstracoes_recentes.py               # filings depois do último trimestre DERA
  python3 scripts/demonstracoes_recentes.py --tickers COP,XOM
"""
from __future__ import annotations

import argparse
import glob
import gzip
import json
import os
import re
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTA = os.path.join(AQUI, ".cache", "dera")
DESTINO = os.path.join(PASTA, "recentes.json.gz")
VERSAO = 2   # 2: com o cash flow (recompras impressas — fluxos_impressos.py)
_COL = re.compile(r"^(\d{4}-\d{2}-\d{2})(?: \((Q\d|FY|YTD)\))?$")


def ultimo_dia_dera() -> str:
    """Último dia coberto pelos trimestres DERA na cache (filings entregues até lá)."""
    qs = sorted(os.path.basename(f)[:6] for f in glob.glob(os.path.join(PASTA, "20??q?.json.gz")))
    if not qs:
        return "2000-01-01"
    ano, q = int(qs[-1][:4]), int(qs[-1][5])
    fim = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}[q]
    return f"{ano}-{fim}"


def linhas_do_filing(filing, moeda: str = "USD") -> list[dict]:
    """XBRL do filing → linhas no formato DERA (st, r, l, tag, propria, rot, data, q, un, v)."""
    xbrl = filing.xbrl()
    if xbrl is None:
        return []
    anual = filing.form.startswith("10-K")
    info = getattr(xbrl, "entity_info", None) or {}
    fp = str(info.get("fiscal_period") or ("FY" if anual else ""))
    q_cf = 4 if (anual or fp == "FY") else {"Q1": 1, "Q2": 2, "Q3": 3}.get(fp)
    out = []
    for st, r, fn in (("BS", 2, "balance_sheet"), ("IS", 4, "income_statement"), ("CF", 6, "cashflow_statement")):
        try:
            df = getattr(xbrl.statements, fn)().to_dataframe()
        except Exception:
            continue
        cols = [(c, _COL.match(str(c))) for c in df.columns]
        cols = [(c, m.group(1), m.group(2)) for c, m in cols if m]
        for i, row in enumerate(df.itertuples(index=False), start=1):
            rd = dict(zip(df.columns, row))
            if rd.get("abstract"):
                continue
            seg = None
            if rd.get("dimension") or rd.get("is_breakdown"):
                if st != "CF" or not rd.get("dimension_axis"):
                    continue
                seg = f"{rd.get('dimension_axis')}={rd.get('dimension_member')};"   # como no DERA
            conceito = str(rd.get("concept") or "")
            prefixo, _, tag = conceito.partition("_")
            if not tag:
                continue
            for c, data, tipo in cols:
                v = rd.get(c)
                if v is None or v != v:   # NaN
                    continue
                if st == "BS":
                    q = 0
                elif st == "CF":
                    # o cash flow é acumulado desde o início do ano: a duração vem do
                    # período fiscal do filing (Q2 → 2 trimestres), como o qtrs do DERA
                    if not q_cf:
                        continue
                    q = q_cf
                elif tipo == "YTD":
                    continue
                elif tipo == "FY" or (tipo is None and anual):
                    q = 4
                else:
                    q = 1
                linha = {"st": st, "r": r, "l": i, "tag": tag, "propria": prefixo not in ("us-gaap", "dei", "srt"),
                         "rot": str(rd.get("label") or ""), "data": data.replace("-", ""), "q": q,
                         "un": moeda, "v": float(v)}
                if seg:
                    linha["seg"] = seg
                out.append(linha)
    return out


def _gravar(cache):
    with gzip.open(DESTINO + ".tmp", "wt") as fh:
        json.dump(cache, fh)
    os.replace(DESTINO + ".tmp", DESTINO)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--desde", default=None, help="filings entregues a partir desta data (omissão: fim do DERA)")
    args = ap.parse_args()
    from edgar import Company, set_identity
    import psycopg2
    set_identity(os.getenv("SEC_IDENTITY") or os.getenv("SEC_USER_AGENT") or "BullValue admin@bullocracy.com")
    desde = args.desde or ultimo_dia_dera()
    cur = psycopg2.connect(os.getenv("DIRECT_URL", "postgresql://localhost:5432/bullquant_sec")).cursor()
    cur.execute('SELECT ticker, cik, currency FROM companies WHERE "isActive" AND cik IS NOT NULL ORDER BY ticker')
    empresas = cur.fetchall()
    if args.tickers:
        quero = set(args.tickers.split(","))
        empresas = [e for e in empresas if e[0] in quero]
    try:
        cache = json.load(gzip.open(DESTINO))
    except (OSError, ValueError):
        cache = {}
    # filings já cobertos por um trimestre DERA saem (o DERA é a fonte oficial)
    cache = {k: v for k, v in cache.items() if v["filed"] > desde.replace("-", "")
             and v.get("versao") == VERSAO}   # formato antigo (sem cash flow) → reler
    novos = 0
    for i, (ticker, cik, moeda) in enumerate(empresas, 1):
        try:
            fs = Company(int(cik)).get_filings(form=["10-K", "10-Q"], filing_date=f"{desde}:")
        except Exception as e:
            print(f"[{i}] {ticker}: erro a listar filings {e!r}", flush=True)
            continue
        for f in fs:
            adsh = str(f.accession_no)
            if adsh in cache:
                continue
            try:
                linhas = linhas_do_filing(f, moeda or "USD")
            except Exception as e:
                print(f"[{i}] {ticker} {adsh}: erro {e!r}", flush=True)
                continue
            cache[adsh] = {"cik": str(int(cik)), "form": f.form, "period": str(f.period_of_report).replace("-", ""),
                           "filed": str(f.filing_date).replace("-", ""), "linhas": linhas, "versao": VERSAO}
            novos += 1
            print(f"[{i}/{len(empresas)}] {ticker} {f.form} {f.filing_date}: {len(linhas)} linhas", flush=True)
            time.sleep(0.15)
        if novos and novos % 25 == 0:
            _gravar(cache)
    _gravar(cache)
    print(f"recentes: {len(cache)} filings (novos {novos}) desde {desde} → {DESTINO}")


if __name__ == "__main__":
    sys.exit(main())
