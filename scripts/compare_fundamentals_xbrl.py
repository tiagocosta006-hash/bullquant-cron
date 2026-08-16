"""
compare_fundamentals_xbrl.py — Compara os fundamentais da BD com o XBRL, SEM ESCREVER.

Motivação: o `ingest_fundamentals.py` escolhe o conceito XBRL de cada métrica a
partir de listas ORDENADAS mantidas à mão (58 métricas, 239 conceitos), em que o
primeiro conceito que devolve valor ganha. A ordem é a lógica de negócio, e só
uma dessas 58 métricas tem teste que a proteja. O resultado são 847 violações de
identidades contabilísticas e 338 linhas onde o total de receita do XBRL discorda
do campo `revenue`.

Este script não corrige nada — produz a EVIDÊNCIA para decidir. Para cada
empresa/período compara o valor da BD com o que o XBRL diz, usando duas fontes
autoritárias em vez de listas:

  1. Factos não-dimensionados do período (o valor consolidado tal como reportado).
  2. O calculation linkbase, que declara a árvore de cálculo da própria empresa
     com pesos ±1 — é ele que diz quais os componentes de "Investing Activities"
     (o capex real, que na AEP são TRÊS conceitos e não um) e qual o conceito de
     receita total daquela empresa (o JPM usa RevenuesNetOfInterestExpense).

Métricas cobertas, escolhidas por terem dano medido:
  revenue      — 338 linhas divergentes já identificadas pelos segmentos
  capex        — 855 zeros fabricados; listas com 26 conceitos concorrentes
  totalEquity  — 534 balanços que não fecham (interesses não-controlados em falta)

Saída: CSV com uma linha por divergência (ticker, período, valor BD, valor XBRL,
conceito usado pelo XBRL, rácio), para revisão humana antes de qualquer escrita.
"""

import os
import sys
import csv
import time
import argparse
import datetime as _dt
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

TOL = 0.02  # divergência relativa a partir da qual se reporta

REVENUE_TOTALS = {
    "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "RevenuesNetOfInterestExpense", "SalesRevenueNet",
    "SalesRevenueGoodsNet", "SalesRevenueServicesNet",
}

# Capex por PADRÃO SEMÂNTICO, não por lista de conceitos exatos.
#
# A lista exata falhava por ser sempre incompleta: a AvalonBay ficava com
# `PaymentsForCapitalImprovements` (178 M) e perdia
# `PaymentsToDevelopRealEstateAssets` (900 M), porque desenvolver imóveis é o
# capex principal de um REIT. Os padrões abaixo apanham a família toda —
# imobiliário, construção, ativos produtivos, petróleo e gás, software — em vez
# de exigir que cada variante esteja escrita à mão.
#
# O linkbase diz quais são as saídas de investimento; estes padrões separam as
# que são investimento no NEGÓCIO das que são aplicação de tesouraria (comprar
# títulos não é capex, mesmo sendo saída de investimento).
CAPEX_PATTERNS = (
    "propertyplantandequipment", "productiveassets", "capitalimprovements",
    "constructioninprocess", "realestate", "oilandgas", "nuclearfuel",
    "capitalexpenditure", "developsoftware", "internalusesoftware",
    "acquireandevelop", "leasingcosts", "tenantimprovements",
)

# Saídas de investimento que NÃO são capex: aplicações financeiras, aquisições
# de empresas e empréstimos concedidos.
NON_CAPEX_PATTERNS = (
    "securities", "investments", "businesses", "businesstwo", "acquiree",
    "loansreceivable", "notesreceivable", "advancesto", "affiliate",
    "equitymethod", "certificatesofdeposit", "marketablesecurities",
    "otherinvestingactivities", "restrictedcash", "insurance",
)


def _is_capex_concept(short_name: str) -> bool:
    n = short_name.lower()
    if any(p in n for p in NON_CAPEX_PATTERNS):
        return False
    return any(p in n for p in CAPEX_PATTERNS)


EQUITY_WITH_NCI = "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"
EQUITY_PARENT = "StockholdersEquity"


def purge_cache_if_big(limit_gb=4.0):
    """A cache do edgartools nunca se limpa e já encheu um disco a meio de uma
    passagem — e a falha aparece como 'sem filings', ou seja, buraco silencioso."""
    import shutil
    from edgar.httpclient import get_cache_directory
    try:
        cache = get_cache_directory()
        total = sum(f.stat().st_size for f in _Path(cache).rglob("*") if f.is_file())
        if total > limit_gb * 1024 ** 3:
            shutil.rmtree(cache, ignore_errors=True)
            print(f"    (cache {total/1024**3:.1f} GB — limpa)", flush=True)
    except Exception:
        pass


def _short(concept):
    """Nome do conceito sem namespace.

    O separador difere conforme a origem: o dataframe de factos usa
    `us-gaap:Foo` e o calculation linkbase usa `us-gaap_Foo`. Cortar só no ":"
    deixava os nomes do linkbase com o prefixo colado e a interseção com a lista
    de capex dava sempre vazia — daí o comparador reportar ZERO divergências de
    capex, que eu li como "não há problemas" quando era "não cheguei a comparar".
    """
    c = str(concept)
    if ":" in c:
        return c.split(":", 1)[1]
    if "_" in c:
        return c.split("_", 1)[1]
    return c


def investing_outflows(xbrl):
    """Conceitos que o calculation linkbase declara como saídas de investimento."""
    out = set()
    for role, tree in (getattr(xbrl, "calculation_trees", None) or {}).items():
        rl = role.lower().replace("_", "")
        if "cashflow" not in rl and "cashflows" not in rl:
            continue
        for nid, node in (getattr(tree, "all_nodes", None) or {}).items():
            parent = str(getattr(node, "parent", "") or "")
            if "InvestingActivities" not in parent:
                continue
            try:
                w = float(getattr(node, "weight", 1.0) or 1.0)
            except Exception:
                w = 1.0
            if w < 0:  # saída de caixa
                out.add(_short(nid))
    return out


def xbrl_values(filing):
    """{(ptype, period_end): {metrica: (valor, conceito)}} de um filing."""
    xbrl = filing.xbrl()
    if xbrl is None:
        return {}
    # with_dimensions() é obrigatório: sem ele o dataframe TRAZ na mesma os
    # factos dimensionais, só que sem as colunas que permitem distingui-los — e
    # uma fatia de segmento passa por total consolidado (a AEP aparecia com
    # 270 M de receita trimestral em vez de 5 055 M). O total é, por definição,
    # o facto SEM nenhuma dimensão preenchida.
    df = xbrl.query().with_dimensions().to_dataframe()
    if df is None or len(df) == 0:
        return {}
    df = df[df["numeric_value"].notna()]
    dim_cols = [c for c in df.columns if c.startswith("dim_")]
    if dim_cols:
        df = df[df[dim_cols].isna().all(axis=1)]
    if len(df) == 0:
        return {}
    outflows = investing_outflows(xbrl)

    res = {}
    for (ps, pe), grp in df[df["period_start"].notna()].groupby(["period_start", "period_end"]):
        try:
            days = (_dt.date.fromisoformat(str(pe)[:10])
                    - _dt.date.fromisoformat(str(ps)[:10])).days
        except Exception:
            continue
        ptype = "QUARTERLY" if 85 <= days <= 100 else ("ANNUAL" if 340 <= days <= 380 else None)
        if not ptype:
            continue
        vals = {}

        rev = grp[grp["concept"].map(lambda c: _short(c) in REVENUE_TOTALS)]
        if len(rev):
            r = rev.loc[rev["numeric_value"].idxmax()]
            vals["revenue"] = (float(r["numeric_value"]), _short(r["concept"]))

        # Capex = SOMA dos componentes declarados como saída de investimento.
        cap = grp[grp["concept"].map(
            lambda c: _short(c) in outflows and _is_capex_concept(_short(c)))]
        if len(cap):
            per_concept = cap.groupby("concept")["numeric_value"].max()
            vals["capex"] = (float(per_concept.sum()),
                             "+".join(sorted(_short(c) for c in per_concept.index)))
        res[(ptype, str(pe)[:10])] = vals

    # Capital próprio é um SALDO (instantâneo), não um fluxo.
    inst = df[df["period_instant"].notna()] if "period_instant" in df.columns else df.iloc[0:0]
    for pi, grp in inst.groupby("period_instant"):
        eq = grp[grp["concept"].map(lambda c: _short(c) == EQUITY_WITH_NCI)]
        if not len(eq):
            eq = grp[grp["concept"].map(lambda c: _short(c) == EQUITY_PARENT)]
        if not len(eq):
            continue
        e = eq.loc[eq["numeric_value"].idxmax()]
        key_date = str(pi)[:10]
        for k in list(res):
            if k[1] == key_date:
                res[k]["totalEquity"] = (float(e["numeric_value"]), _short(e["concept"]))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--limit-companies", type=int, default=0)
    ap.add_argument("--tenks", type=int, default=2)
    ap.add_argument("--out", default="scripts/out/fundamentals_vs_xbrl.csv")
    ap.add_argument("--sleep", type=float, default=0.2)
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    if args.tickers:
        wanted = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        cur.execute('SELECT id, ticker, cik FROM companies WHERE cik IS NOT NULL '
                    'AND ticker = ANY(%s) ORDER BY ticker', (wanted,))
    else:
        cur.execute('SELECT id, ticker, cik FROM companies WHERE cik IS NOT NULL ORDER BY ticker')
    companies = cur.fetchall()
    if args.limit_companies:
        companies = companies[: args.limit_companies]

    total = len(companies)
    print(f"{total} empresas. NADA será escrito na BD.", flush=True)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    fh = open(args.out, "w", newline="", encoding="utf-8")
    w = csv.writer(fh)
    w.writerow(["ticker", "periodType", "periodEnd", "metrica",
                "valor_bd", "valor_xbrl", "racio", "conceito_xbrl"])

    stats = defaultdict(int)
    for i, (company_id, ticker, cik) in enumerate(companies, 1):
        try:
            co = edgar.Company(int(cik))
            got = co.get_filings(form="10-K").latest(args.tenks)
            filings = [] if got is None else (list(got) if hasattr(got, "__len__") else [got])
            if not filings:
                stats["sem_filings"] += 1
                continue

            xv = {}
            for f in filings:
                try:
                    xv.update(xbrl_values(f))
                except Exception:
                    continue
                time.sleep(args.sleep)

            cur.execute('SELECT "periodType", "periodEnd"::date, revenue, capex, "totalEquity" '
                        'FROM fundamentals WHERE "companyId" = %s', (company_id,))
            n = 0
            for ptype, pend, rev, cap, eq in cur.fetchall():
                key = (ptype, pend.isoformat())
                if key not in xv:
                    continue
                for metric, dbval in (("revenue", rev), ("capex", cap), ("totalEquity", eq)):
                    if metric not in xv[key] or dbval is None:
                        continue
                    xval, concept = xv[key][metric]
                    d, x = abs(float(dbval)), abs(float(xval))
                    if x <= 0:
                        continue
                    if abs(d - x) / x > TOL:
                        w.writerow([ticker, ptype, pend, metric, f"{d:.0f}", f"{x:.0f}",
                                    f"{d/x:.3f}" if x else "", concept])
                        n += 1
                        stats[f"div_{metric}"] += 1
            fh.flush()
            print(f"[{i}/{total}] {ticker}: {n} divergências", flush=True)
            stats["ok"] += 1
        except Exception as e:
            print(f"[{i}/{total}] {ticker}: ERRO {e!r}", flush=True)
            stats["erro"] += 1
        if i % 25 == 0:
            purge_cache_if_big()

    fh.close()
    cur.close()
    conn.close()
    print(f"\nResumo: {dict(stats)}\nCSV: {args.out}")


if __name__ == "__main__":
    main()
