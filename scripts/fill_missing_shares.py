#!/usr/bin/env python3
"""
fill_missing_shares.py — preenche sharesOutstanding onde o companyfacts não o tem.

O PORQUÊ (medido na Berkshire, 2026-08-16):
  O ingest_fundamentals.py lê a API companyfacts, que DESCARTA factos
  dimensionados. Empresas com várias classes de ações deixam de publicar o
  facto agregado e passam a publicá-lo só por classe — a partir daí o
  companyfacts fica sem nada. Na BRK.B o último
  WeightedAverageNumberOfSharesOutstandingBasic não-dimensionado é de 2014;
  de 2016 em diante (a janela da nossa BD) a coluna fica NULL, e com ela o
  P/E, a capitalização e todos os múltiplos por ação.

  O XBRL do filing TEM os valores — só que dimensionados por classe. Este
  script vai buscá-los por essa via (edgartools, o mesmo caminho do extrator
  de segmentos) e escreve só onde a BD está a NULL. Nunca sobrepõe um valor
  existente.

A REGRA DAS CLASSES (a parte delicada):
  Num período com vários valores, a decisão depende da relação entre eles.
  - Rácio > 100x  -> são a MESMA participação expressa em unidades
    diferentes (BRK: 1,4 M de Classe A equivalem a ~2,15 mM de Classe B).
    Fica o MAIOR, porque é o que casa com a série de preços do ticker
    transacionado (a BRK.B negoceia em Classe B).
  - Rácio <= 100x -> são classes distintas de tamanho comparável (GOOGL
    A/B/C). SOMA, que é o total em circulação de que a capitalização precisa.

  Cada valor escrito é validado contra `EPS x acoes ~= resultado liquido`
  quando há EPS. Se falhar por mais de 35%, NÃO escreve — antes NULL que
  errado. O relatório final lista os rejeitados.

Uso:
  python scripts/fill_missing_shares.py --tickers BRK.B        # dry-run
  python scripts/fill_missing_shares.py                        # todas as que faltam
  python scripts/fill_missing_shares.py --apply
"""
import argparse
import os
import sys
import time
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

import edgar  # noqa: E402
edgar.set_identity(os.getenv("SEC_IDENTITY", "Tiago Costa costa@engimov.pt"))

SHARE_CONCEPTS = (
    "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding",
    "us-gaap:WeightedAverageNumberOfSharesOutstandingBasic",
    "us-gaap:WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
    "us-gaap:WeightedAverageNumberOfSharesOutstandingBasicAndDiluted",
    "ifrs-full:WeightedAverageShares",
    # Variante DILUÍDA em IFRS. A Novartis e a Sanofi publicam-na (por vezes só
    # ela), e sem esta entrada os emitentes estrangeiros ficavam a zero.
    "ifrs-full:AdjustedWeightedAverageShares",
)

RACIO_CLASSES_EQUIVALENTES = 100     # acima disto é a mesma participação
TOL_EPS = 0.35                       # |eps*shares - NI| / |NI|


def combinar(valores: list) -> float | None:
    """Um número de ações a partir dos valores do período (ver docstring)."""
    vs = sorted({float(v) for v in valores if v and float(v) > 1000})
    if not vs:
        return None
    if len(vs) == 1:
        return vs[0]
    if vs[-1] / vs[0] > RACIO_CLASSES_EQUIVALENTES:
        return vs[-1]
    return sum(vs)


def shares_do_filing(filing) -> dict:
    """{(period_start, period_end): shares} a partir de UM filing."""
    try:
        x = filing.xbrl()
    except Exception:
        return {}
    if x is None:
        return {}
    try:
        df = x.query().with_dimensions().to_dataframe()
    except Exception:
        return {}
    if df is None or len(df) == 0 or "numeric_value" not in df.columns:
        return {}
    d = df[df["numeric_value"].notna()]
    if "period_start" not in d.columns:
        return {}
    d = d[d["period_start"].notna() & d["period_end"].notna()]
    d = d[d["concept"].isin(SHARE_CONCEPTS)]
    if len(d) == 0:
        return {}
    porperiodo = defaultdict(list)
    for _, r in d.iterrows():
        porperiodo[(str(r["period_start"])[:10], str(r["period_end"])[:10])].append(r["numeric_value"])
    return {k: combinar(v) for k, v in porperiodo.items() if combinar(v)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--tenks", type=int, default=12)
    ap.add_argument("--tenqs", type=int, default=40)
    ap.add_argument("--twentyfs", type=int, default=10)
    ap.add_argument("--sleep", type=float, default=0.2)
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()

    filtro, params = "", []
    if args.tickers:
        alvos = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        filtro, params = "AND c.ticker = ANY(%s)", [alvos]

    # Só empresas que TÊM buracos — não se re-extrai quem já está completo.
    cur.execute(
        f'''SELECT c.ticker, c.cik, count(*) FILTER (WHERE f."sharesOutstanding" IS NULL)
            FROM fundamentals f JOIN companies c ON c.id = f."companyId"
            WHERE c.cik IS NOT NULL {filtro}
            GROUP BY c.ticker, c.cik
            HAVING count(*) FILTER (WHERE f."sharesOutstanding" IS NULL) > 0
            ORDER BY count(*) FILTER (WHERE f."sharesOutstanding" IS NULL) DESC''',
        params,
    )
    empresas = cur.fetchall()
    print(f"{len(empresas)} empresas com sharesOutstanding em falta. dry-run={not args.apply}\n")

    tot_escritas = tot_rejeitadas = 0
    eps_derivados = [0]
    rejeitados_ex: list = []

    for i, (ticker, cik, n_falta) in enumerate(empresas, 1):
        try:
            co = edgar.Company(int(cik))
            filings = []
            for form, n in (("10-K", args.tenks), ("10-Q", args.tenqs), ("20-F", args.twentyfs)):
                if n <= 0:
                    continue
                try:
                    got = co.get_filings(form=form).latest(n)
                except Exception:
                    continue
                if got is None:
                    continue
                filings += list(got) if hasattr(got, "__len__") else [got]
            if not filings:
                print(f"[{i}/{len(empresas)}] {ticker}: sem filings", flush=True)
                continue

            shares: dict = {}
            for f in filings:
                shares.update(shares_do_filing(f))
                time.sleep(args.sleep)
            if not shares:
                print(f"[{i}/{len(empresas)}] {ticker}: 0 factos de ações no XBRL", flush=True)
                continue

            # Linhas em falta, com o que é preciso para validar.
            cur.execute(
                '''SELECT f.id, f."periodType", f."periodEnd"::date, f."netIncome", f."epsDiluted"
                   FROM fundamentals f JOIN companies c ON c.id = f."companyId"
                   WHERE c.ticker = %s AND f."sharesOutstanding" IS NULL''',
                (ticker,),
            )
            escritas = rejeitadas = 0
            for rid, ptype, pend, ni, eps in cur.fetchall():
                # Casar pela DURAÇÃO certa: anual 350-380d, trimestral 80-100d.
                lo, hi = (350, 380) if ptype == "ANNUAL" else (80, 100)
                import datetime as _dt
                cand = None
                for (ps, pe), val in shares.items():
                    if pe != pend.isoformat():
                        continue
                    dias = (_dt.date.fromisoformat(pe) - _dt.date.fromisoformat(ps)).days
                    if lo <= dias <= hi:
                        cand = val
                        break
                if cand is None:
                    continue
                # Guard: EPS x acoes tem de bater com o resultado liquido.
                if eps is not None and ni is not None and abs(float(ni)) > 1e7 and float(eps) != 0:
                    desvio = abs(float(eps) * cand - float(ni)) / abs(float(ni))
                    if desvio > TOL_EPS:
                        rejeitadas += 1
                        if len(rejeitados_ex) < 10:
                            rejeitados_ex.append(
                                f"{ticker} {pend} shares={cand:,.0f} eps={float(eps):.2f} "
                                f"NI={float(ni):,.0f} desvio={desvio:.0%}")
                        continue
                # Com as ações no sítio, o EPS em falta deriva-se: NI/acoes É a
                # definição de EPS básico. Sem isto o P/E fica nulo mesmo com as
                # ações corretas — na BRK o companyfacts também só tem EPS até
                # 2013, e em termos de Classe A. Só se escreve onde está NULL.
                eps_derivado = None
                if eps is None and ni is not None and cand:
                    eps_derivado = float(ni) / cand
                    if abs(eps_derivado) > 100_000:   # escala absurda -> não escrever
                        eps_derivado = None
                if args.apply:
                    if eps_derivado is not None:
                        cur.execute(
                            'UPDATE fundamentals SET "sharesOutstanding" = %s, '
                            '"epsDiluted" = %s WHERE id = %s',
                            (cand, round(eps_derivado, 4), rid))
                    else:
                        cur.execute('UPDATE fundamentals SET "sharesOutstanding" = %s WHERE id = %s',
                                    (cand, rid))
                if eps_derivado is not None:
                    eps_derivados[0] += 1
                escritas += 1
            if args.apply:
                conn.commit()
            tot_escritas += escritas
            tot_rejeitadas += rejeitadas
            print(f"[{i}/{len(empresas)}] {ticker}: {escritas} preenchidas, "
                  f"{rejeitadas} rejeitadas (de {n_falta} em falta)", flush=True)
        except Exception as e:
            conn.rollback()
            print(f"[{i}/{len(empresas)}] {ticker}: erro {e!r}", flush=True)

    print(f"\nTotal: {tot_escritas} preenchidas, {tot_rejeitadas} rejeitadas pelo guard EPS.")
    print(f"EPS derivado (NI/acoes) onde estava NULL: {eps_derivados[0]}")
    if rejeitados_ex:
        print("Exemplos de rejeição (NÃO escritos — antes NULL que errado):")
        for r in rejeitados_ex:
            print("  ", r)
    if not args.apply:
        print("\nDry-run — nada escrito. Correr com --apply.")
    conn.close()


if __name__ == "__main__":
    main()
