"""
ingest_corporate_events.py — Dividendos (ex-date/pay-date) e stock splits via Finnhub.
Cron diário/semanal: python scripts/ingest_corporate_events.py

Por empresa pede a janela [-90 dias, +180 dias] de dividendos (/stock/dividend)
e splits (/stock/split), e faz upsert em corporate_events, chaveado por
(companyId, type, date). AGM/investor day/IPO ficam fora desta ingestão — sem
fonte gratuita fiável ainda; o tipo já existe no schema para quando houver.

Finnhub free tier 60 req/min → sleep 1.1s entre empresas (2 chamadas cada).
Nota: se a tua chave não tiver acesso a /stock/dividend ou /stock/split
(alguns planos exigem upgrade), o erro é apanhado e a empresa é saltada —
não interrompe a corrida inteira.
"""

import os
import sys
import time
import uuid
import datetime
import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from urllib.parse import urlparse

ROOT = os.path.join(os.path.dirname(__file__), "..")

if os.environ.get("GITHUB_ACTIONS") != "true":
    ENV_FILE = os.path.join(ROOT, ".env.dev")
    if not os.path.exists(ENV_FILE):
        sys.exit(
            "ERRO: ficheiro .env.dev não encontrado.\n"
            "Estes scripts só correm contra a BD de desenvolvimento."
        )
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida no .env.dev")
if not FINNHUB_API_KEY:
    sys.exit("FINNHUB_API_KEY não definida no .env.dev")

FINNHUB_BASE = "https://finnhub.io/api/v1"
PAST_DAYS = 90
FUTURE_DAYS = 180
SLEEP_BETWEEN = 1.1


def new_id() -> str:
    return uuid.uuid4().hex


def get_companies(cur) -> list[dict]:
    cur.execute('SELECT id, ticker FROM companies WHERE "isActive" = TRUE ORDER BY ticker')
    return [{"id": r[0], "ticker": r[1]} for r in cur.fetchall()]


def _get(url: str) -> list[dict]:
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 429:
            print("    429 rate limit — a aguardar 60s...")
            time.sleep(60)
            r = requests.get(url, timeout=30)
        if r.status_code == 403:
            print("    403 — endpoint não disponível neste plano Finnhub, a saltar")
            return []
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"    Finnhub error: {e}")
        return []


def fetch_dividends(ticker: str, frm: str, to: str) -> list[dict]:
    url = f"{FINNHUB_BASE}/stock/dividend?symbol={ticker}&from={frm}&to={to}&token={FINNHUB_API_KEY}"
    return _get(url)


def fetch_splits(ticker: str, frm: str, to: str) -> list[dict]:
    url = f"{FINNHUB_BASE}/stock/split?symbol={ticker}&from={frm}&to={to}&token={FINNHUB_API_KEY}"
    return _get(url)


def build_rows(company_id: str, dividends: list[dict], splits: list[dict]) -> dict[tuple, tuple]:
    # Dedup por (companyId, type, date) — chave única da tabela.
    dedup: dict[tuple, tuple] = {}

    for d in dividends:
        ex_date = d.get("date")
        amount = d.get("amount")
        if not ex_date or amount is None:
            continue
        pay_date = d.get("payDate")
        key = (company_id, "DIVIDEND", ex_date)
        dedup[key] = (new_id(), company_id, "DIVIDEND", ex_date, pay_date, amount, None, None)

    for s in splits:
        date = s.get("date")
        from_factor = s.get("fromFactor")
        to_factor = s.get("toFactor")
        if not date or not from_factor or not to_factor:
            continue
        ratio = f"{to_factor}:{from_factor}"
        key = (company_id, "SPLIT", date)
        dedup[key] = (new_id(), company_id, "SPLIT", date, None, None, ratio, None)

    return dedup


def upsert_corporate_events(cur, rows: dict[tuple, tuple]) -> int:
    if not rows:
        return 0

    payload = list(rows.values())
    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO corporate_events (
            "id", "companyId", "type", "date", "payDate", "amount",
            "splitRatio", "note", "createdAt", "updatedAt"
        )
        VALUES %s
        ON CONFLICT ("companyId", "type", "date") DO UPDATE SET
            "payDate"    = EXCLUDED."payDate",
            "amount"     = EXCLUDED."amount",
            "splitRatio" = EXCLUDED."splitRatio",
            "updatedAt"  = NOW()
        """,
        payload,
        template='(%s, %s, %s::"corporate_event_type", %s, %s, %s, %s, %s, NOW(), NOW())',
    )
    return len(payload)


def main():
    print(f"A ligar a {urlparse(DIRECT_URL).hostname}...")
    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        companies = get_companies(cur)

    today = datetime.date.today()
    frm = (today - datetime.timedelta(days=PAST_DAYS)).isoformat()
    to = (today + datetime.timedelta(days=FUTURE_DAYS)).isoformat()
    total = len(companies)
    print(f"{total} empresas. Janela {frm} → {to}.")

    inserted = 0
    errors = 0

    for i, company in enumerate(companies):
        ticker = company["ticker"]
        print(f"[{i + 1}/{total}] {ticker}...", end=" ", flush=True)

        dividends = fetch_dividends(ticker, frm, to)
        splits = fetch_splits(ticker, frm, to)

        if not dividends and not splits:
            print("sem dados")
            time.sleep(SLEEP_BETWEEN)
            continue

        rows = build_rows(company["id"], dividends, splits)
        try:
            with conn.cursor() as cur:
                n = upsert_corporate_events(cur, rows)
            conn.commit()
            inserted += n
            print(f"{n} eventos")
        except Exception as e:
            conn.rollback()
            print(f"ERRO DB: {e}")
            errors += 1

        time.sleep(SLEEP_BETWEEN)

    conn.close()
    print(f"\nConcluído. {inserted} eventos upserted, {errors} erros.")


if __name__ == "__main__":
    main()
