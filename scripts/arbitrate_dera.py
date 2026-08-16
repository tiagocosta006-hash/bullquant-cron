"""
arbitrate_dera.py — Terceira fonte independente para arbitrar os fundamentais.

PORQUÊ: quando a nossa BD e o extrator XBRL discordam, não há forma de saber
qual está certo. Ao longo desta auditoria enganei-me quatro vezes por falta de
árbitro: os zeros de I&D estavam certos (seguradoras não fazem I&D), a receita
da Western Digital estava certa (reapresentação por operação descontinuada), a
da Altria também (líquida de impostos especiais), e o meu backfill de interesses
não-controlados chegou a estragar 217 linhas antes de eu pôr um guarda.

A FONTE: os *Financial Statement Data Sets* da DERA/SEC — ficheiros trimestrais
que a própria SEC extrai dos filings e publica em formato tabular. São um
caminho COMPLETAMENTE DIFERENTE do nosso: nós lemos o XBRL do filing, isto vem
já processado pela SEC. Se ambos concordarem, o valor está certo; se não, sabemos
onde olhar. Domínio público, ~128 MB por trimestre.

Estrutura dos ficheiros (dentro de cada ZIP):
  sub.txt — uma linha por filing: adsh, cik, name, form, period, fy, fp
  num.txt — uma linha por facto: adsh, tag, version, ddate, qtrs, uom, value
            `qtrs` é a duração em trimestres: 0=instante, 1=trimestre, 4=ano.
            `segments` (desde Dez/2024) marca factos dimensionais — ignoramos,
            porque queremos o consolidado.

Processa um trimestre de cada vez e apaga o ZIP a seguir: o histórico completo
são ~70 trimestres e o disco não tem de os aguentar todos ao mesmo tempo.
"""

import os
import io
import sys
import csv
import time
import zipfile
import argparse
import urllib.request
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

UA = os.getenv("SEC_IDENTITY", "Tiago Costa costa@engimov.pt")
BASE = "https://www.sec.gov/files/dera/data/financial-statement-data-sets"

# Métrica -> tags us-gaap aceites, por ordem de preferência. Deliberadamente
# ESTRITA: o objetivo não é extrair tudo, é ter um segundo valor de confiança
# para arbitrar. Onde a DERA não tiver o conceito, não opina.
METRIC_TAGS = {
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
                "RevenueFromContractWithCustomerIncludingAssessedTax",
                "RevenuesNetOfInterestExpense", "SalesRevenueNet"],
    "netIncome": ["NetIncomeLoss", "ProfitLoss"],
    "totalAssets": ["Assets"],
    "totalLiabilities": ["Liabilities"],
    "totalEquity": ["StockholdersEquity"],
    "minorityInterest": ["MinorityInterest"],
    "operatingCashFlow": ["NetCashProvidedByUsedInOperatingActivities",
                          "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment",
              "PaymentsToAcquireProductiveAssets"],
    # Necessários para corrigir o resultado como BLOCO: mudar o netIncome sem
    # mudar o EPS parte a identidade `EPS × ações ≈ resultado` e produz uma
    # linha internamente contraditória.
    "epsDiluted": ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
    "grossProfit": ["GrossProfit"],
    "operatingIncome": ["OperatingIncomeLoss"],
    # Acrescentados para desbloquear as 112 empresas com violações graves:
    #   sharesOutstanding — a ANET oscilava 80M→323M→80M entre trimestres, o que
    #     contamina EPS, P/E, capitalização e todos os múltiplos por acção.
    #   costOfRevenue     — sem ele o lucro bruto não fecha (60 empresas).
    #   longTermDebt      — dívida total menor que a de longo prazo é impossível.
    "sharesOutstanding": ["WeightedAverageNumberOfDilutedSharesOutstanding",
                          "WeightedAverageNumberOfSharesOutstandingBasic",
                          "CommonStockSharesOutstanding"],
    "costOfRevenue": ["CostOfRevenue", "CostOfGoodsAndServicesSold",
                      "CostOfGoodsSold", "CostOfServices"],
    "longTermDebt": ["LongTermDebtNoncurrent", "LongTermDebt"],
}
TAG_TO_METRIC = {t: m for m, ts in METRIC_TAGS.items() for t in ts}
TAG_RANK = {t: i for ts in METRIC_TAGS.values() for i, t in enumerate(ts)}


def quarters(n):
    """Últimos n trimestres, do mais recente para trás (ex.: '2025q3')."""
    import datetime as dt
    hoje = dt.date.today()
    y, q = hoje.year, (hoje.month - 1) // 3 + 1
    out = []
    for _ in range(n):
        q -= 1
        if q == 0:
            q, y = 4, y - 1
        out.append(f"{y}q{q}")
    return out


def fetch_quarter(qtr, ciks):
    """{(cik, ddate, qtrs, tag): valor} para os CIKs pedidos."""
    url = f"{BASE}/{qtr}.zip"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            blob = r.read()
    except Exception as e:
        print(f"  {qtr}: falhou o download ({e!r})", flush=True)
        return {}, {}

    subs, facts = {}, {}
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        # sub.txt: só os filings das NOSSAS empresas, e só relatórios periódicos.
        with z.open("sub.txt") as fh:
            for row in csv.DictReader(io.TextIOWrapper(fh, "latin-1"), delimiter="\t"):
                try:
                    cik = int(row["cik"])
                except (TypeError, ValueError):
                    continue
                if cik not in ciks or row.get("form") not in ("10-K", "10-Q", "20-F"):
                    continue
                subs[row["adsh"]] = cik

        if not subs:
            return {}, {}

        with z.open("num.txt") as fh:
            for row in csv.DictReader(io.TextIOWrapper(fh, "latin-1"), delimiter="\t"):
                adsh = row["adsh"]
                if adsh not in subs:
                    continue
                # `segments` preenchido = facto dimensional (uma fatia por
                # segmento), não o consolidado. `coreg` = subsidiária co-registada.
                if row.get("segments") or row.get("coreg"):
                    continue
                tag = row["tag"]
                if tag not in TAG_TO_METRIC:
                    continue
                uom = row.get("uom")
                # EPS vem em USD/acção e as acções em circulação em "shares";
                # as restantes métricas em USD.
                if uom not in ("USD", "USD/shares", "shares"):
                    continue
                try:
                    val = float(row["value"])
                    qtrs = int(row["qtrs"])
                except (TypeError, ValueError):
                    continue
                key = (subs[adsh], row["ddate"], qtrs, TAG_TO_METRIC[tag])
                # Empata pela ordem de preferência das tags.
                prev = facts.get(key)
                if prev is None or TAG_RANK[tag] < prev[1]:
                    facts[key] = (val, TAG_RANK[tag])
    return subs, facts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quarters", type=int, default=8)
    ap.add_argument("--tickers")
    ap.add_argument("--tol", type=float, default=0.02)
    ap.add_argument("--out", default="scripts/out/arbitragem_dera.csv")
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    if args.tickers:
        wanted = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        cur.execute('SELECT id, ticker, cik FROM companies WHERE cik IS NOT NULL '
                    'AND ticker = ANY(%s)', (wanted,))
    else:
        cur.execute('SELECT id, ticker, cik FROM companies WHERE cik IS NOT NULL')
    empresas = cur.fetchall()
    por_cik = {int(cik): (cid, tic) for cid, tic, cik in empresas}
    print(f"{len(por_cik)} empresas; a ler {args.quarters} trimestres da DERA", flush=True)

    todos = {}
    for qtr in quarters(args.quarters):
        t0 = time.time()
        subs, facts = fetch_quarter(qtr, set(por_cik))
        todos.update(facts)
        print(f"  {qtr}: {len(subs)} filings, {len(facts)} factos "
              f"({time.time()-t0:.0f}s)", flush=True)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    fh = open(args.out, "w", newline="", encoding="utf-8")
    w = csv.writer(fh)
    w.writerow(["ticker", "periodType", "periodEnd", "metrica",
                "valor_bd", "valor_dera", "racio"])

    stats = defaultdict(int)
    for cik, (cid, tic) in por_cik.items():
        cur.execute('SELECT "periodType", "periodEnd"::date, revenue, "netIncome", '
                    '"totalAssets", "totalLiabilities", "totalEquity", '
                    '"operatingCashFlow", capex, "epsDiluted", "grossProfit", '
                    '"operatingIncome", "sharesOutstanding", "costOfRevenue", '
                    '"longTermDebt" FROM fundamentals WHERE "companyId" = %s',
                    (cid,))
        for ptype, pend, *vals in cur.fetchall():
            nomes = ["revenue", "netIncome", "totalAssets", "totalLiabilities",
                     "totalEquity", "operatingCashFlow", "capex", "epsDiluted",
                     "grossProfit", "operatingIncome", "sharesOutstanding",
                     "costOfRevenue", "longTermDebt"]
            ddate = pend.strftime("%Y%m%d")
            for nome, dbval in zip(nomes, vals):
                if dbval is None:
                    continue
                # Saldos são instantâneos (qtrs=0); fluxos têm duração.
                if nome in ("totalAssets", "totalLiabilities", "totalEquity",
                            "longTermDebt"):
                    qs = [0]
                elif nome == "sharesOutstanding":
                    # A média ponderada de acções é de DURAÇÃO; o número em
                    # circulação é instantâneo. Aceitam-se os dois.
                    qs = [4, 0] if ptype == "ANNUAL" else [1, 0]
                else:
                    qs = [4] if ptype == "ANNUAL" else [1]
                for q in qs:
                    got = todos.get((cik, ddate, q, nome))
                    if not got:
                        continue
                    dera = got[0]
                    d = float(dbval)
                    if abs(dera) < 1:
                        continue
                    if abs(d - dera) / abs(dera) > args.tol:
                        w.writerow([tic, ptype, pend, nome, f"{d:.0f}",
                                    f"{dera:.0f}", f"{d/dera:.3f}"])
                        stats[f"div_{nome}"] += 1
                    else:
                        stats[f"ok_{nome}"] += 1
    fh.close()
    cur.close()
    conn.close()
    print(f"\nResumo: {dict(sorted(stats.items()))}\nCSV: {args.out}")


if __name__ == "__main__":
    main()
