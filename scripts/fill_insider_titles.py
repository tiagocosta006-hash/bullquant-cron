"""
fill_insider_titles.py — Preenche `insider_transactions.title` a partir dos
Formulários 4 da SEC.

A tabela tem 34 207 linhas vindas do Finnhub e **zero** com cargo preenchido: o
plano gratuito não devolve esse campo. Sem ele, uma venda do CEO e uma venda de
um diretor qualquer são indistinguíveis — e é precisamente o cargo que dá sinal
a uma transação de insider.

O Formulário 4 traz o cargo declarado pelo próprio (`position`), ex.:
"SVP, GC and Secretary". Como o cargo de uma pessoa é estável ao longo do tempo,
basta construir um mapa nome→cargo por empresa e aplicá-lo às transações, em vez
de reprocessar as 34 mil linhas uma a uma.

Correspondência de nomes: o Finnhub grava "ROBESON ROSE M" e a SEC "Rose M.
Robeson". Compara-se o CONJUNTO ORDENADO de tokens alfabéticos, o que torna a
comparação imune à ordem (apelido primeiro ou último) e à pontuação.
"""

import os
import re
import sys
import time
import argparse
import datetime as _dt
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

# Sufixos e partículas que não identificam a pessoa e atrapalham o casamento.
_NOISE = {"jr", "sr", "ii", "iii", "iv", "md", "phd", "mr", "mrs", "ms", "dr"}


def name_key(name: str) -> str:
    """Chave insensível a ordem e pontuação: 'ROBESON ROSE M' == 'Rose M. Robeson'."""
    toks = [t for t in re.split(r"[^A-Za-z]+", (name or "").lower()) if t]
    toks = [t for t in toks if t not in _NOISE]
    # Iniciais soltas ('m') não distinguem pessoas e nem sempre aparecem nas duas
    # fontes — descartar quando há pelo menos dois tokens completos.
    full = [t for t in toks if len(t) > 1]
    return " ".join(sorted(full if len(full) >= 2 else toks))


def titles_from_sec(cik, limit, date_range=None):
    """{name_key: position} a partir dos Formulários 4.

    Filtra por INTERVALO DE DATAS, não pelos "N mais recentes": os executivos de
    topo transacionam com pouca frequência, pelo que Nadella, Amy Hood e Brad
    Smith ficavam de fora dos 40 filings mais recentes da Microsoft — justamente
    os nomes que mais interessa identificar.
    """
    out = {}
    try:
        co = edgar.Company(int(cik))
        got = co.get_filings(form="4", filing_date=date_range) if date_range \
            else co.get_filings(form="4").latest(limit)
    except Exception:
        return out
    if got is None:
        return out
    filings = list(got) if hasattr(got, "__len__") else [got]
    if limit:
        filings = filings[:limit]
    for f in filings:
        try:
            o = f.obj()
            nome, cargo = getattr(o, "insider_name", None), getattr(o, "position", None)
        except Exception:
            continue
        if not nome or not cargo:
            continue
        k = name_key(nome)
        # Fica o primeiro (o filing mais recente) — reflete o cargo atual.
        if k and k not in out:
            out[k] = str(cargo).strip()[:200]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--forms", type=int, default=250,
                    help="teto de Formulários 4 a ler por empresa")
    ap.add_argument("--range", default=None,
                    help="intervalo de datas 'AAAA-MM-DD:AAAA-MM-DD'; por omissão "
                         "cobre o período das transações que temos na BD")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=0.1)
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()

    # Cobrir exatamente o período das transações que temos, com folga de 90 dias
    # antes: o Formulário 4 que declara o cargo pode ser anterior à primeira
    # transação que o Finnhub nos deu.
    date_range = args.range
    if not date_range:
        cur.execute('SELECT MIN("transactionDate"), MAX("transactionDate") FROM insider_transactions')
        lo, hi = cur.fetchone()
        if lo and hi:
            date_range = f"{lo - _dt.timedelta(days=90)}:{hi + _dt.timedelta(days=30)}"
    print(f"intervalo de Formulários 4: {date_range}")

    # Só empresas que TÊM transações sem cargo — não vale a pena tocar nas outras.
    base = ('SELECT DISTINCT c.id, c.ticker, c.cik FROM companies c '
            'JOIN insider_transactions t ON t."companyId" = c.id '
            'WHERE c.cik IS NOT NULL AND t.title IS NULL')
    if args.tickers:
        wanted = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        cur.execute(base + ' AND c.ticker = ANY(%s) ORDER BY 2', (wanted,))
    else:
        cur.execute(base + ' ORDER BY 2')
    companies = cur.fetchall()

    total = len(companies)
    print(f"{total} empresas com transações sem cargo. dry-run={args.dry_run}", flush=True)
    stats = defaultdict(int)

    for i, (company_id, ticker, cik) in enumerate(companies, 1):
        try:
            mapa = titles_from_sec(cik, args.forms, date_range)
            if not mapa:
                print(f"[{i}/{total}] {ticker}: sem Formulários 4 legíveis", flush=True)
                stats["sem_form4"] += 1
                continue

            cur.execute('SELECT DISTINCT "insiderName" FROM insider_transactions '
                        'WHERE "companyId" = %s AND title IS NULL', (company_id,))
            nomes = [r[0] for r in cur.fetchall()]

            updates = []
            for nome in nomes:
                cargo = mapa.get(name_key(nome))
                if cargo:
                    updates.append((cargo, company_id, nome))

            if updates and not args.dry_run:
                cur.executemany(
                    'UPDATE insider_transactions SET title = %s, "updatedAt" = NOW() '
                    'WHERE "companyId" = %s AND "insiderName" = %s AND title IS NULL',
                    updates)
                conn.commit()

            print(f"[{i}/{total}] {ticker}: {len(updates)}/{len(nomes)} nomes com cargo", flush=True)
            stats["ok"] += 1
            stats["nomes_resolvidos"] += len(updates)
            stats["nomes_totais"] += len(nomes)
        except Exception as e:
            conn.rollback()
            print(f"[{i}/{total}] {ticker}: ERRO {e!r}", flush=True)
            stats["erro"] += 1
        time.sleep(args.sleep)

    cur.close()
    conn.close()
    print(f"\nResumo: {dict(stats)}")


if __name__ == "__main__":
    main()
