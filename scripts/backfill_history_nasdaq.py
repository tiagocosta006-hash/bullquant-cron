"""
backfill_history_nasdaq.py — Backfill de histórico profundo (10 anos) via API
pública da Nasdaq (api.nasdaq.com/api/quote/{ticker}/historical).

Motivo: o plano Polygon.io free só serve ~2 anos de histórico diário, o que
deixa tickers adicionados manualmente (ex.: ADRs europeus como ASML, RACE, NVO…)
com um gráfico demasiado curto. A API pública da Nasdaq devolve ~10 anos de
preços diários (já ajustados a splits, tal como o Polygon com adjusted=true),
por isso pode preencher a lacuna histórica.

Arquitetura híbrida:
  - Polygon (cron diário, ingest_prices.py) → mantém os preços recentes atualizados.
  - Nasdaq (este script, on-demand)         → preenche o histórico antigo em falta.

Por defeito faz UPSERT com ON CONFLICT DO NOTHING: só insere as datas que ainda
não existem, deixando intactos os preços recentes já geridos pelo Polygon.

Uso:
  TICKERS="ASML,RACE"  python scripts/backfill_history_nasdaq.py   # tickers específicos
  python scripts/backfill_history_nasdaq.py                        # lista europeia por defeito

Rate limit: sleep 1.5s entre tickers (a API da Nasdaq é pública mas não oficial).
"""

import os
import sys
import time
import datetime
import requests
import psycopg2
import psycopg2.extras

ROOT = os.path.join(os.path.dirname(__file__), "..")

if os.environ.get("GITHUB_ACTIONS") == "true":
    pass
else:
    from dotenv import load_dotenv
    ENV_FILE = os.path.join(ROOT, ".env.dev")
    if not os.path.exists(ENV_FILE):
        sys.exit(
            "ERRO: ficheiro .env.dev não encontrado.\n"
            "Este script só corre localmente contra a BD de desenvolvimento.\n"
            "Em produção corre via GitHub Actions (backfill-history.yml)."
        )
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida.")

# ADRs europeus adicionados manualmente (add_european_companies.py) — só têm ~2
# anos de histórico via Polygon. Editável via variável de ambiente TICKERS.
DEFAULT_TICKERS = [
    "ASML", "RACE", "NVO", "SAP", "UL", "SHEL",
    "TTE", "BTI", "NVS", "SNY", "GSK", "AZN",
]

HISTORY_YEARS = 10
SLEEP_BETWEEN = 20  # a API da Nasdaq faz rate-limit a rajadas; espaçar bem entre tickers
NASDAQ_BASE = "https://api.nasdaq.com/api/quote"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


def _to_decimal(raw):
    """'$1,747.58' -> 1747.58 ; '' / '--' / None -> None"""
    if raw is None:
        return None
    s = str(raw).replace("$", "").replace(",", "").strip()
    if s in ("", "--", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _to_int(raw):
    if raw is None:
        return None
    s = str(raw).replace(",", "").strip()
    if s in ("", "--", "N/A"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def fetch_nasdaq(ticker: str, from_date: str, to_date: str, max_retries: int = 8) -> list[dict]:
    url = (
        f"{NASDAQ_BASE}/{ticker}/historical"
        f"?assetclass=stocks&fromdate={from_date}&limit=5000&todate={to_date}"
    )
    # A API da Nasdaq rejeita limit demasiado alto (ex.: 9999) devolvendo HTTP 200
    # com data=null + "Something went wrong" (code 1000). limit=5000 chega para
    # ~20 anos de dias úteis e responde de forma fiável. O retry cobre falhas
    # transitórias de rede.
    data = None
    for attempt in range(max_retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code != 200:
                print(f"    HTTP {r.status_code} (tentativa {attempt+1})", flush=True)
                time.sleep(5 * (attempt + 1))
                continue
            payload = r.json()
            if payload.get("data") is None:
                # rate-limited / soft error → backoff e tenta de novo
                wait = 10 * (attempt + 1)
                print(f"    rate-limited (data=null), espera {wait}s [tentativa {attempt+1}/{max_retries}]", flush=True)
                time.sleep(wait)
                continue
            data = payload
            break
        except Exception as e:
            print(f"    Nasdaq error para {ticker}: {e} (tentativa {attempt+1})", flush=True)
            time.sleep(5 * (attempt + 1))
    if data is None:
        return []
    try:
        table = (data.get("data") or {}).get("tradesTable") or {}
        rows_raw = table.get("rows") or []
        rows = []
        for item in rows_raw:
            # date vem como MM/DD/YYYY
            try:
                d = datetime.datetime.strptime(item["date"], "%m/%d/%Y").date()
            except (KeyError, ValueError):
                continue
            close = _to_decimal(item.get("close"))
            if close is None:
                continue
            rows.append({
                "ticker": ticker,
                "date": d,
                "open": _to_decimal(item.get("open")),
                "high": _to_decimal(item.get("high")),
                "low": _to_decimal(item.get("low")),
                "close": close,
                "volume": _to_int(item.get("volume")),
            })
        return rows
    except Exception as e:
        print(f"    Nasdaq error para {ticker}: {e}")
        return []


def upsert_prices(cur, rows: list[dict]) -> None:
    if not rows:
        return
    # DO NOTHING: preenche só as datas em falta; não toca nos preços recentes
    # que o Polygon já gere (mesma base ajustada a splits nos dois).
    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO prices (ticker, date, open, high, low, close, volume)
        VALUES %s
        ON CONFLICT (ticker, date) DO NOTHING
        """,
        [(r["ticker"], r["date"], r["open"], r["high"], r["low"], r["close"], r["volume"]) for r in rows],
        template="(%s, %s, %s, %s, %s, %s, %s)",
    )


def main():
    tickers_env = os.getenv("TICKERS", "").strip()
    tickers = [t.strip().upper() for t in tickers_env.split(",") if t.strip()] or DEFAULT_TICKERS

    today = datetime.date.today()
    history_start = today - datetime.timedelta(days=HISTORY_YEARS * 365)
    from_date = history_start.isoformat()
    to_date = today.isoformat()

    print(f"{len(tickers)} tickers a fazer backfill (Nasdaq). Histórico desde {from_date}.")

    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    inserted_total = 0
    errors = 0

    for i, ticker in enumerate(tickers):
        print(f"[{i+1}/{len(tickers)}] {ticker}...", end=" ", flush=True)

        rows = fetch_nasdaq(ticker, from_date, to_date)
        if not rows:
            print("sem dados")
            errors += 1
            time.sleep(SLEEP_BETWEEN)
            continue

        try:
            with conn.cursor() as cur:
                # conta quantas linhas existiam antes, para reportar as inseridas
                cur.execute("SELECT COUNT(*) FROM prices WHERE ticker = %s", (ticker,))
                before = cur.fetchone()[0]
                upsert_prices(cur, rows)
                cur.execute("SELECT COUNT(*) FROM prices WHERE ticker = %s", (ticker,))
                after = cur.fetchone()[0]
                cur.execute(
                    'UPDATE companies SET "updatedAt" = NOW() WHERE ticker = %s',
                    (ticker,),
                )
            conn.commit()
            added = after - before
            inserted_total += added
            oldest = min(r["date"] for r in rows)
            print(f"{len(rows)} obtidos, {added} novos (total agora {after}, desde {oldest})")
        except Exception as e:
            conn.rollback()
            print(f"ERRO DB: {e}")
            errors += 1

        time.sleep(SLEEP_BETWEEN)

    conn.close()
    print(f"\nConcluído. {inserted_total} linhas novas inseridas, {errors} erros.")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
