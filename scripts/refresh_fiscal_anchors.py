#!/usr/bin/env python3
"""
refresh_fiscal_anchors.py — gera scripts/fiscal_anchors.json (read-only, sem escrita na BD).

PORQUÊ ISTO EXISTE
------------------
O `validate_period_identity.py` só faz verificações RELATIVAS: compara os trimestres com
as anuais da própria empresa. Uma translação UNIFORME de todo o histórico é auto-consistente
e passa-lhe despercebida. Foi assim que a TJX e a STZ ficaram um ano ao lado em produção
sem o gate dar sinal (ver docs/audit/db-state-2026-08-05.md §11).

Nenhuma regra derivada só da BD consegue distinguir os dois casos: a HD chama "fiscal 2025"
ao exercício que fecha em fevereiro de 2026, e a TJX chama "fiscal 2026" ao que fecha em
janeiro de 2026. Ambas têm fecho em jan/fev. **A convenção é uma escolha de cada emitente**
e só a própria empresa a pode dizer.

A âncora é, por isso, o `fy` que a SEC traz no facto ORIGINAL do 10-K mais recente — o
relatório onde a empresa se auto-numera. Guardamos (end, fy) por ticker e o gate extrapola
por distância em anos, o que tolera calendários de 52/53 semanas.

O ficheiro é gerado aqui e COMMITADO, para o CI validar sem depender da rede da SEC.
Regenerar quando uma empresa mudar de convenção ou entrarem tickers novos.

Uso:
  python scripts/refresh_fiscal_anchors.py              # todas as empresas com cik
  python scripts/refresh_fiscal_anchors.py --tickers TJX,STZ
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request

import psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, "..", ".env"))

OUT_PATH = os.path.join(HERE, "fiscal_anchors.json")
CACHE = os.path.join(HERE, ".cache", "companyconcept")
UA = {"User-Agent": os.getenv("SEC_USER_AGENT", "BullValue contacto@thebullvalue.com")}
ANNUAL_FORMS = ("10-K", "20-F", "40-F")
# Mesma ordem de preferência do ingestor. O primeiro tag que dê uma âncora ganha.
TAGS = (
    "NetIncomeLoss",
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "ProfitLoss",
)


def fetch_concept(cik: str, tag: str) -> dict | None:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"CIK{cik}-{tag}.json")
    if os.path.exists(path):
        try:
            return json.load(open(path))
        except Exception:
            pass
    url = f"https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/us-gaap/{tag}.json"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            open(path, "wb").write(b"{}")  # marca como inexistente
            return {}
        return None
    except Exception:
        return None
    finally:
        time.sleep(0.12)  # SEC: máx. 10 req/s
    open(path, "wb").write(raw)
    try:
        return json.loads(raw)
    except Exception:
        return None


def anchor_from_concept(doc: dict) -> tuple[str, int] | None:
    """(end, fy) do facto anual ORIGINAL mais recente vindo de um relatório anual."""
    best = None
    for entries in (doc.get("units") or {}).values():
        if not isinstance(entries, list):
            continue
        for e in entries:
            form = e.get("form") or ""
            if not form.startswith(ANNUAL_FORMS) or "start" not in e:
                continue
            fy, filed = e.get("fy"), e.get("filed")
            if not (fy and filed):
                continue
            try:
                end = datetime.date.fromisoformat(e["end"])
                start = datetime.date.fromisoformat(e["start"])
                gap = (datetime.date.fromisoformat(filed) - end).days
            except (ValueError, TypeError):
                continue
            if not (350 <= (end - start).days <= 380):
                continue
            # Original, não comparativo: relatório anual arquivado logo após o fecho.
            if 0 <= gap < 120 and (best is None or end > best[0]):
                best = (end, int(fy))
    return (best[0].isoformat(), best[1]) if best else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", help="lista separada por vírgulas; omitir = todas")
    args = ap.parse_args()

    dsn = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not dsn:
        print("DIRECT_URL/DATABASE_URL em falta")
        return 2

    where, params = "cik IS NOT NULL", []
    if args.tickers:
        where += " AND ticker = ANY(%s)"
        params.append([t.strip().upper() for t in args.tickers.split(",")])

    conn = psycopg2.connect(dsn)
    with conn.cursor() as cur:
        cur.execute(f"SELECT ticker, cik FROM companies WHERE {where} ORDER BY ticker", params)
        rows = cur.fetchall()
    conn.close()

    anchors: dict = {}
    overrides: dict = {}
    if os.path.exists(OUT_PATH):
        try:
            prev = json.load(open(OUT_PATH)) or {}
            anchors = prev.get("anchors", {})
            # Os overrides são trabalho HUMANO revisto — uma regeneração nunca os
            # pode deitar fora, senão a correção da CRM (e futuras) evapora-se em
            # silêncio na próxima vez que alguém corre este script.
            overrides = prev.get("overrides", {})
        except Exception:
            anchors, overrides = {}, {}

    ok = miss = 0
    for i, (ticker, cik) in enumerate(rows, 1):
        found = None
        for tag in TAGS:
            doc = fetch_concept(str(cik).zfill(10), tag)
            if doc:
                found = anchor_from_concept(doc)
                if found:
                    break
        if found:
            anchors[ticker] = {"end": found[0], "fy": found[1]}
            ok += 1
        else:
            miss += 1
            print(f"  {ticker}: sem âncora fiável na SEC")
        if i % 50 == 0:
            print(f"  … {i}/{len(rows)}")

    payload = {
        "_doc": (
            "Âncora fiscal por emitente: (end, fy) do facto anual ORIGINAL mais recente "
            "declarado pela própria empresa à SEC. Ground truth para detetar translações "
            "UNIFORMES do fiscalYear, que o validate_period_identity.py não vê por só fazer "
            "verificações relativas. Regenerar com scripts/refresh_fiscal_anchors.py."
        ),
        "_overrides_doc": (
            "Emitentes cujo campo `fy` do XBRL da SEC NÃO bate com o nome que a própria "
            "empresa usa. O override vence a âncora automática e SOBREVIVE a regenerações. "
            "Rever um a um, com prova, antes de acrescentar."
        ),
        "overrides": dict(sorted(overrides.items())),
        "anchors": dict(sorted(anchors.items())),
    }
    json.dump(payload, open(OUT_PATH, "w"), ensure_ascii=False, indent=2)
    print(f"\n{ok} âncoras escritas, {miss} sem âncora → {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
