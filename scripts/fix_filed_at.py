"""
fix_filed_at.py — Repõe `fundamentals.filedAt` com a data REAL de submissão à SEC.

O campo estava a ser preenchido por inferência e ficou deslocado: na AAPL, o
FY2025 (período a terminar 2025-09-27) tinha filedAt 2026-05-01, quando o 10-K
foi entregue a 2025-10-31 — e o FY2023 tinha a data do 10-K de FY2025. Em toda a
tabela, 15 189 linhas (59%) tinham data mais de 120 dias após o fim do período,
o que é impossível: a SEC exige o 10-K em 60-90 dias e o 10-Q em 40-45.

A data de submissão não é cosmética — decide o que era publicamente conhecido em
cada momento, e é isso que separa uma valuation de um backtest com look-ahead.

Fonte: `filing.filing_date` do edgartools, que vem do índice da própria SEC.

Correspondência: `periodEnd` da nossa linha ↔ `period_of_report` do filing.
  - ANNUAL     → 10-K (ou 20-F para emitentes estrangeiros)
  - QUARTERLY  → 10-Q; o Q4 não tem 10-Q próprio (a SEC não o exige), pelo que
                 herda a data do 10-K do mesmo ano fiscal.
Só o filing ORIGINAL conta: para o mesmo período fica sempre a data mais antiga,
senão uma emenda (10-K/A) meses depois passaria por data de publicação.
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


def purge_edgar_cache_if_big(limit_gb: float) -> bool:
    """Esvazia a cache HTTP do edgartools se passar de `limit_gb`.

    O edgartools guarda em ~/.edgar/_tcache tudo o que descarrega e nunca limpa.
    Numa passagem por 527 empresas isso chegou a 22 GB e encheu o disco a meio da
    execução — e o pior é que a falha aparece como "sem filings", ou seja, dados
    em falta silenciosos em vez de um erro. A cache é 100% descartável (é só um
    espelho de sec.gov), por isso apagá-la só custa re-descarregar.
    """
    import shutil
    from edgar.httpclient import get_cache_directory
    try:
        cache = get_cache_directory()
        total = sum(f.stat().st_size for f in _Path(cache).rglob("*") if f.is_file())
        if total > limit_gb * 1024 ** 3:
            shutil.rmtree(cache, ignore_errors=True)
            print(f"    (cache do edgar tinha {total/1024**3:.1f} GB — limpa)", flush=True)
            return True
    except Exception as e:
        print(f"    (aviso: não consegui medir/limpar a cache: {e!r})", flush=True)
    return False

ANNUAL_FORMS = ("10-K", "20-F")
QUARTER_FORMS = ("10-Q",)
# Tolerância no casamento de datas: o period_of_report do filing e o periodEnd
# derivado do XBRL podem diferir um ou dois dias em calendários 52/53 semanas.
DATE_SLACK = _dt.timedelta(days=5)


def _as_date(v):
    if v is None:
        return None
    if isinstance(v, _dt.datetime):
        return v.date()
    if isinstance(v, _dt.date):
        return v
    try:
        return _dt.date.fromisoformat(str(v)[:10])
    except Exception:
        return None


def filing_dates_for(cik):
    """{period_of_report: filing_date} por família de formulário, só originais."""
    annual, quarterly = {}, {}
    co = edgar.Company(int(cik))
    for forms, target in ((ANNUAL_FORMS, annual), (QUARTER_FORMS, quarterly)):
        for form in forms:
            try:
                got = co.get_filings(form=form)
            except Exception:
                continue
            if got is None:
                continue
            for f in got:
                per = _as_date(getattr(f, "period_of_report", None))
                fdt = _as_date(getattr(f, "filing_date", None))
                if per is None or fdt is None:
                    continue
                # Emendas e reapresentações: fica sempre a submissão original.
                if per not in target or fdt < target[per]:
                    target[per] = fdt
    return annual, quarterly


def best_match(period_end, table):
    if period_end in table:
        return table[period_end]
    best, best_gap = None, None
    for per, fdt in table.items():
        gap = abs(per - period_end)
        if gap <= DATE_SLACK and (best_gap is None or gap < best_gap):
            best, best_gap = fdt, gap
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit-companies", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=0.1)
    ap.add_argument("--cache-limit-gb", type=float, default=4.0,
                    help="purga a cache do edgartools acima deste tamanho")
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
    print(f"{total} empresas. dry-run={args.dry_run}", flush=True)
    stats = defaultdict(int)
    seguidas_sem_filings = 0

    for i, (company_id, ticker, cik) in enumerate(companies, 1):
        try:
            annual, quarterly = filing_dates_for(cik)
            if not annual and not quarterly:
                print(f"[{i}/{total}] {ticker}: sem filings", flush=True)
                stats["sem_filings"] += 1
                # Uma empresa cotada sem QUALQUER 10-K/10-Q é raríssimo; muitas
                # seguidas significa falha sistémica (disco cheio, rede, rate
                # limit), não ausência de dados. Foi assim que um disco cheio se
                # disfarçou de "sem filings" em 23 empresas seguidas — abortar é
                # melhor do que continuar a produzir buracos silenciosos.
                seguidas_sem_filings += 1
                if seguidas_sem_filings >= 10:
                    sys.exit(f"ABORTADO: {seguidas_sem_filings} empresas seguidas sem "
                             f"filings — provável falha de ambiente, não de dados.")
                continue
            seguidas_sem_filings = 0

            cur.execute(
                'SELECT id, "periodType", "periodEnd"::date, "filedAt"::date, "fiscalYear" '
                'FROM fundamentals WHERE "companyId" = %s', (company_id,))
            rows = cur.fetchall()

            # Data do 10-K por ano fiscal, para o Q4 (que não tem 10-Q próprio).
            annual_by_fy = {}
            for rid, ptype, pend, _, fy in rows:
                if ptype == "ANNUAL":
                    d = best_match(pend, annual)
                    if d:
                        annual_by_fy[fy] = d

            updates, changed = [], 0
            for rid, ptype, pend, cur_filed, fy in rows:
                if ptype == "ANNUAL":
                    new = best_match(pend, annual)
                else:
                    new = best_match(pend, quarterly) or annual_by_fy.get(fy)
                if new is None or new == cur_filed:
                    continue
                updates.append((new, rid))
                changed += 1

            if updates and not args.dry_run:
                cur.executemany('UPDATE fundamentals SET "filedAt" = %s WHERE id = %s', updates)
                conn.commit()

            print(f"[{i}/{total}] {ticker}: {changed}/{len(rows)} datas corrigidas", flush=True)
            stats["ok"] += 1
            stats["linhas"] += changed
        except Exception as e:
            conn.rollback()
            print(f"[{i}/{total}] {ticker}: ERRO {e!r}", flush=True)
            stats["erro"] += 1
        time.sleep(args.sleep)
        if i % 25 == 0:
            purge_edgar_cache_if_big(args.cache_limit_gb)

    cur.close()
    conn.close()
    print(f"\nResumo: {dict(stats)}")


if __name__ == "__main__":
    main()
