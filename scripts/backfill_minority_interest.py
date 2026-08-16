"""
backfill_minority_interest.py — Preenche `fundamentals.minorityInterest` do XBRL.

Porquê: `totalEquity` guarda o capital próprio do GRUPO
(`us-gaap:StockholdersEquity`). Em empresas com participadas consolidadas isso
não fecha o balanço — no KKR, os 30,9 mM de StockholdersEquity mais 48,0 mM de
MinorityInterest dão exatamente os 78,9 mM que o filing declara como capital
total, contra 410,1 mM de ativo e 328,5 mM de passivo. Sem o campo, 534 linhas
anuais (10,5%) violavam Ativo = Passivo + Capital Próprio.

Mantém-se separado em vez de inflar `totalEquity` para o ROE continuar a usar o
capital do grupo, que é a convenção.

O ingestor já foi alterado para o preencher daqui para a frente; este script trata
do histórico sem esperar por uma re-ingestão completa.

Só escreve onde ainda está NULL — nunca sobrepõe valor existente.
"""

import os
import sys
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

# Ordem de preferência. MinorityInterest é o conceito us-gaap canónico; os
# restantes cobrem emitentes que usam variantes próprias (a BX usa
# MinorityInterestInOperatingPartnerships).
NCI_CONCEPTS = (
    "MinorityInterest",
    "StockholdersEquityAttributableToNoncontrollingInterest",
    "MinorityInterestInOperatingPartnerships",
)

# Capital REDIMÍVEL (mezanino): fica ENTRE o passivo e o capital próprio, e não
# entra em nenhum dos dois. Explica a maioria dos desvios que sobravam no
# balanço — a S&P Global tem 4 917 M de participação redimível nos Índices, que
# era exatamente o desvio de 4,9 mM; a BlackRock idem. Sem este componente a
# identidade `Ativo = Passivo + Capital Próprio + NCI` não pode fechar.
REDEEMABLE_CONCEPTS = (
    "RedeemableNoncontrollingInterestEquityCarryingAmount",
    "RedeemableNoncontrollingInterestEquityFairValue",
    "TemporaryEquityCarryingAmountAttributableToParent",
    "TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests",
)


def purge_cache_if_big(limit_gb=3.0):
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


def nci_by_date(cik, tenks, tenqs=0):
    """{data_do_saldo: valor} — NCI é um SALDO, logo vive em factos instantâneos.

    Os 10-K só trazem as datas de balanço ANUAIS (e o comparativo do ano
    anterior), pelo que sem 10-Q as ~12 700 linhas trimestrais ficavam todas por
    cobrir — eram 1 147 das 1 268 violações de balanço.
    """
    out = {}
    redimivel = {}
    co = edgar.Company(int(cik))
    filings = []
    for form, n in (("10-K", tenks), ("20-F", 2), ("10-Q", tenqs)):
        if n <= 0:
            continue
        try:
            got = co.get_filings(form=form).latest(n)
        except Exception:
            continue
        if got is None:
            continue
        filings += list(got) if hasattr(got, "__len__") else [got]

    for f in filings:
        try:
            xbrl = f.xbrl()
            if xbrl is None:
                continue
            df = xbrl.query().with_dimensions().to_dataframe()
        except Exception:
            continue
        if df is None or len(df) == 0 or "period_instant" not in df.columns:
            continue
        # Só factos SEM dimensões: uma fatia por segmento não é o NCI consolidado.
        dim = [c for c in df.columns if c.startswith("dim_")]
        if dim:
            df = df[df[dim].isna().all(axis=1)]
        df = df[df["numeric_value"].notna() & df["period_instant"].notna()]
        if len(df) == 0:
            continue
        short = df["concept"].str.split(":").str[-1]

        # 1ª escolha: DERIVAR de (capital total − capital do grupo). É exato por
        # definição e imune a emitentes que usam conceitos próprios — a BX
        # publica MinorityInterestInOperatingPartnerships, que é só uma PARTE
        # dos seus NCI e deixava 8,6 mM do balanço por explicar.
        incl = df[short == "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]
        parent = df[short == "StockholdersEquity"]
        if len(incl) and len(parent):
            a = incl.groupby("period_instant")["numeric_value"].max()
            b = parent.groupby("period_instant")["numeric_value"].max()
            for pi in a.index.intersection(b.index):
                v = float(a[pi]) - float(b[pi])
                if v > 0:
                    out.setdefault(str(pi)[:10], v)

        # 2ª escolha: o conceito declarado, quando o capital total não existe.
        for concept in NCI_CONCEPTS:
            sel = df[short == concept]
            if len(sel) == 0:
                continue
            for pi, grp in sel.groupby("period_instant"):
                out.setdefault(str(pi)[:10], float(grp["numeric_value"].abs().max()))
            break

        # SOMAR o capital redimível ao que já se tem: é uma parcela ADICIONAL do
        # lado direito do balanço, não uma alternativa.
        for concept in REDEEMABLE_CONCEPTS:
            sel = df[short == concept]
            if len(sel) == 0:
                continue
            for pi, grp in sel.groupby("period_instant"):
                d = str(pi)[:10]
                red = float(grp["numeric_value"].abs().max())
                redimivel.setdefault(d, red)
            break
    for d, red in redimivel.items():
        out[d] = out.get(d, 0.0) + red
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--tenks", type=int, default=4)
    ap.add_argument("--tenqs", type=int, default=0,
                    help="10-Q a ler; necessário para as datas de balanço TRIMESTRAIS")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=0.2)
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    # Só empresas onde o balanço NÃO fecha — é aí que o NCI faz falta.
    base = ('SELECT DISTINCT c.id, c.ticker, c.cik FROM companies c '
            'JOIN fundamentals f ON f."companyId" = c.id '
            # Inclui linhas que JÁ têm um valor: a S&P Global tinha 0,1 mM de
            # NCI permanente mas faltavam-lhe 4,9 mM de participação redimível.
            # O guarda de "só escrever se melhorar" decide se vale a pena trocar.
            'WHERE c.cik IS NOT NULL '
            'AND f."totalAssets" > 0 AND f."totalLiabilities" IS NOT NULL '
            'AND f."totalEquity" IS NOT NULL '
            'AND abs(f."totalAssets" - (f."totalLiabilities" + f."totalEquity" '
            '        + COALESCE(f."minorityInterest", 0))) > 0.02 * f."totalAssets"')
    if args.tickers:
        wanted = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        cur.execute(base + ' AND c.ticker = ANY(%s) ORDER BY 2', (wanted,))
    else:
        cur.execute(base + ' ORDER BY 2')
    companies = cur.fetchall()

    total = len(companies)
    print(f"{total} empresas com balanço por fechar. dry-run={args.dry_run}", flush=True)
    stats = defaultdict(int)

    for i, (company_id, ticker, cik) in enumerate(companies, 1):
        try:
            mapa = nci_by_date(cik, args.tenks, args.tenqs)
            if not mapa:
                print(f"[{i}/{total}] {ticker}: sem NCI no XBRL", flush=True)
                stats["sem_nci"] += 1
                continue

            cur.execute('SELECT id, "periodEnd"::date, "totalAssets", "totalLiabilities", '
                        '"totalEquity", "minorityInterest" FROM fundamentals '
                        'WHERE "companyId" = %s', (company_id,))
            updates = []
            for rid, pend, ta, tl, te, nci_atual in cur.fetchall():
                v = mapa.get(pend.isoformat())
                if v is None:
                    continue
                # GUARDA: só escrever se o NCI APROXIMAR o balanço do fecho.
                # Em empresas cujo `totalEquity` já é a variante que INCLUI os
                # interesses não-controlados (a lista de conceitos do ingestor
                # aceita ambas), somá-los outra vez conta-os em duplicado e o
                # passivo+capital passa a exceder o ativo — foi o que aconteceu
                # na HCA, com o gap a ficar negativo em 2,3 mM.
                if ta is not None and tl is not None and te is not None and ta > 0:
                    base_nci = float(nci_atual) if nci_atual is not None else 0.0
                    sem = abs(float(ta) - (float(tl) + float(te) + base_nci))
                    com = abs(float(ta) - (float(tl) + float(te) + float(v)))
                    if com >= sem:
                        continue
                updates.append((v, rid))

            if updates and not args.dry_run:
                cur.executemany('UPDATE fundamentals SET "minorityInterest" = %s WHERE id = %s',
                                updates)
                conn.commit()
            print(f"[{i}/{total}] {ticker}: {len(updates)} linhas", flush=True)
            stats["ok"] += 1
            stats["linhas"] += len(updates)
        except Exception as e:
            conn.rollback()
            print(f"[{i}/{total}] {ticker}: ERRO {e!r}", flush=True)
            stats["erro"] += 1
        time.sleep(args.sleep)
        if i % 15 == 0:
            purge_cache_if_big()

    cur.close()
    conn.close()
    print(f"\nResumo: {dict(stats)}")


if __name__ == "__main__":
    main()
