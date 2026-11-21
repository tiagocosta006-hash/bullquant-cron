"""
dera_demonstracoes.py — As linhas IMPRESSAS das demonstrações financeiras, de todos os filings.

PORQUÊ: o companyfacts (a nossa fonte principal) não traz as tags próprias de
cada empresa nem os factos com dimensões. Por isso falha a dívida da EXR, da
WRB, da Ford, da CAT... em todos esses casos o valor certo estava IMPRESSO numa
linha do balanço, com uma tag própria. Os *Financial Statement Data Sets* da SEC
(DERA) trazem, por filing:
  pre.txt — cada linha de cada demonstração: demonstração (BS/IS/CF), ordem,
            tag (incluindo as próprias da empresa) e o RÓTULO impresso;
  num.txt — o valor de cada tag em cada data.
Juntando os dois temos o balanço tal como aparece no relatório, linha a linha.

Guarda só as empresas da base e só as três demonstrações principais, num ficheiro
pequeno por trimestre (scripts/.cache/dera/AAAAqN.json.gz). Cada ZIP (~100 MB) é
apagado logo a seguir.

  python3 scripts/dera_demonstracoes.py 2016q1 2026q3    # intervalo de trimestres
"""
import csv
import gzip
import io
import json
import os
import sys
import time
import urllib.request
import zipfile

import psycopg2

csv.field_size_limit(10_000_000)
AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, ".cache", "dera")
URL = "https://www.sec.gov/files/dera/data/financial-statement-data-sets/{q}.zip"
UA = os.getenv("SEC_USER_AGENT") or os.getenv("SEC_IDENTITY") or "BullValue admin@bullocracy.com"
STMTS = {"BS", "IS", "CF"}
# v2 (20/11/2026): linhas do cash flow com dimensões ("seg"). Os trimestres feitos
# com o formato antigo são refeitos uma vez.
VERSAO = "v2"


def trimestres(de, ate):
    a, qa = int(de[:4]), int(de[-1])
    b, qb = int(ate[:4]), int(ate[-1])
    while (a, qa) <= (b, qb):
        yield f"{a}q{qa}"
        qa += 1
        if qa == 5:
            a, qa = a + 1, 1


def ciks_da_base():
    url = os.getenv("DIRECT_URL", "postgresql://localhost:5432/bullquant_sec")
    con = psycopg2.connect(url)
    cur = con.cursor()
    cur.execute("SELECT cik FROM companies WHERE cik IS NOT NULL")
    out = {str(int(c)) for (c,) in cur.fetchall()}
    con.close()
    return out


def ler_tsv(z, nome):
    with z.open(nome) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"), delimiter="\t")


def processar(q, ciks):
    destino = os.path.join(SAIDA, f"{q}.json.gz")
    marca = os.path.join(SAIDA, f"{q}.{VERSAO}")
    if os.path.exists(destino) and os.path.exists(marca):
        return "já feito"
    zpath = os.path.join(SAIDA, f"{q}.zip")
    req = urllib.request.Request(URL.format(q=q), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=600) as r, open(zpath, "wb") as fh:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                fh.write(b)
    except Exception as e:  # noqa: BLE001
        if os.path.exists(zpath):
            os.remove(zpath)
        return f"ERRO download {e}"
    try:
        z = zipfile.ZipFile(zpath)
        subs = {}
        for s in ler_tsv(z, "sub.txt"):
            if s["cik"] in ciks and s["form"] in ("10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F"):
                subs[s["adsh"]] = {"cik": s["cik"], "form": s["form"], "period": s["period"], "fy": s["fy"],
                                   "fp": s["fp"], "filed": s["filed"], "linhas": []}
        pres = {}
        for p in ler_tsv(z, "pre.txt"):
            if p["adsh"] in subs and p["stmt"] in STMTS:
                pres.setdefault((p["adsh"], p["tag"], p["version"]), []).append(
                    (p["stmt"], int(p["report"] or 0), int(p["line"] or 0), p["plabel"], p["negating"] == "1"))
        for n in ler_tsv(z, "num.txt"):
            k = (n["adsh"], n["tag"], n["version"])
            if k not in pres or n.get("coreg") or not n["value"]:
                continue
            for stmt, rep, linha, rotulo, neg in pres[k]:
                # Valores com dimensões: só no cash flow, marcados com "seg". Há linhas
                # impressas cujo valor SÓ existe por membro (TSN: recompras só na classe A)
                # — sem elas, "a linha não está no cash flow" seria falso.
                if n.get("segments") and stmt != "CF":
                    continue
                linha_out = {
                    "st": stmt, "r": rep, "l": linha, "tag": n["tag"],
                    "propria": n["version"] == n["adsh"],  # tag criada pela empresa
                    "rot": rotulo, "neg": neg, "data": n["ddate"], "q": int(n["qtrs"]),
                    "un": n["uom"], "v": float(n["value"])}
                if n.get("segments"):
                    linha_out["seg"] = n["segments"]
                subs[n["adsh"]]["linhas"].append(linha_out)
        z.close()
    finally:
        os.remove(zpath)
    with gzip.open(destino + ".tmp", "wt") as fh:
        json.dump(subs, fh, separators=(",", ":"))
    os.replace(destino + ".tmp", destino)
    open(marca, "w").close()
    return f"{len(subs)} filings, {sum(len(s['linhas']) for s in subs.values())} linhas"


def main():
    de, ate = sys.argv[1], sys.argv[2]
    os.makedirs(SAIDA, exist_ok=True)
    ciks = ciks_da_base()
    for q in trimestres(de, ate):
        t = time.time()
        print(f"{q}: {processar(q, ciks)} ({time.time() - t:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
