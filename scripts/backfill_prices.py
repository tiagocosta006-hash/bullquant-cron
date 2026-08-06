"""
Backfill do histórico de preços PARA TRÁS.

Porque é que isto existe em vez de se correr o ingest_prices.py:
o `ingest_prices.py` é incremental e só sabe avançar — calcula
`from_date = MAX(date) + 1 dia`, portanto por muitas vezes que corra nunca
aprofunda o histórico. A tabela `prices` foi semeada pelo `restore_prices.py`
com `yf.download(period="5y")` hard-coded, e é essa a única razão pela qual
todas as empresas começam em 2021-07. Não houve limite de espaço: os docs
(`docs/04-dados.md`) orçamentam 15 anos e ~3,8M linhas como o alvo normal.

Base de ajustamento: `auto_adjust=False` devolve o Close **ajustado a splits**
mas não a dividendos — exatamente a mesma base do que já está gravado
(verificado: NVDA 2022-06-03 = 18,72 na BD e na fonte, já a refletir o split
10:1 de 2024). Manter esta flag é o que impede degraus falsos no gráfico.

Uso:
    python scripts/backfill_prices.py                 # 15 anos, todas as empresas
    python scripts/backfill_prices.py --years 10
    python scripts/backfill_prices.py --tickers AAPL,MSFT
    python scripts/backfill_prices.py --dry-run
"""

import os
import sys
import math
import argparse
import datetime

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

DIRECT_URL = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL/DATABASE_URL não definida")

CHUNK_SIZE = 40          # tickers por pedido ao yfinance
INSERT_BATCH = 5_000     # linhas por execute_values


def get_tickers(cur, only: list[str] | None) -> list[str]:
    if only:
        return only
    # Índices (^GSPC, ...) ficam de fora: têm o seu próprio histórico longo e
    # o yfinance em lote trata-os de forma inconsistente.
    cur.execute(
        'SELECT ticker FROM companies WHERE "isActive" = TRUE '
        "AND ticker NOT LIKE '^%' ORDER BY ticker"
    )
    return [r[0] for r in cur.fetchall()]


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def clean(value):
    """NaN/inf do pandas → None (a coluna close é NOT NULL, o resto é opcional)."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else round(f, 4)


def rows_from_frame(ticker, frame):
    rows = []
    for idx, row in frame.iterrows():
        close = clean(row.get("Close"))
        if close is None:
            continue  # dia sem fecho não entra: a coluna é NOT NULL
        volume = clean(row.get("Volume"))
        rows.append((
            ticker,
            idx.date(),
            clean(row.get("Open")),
            clean(row.get("High")),
            clean(row.get("Low")),
            close,
            int(volume) if volume is not None else None,
        ))
    return rows


def upsert(cur, rows):
    for batch in chunks(rows, INSERT_BATCH):
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO prices (ticker, date, open, high, low, close, volume)
            VALUES %s
            ON CONFLICT (ticker, date) DO UPDATE SET
                open   = EXCLUDED.open,
                high   = EXCLUDED.high,
                low    = EXCLUDED.low,
                close  = EXCLUDED.close,
                volume = EXCLUDED.volume
            """,
            batch,
            template="(%s, %s, %s, %s, %s, %s, %s)",
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=int, default=15)
    parser.add_argument("--tickers", type=str, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    import yfinance as yf  # import tardio: --help não deve pagar o custo

    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    only = [t.strip().upper() for t in args.tickers.split(",")] if args.tickers else None
    with conn.cursor() as cur:
        tickers = get_tickers(cur, only)
        # A FK prices.ticker → companies.ticker rejeita tickers desconhecidos;
        # filtramos antes para falhar cedo e com mensagem clara.
        cur.execute('SELECT ticker FROM companies WHERE ticker = ANY(%s)', (tickers,))
        known = {r[0] for r in cur.fetchall()}
    unknown = [t for t in tickers if t not in known]
    if unknown:
        print(f"Ignorados (não existem em companies): {', '.join(unknown)}")
    tickers = [t for t in tickers if t in known]

    start = (datetime.date.today() - datetime.timedelta(days=args.years * 365)).isoformat()
    end = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    print(f"{len(tickers)} tickers · histórico desde {start}"
          f"{' · DRY RUN' if args.dry_run else ''}")

    total_rows = 0
    failed: list[str] = []

    for i, group in enumerate(chunks(tickers, CHUNK_SIZE), start=1):
        n_groups = math.ceil(len(tickers) / CHUNK_SIZE)
        print(f"[{i}/{n_groups}] {len(group)} tickers...", end=" ", flush=True)
        try:
            data = yf.download(
                group, start=start, end=end, group_by="ticker",
                auto_adjust=False, progress=False, threads=True,
            )
        except Exception as exc:  # noqa: BLE001 — um lote falhado não pode parar o resto
            print(f"ERRO no lote: {exc}")
            failed.extend(group)
            continue

        rows: list[tuple] = []
        for ticker in group:
            try:
                frame = data[ticker] if len(group) > 1 else data
            except KeyError:
                failed.append(ticker)
                continue
            if frame is None or frame.empty:
                failed.append(ticker)
                continue
            rows.extend(rows_from_frame(ticker, frame.dropna(how="all")))

        if rows and not args.dry_run:
            with conn.cursor() as cur:
                upsert(cur, rows)
            conn.commit()
        total_rows += len(rows)
        print(f"{len(rows):>7} linhas")

    conn.close()
    print(f"\nTotal: {total_rows:,} linhas processadas")
    if failed:
        print(f"Sem dados ({len(failed)}): {', '.join(sorted(set(failed)))}")


if __name__ == "__main__":
    main()
