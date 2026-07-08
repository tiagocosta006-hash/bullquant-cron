"""
ingest_earnings.py — Calendário de resultados (earnings) via Finnhub.
Cron diário: python scripts/ingest_earnings.py

Por empresa pede a janela [-90 dias, +180 dias] e faz upsert em earnings_events,
chaveado por (companyId, fiscalYear, fiscalQuarter). Datas futuras são estimativas;
quando a empresa reporta, os campos *Actual são preenchidos na corrida seguinte.

Finnhub free tier 60 req/min → sleep 1.1s entre empresas.
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

HOUR_MAP = {"bmo": "BMO", "amc": "AMC", "dmh": "DMH"}


def new_id() -> str:
    return uuid.uuid4().hex


def get_companies(cur) -> list[dict]:
    cur.execute('SELECT id, ticker FROM companies WHERE "isActive" = TRUE ORDER BY ticker')
    return [{"id": r[0], "ticker": r[1]} for r in cur.fetchall()]


def fetch_earnings(ticker: str, frm: str, to: str) -> list[dict]:
    url = (
        f"{FINNHUB_BASE}/calendar/earnings"
        f"?from={frm}&to={to}&symbol={ticker}&token={FINNHUB_API_KEY}"
    )
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 429:
            print("    429 rate limit — a aguardar 60s...")
            time.sleep(60)
            r = requests.get(url, timeout=30)
        r.raise_for_status()
        return r.json().get("earningsCalendar") or []
    except Exception as e:
        print(f"    Finnhub error para {ticker}: {e}")
        return []


def upsert_earnings(cur, company_id: str, rows: list[dict]) -> int:
    payload = []
    for e in rows:
        year = e.get("year")
        quarter = e.get("quarter")
        date = e.get("date")
        if not year or not quarter or not date:
            continue  # sem chave de período válida → ignora
        hour = HOUR_MAP.get((e.get("hour") or "").lower(), "UNKNOWN")
        payload.append((
            new_id(),
            company_id,
            date,
            hour,
            int(year),
            int(quarter),
            e.get("epsEstimate"),
            e.get("epsActual"),
            e.get("revenueEstimate"),
            e.get("revenueActual"),
        ))

    if not payload:
        return 0

    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO earnings_events (
            "id", "companyId", "date", "hour", "fiscalYear", "fiscalQuarter",
            "epsEstimate", "epsActual", "revenueEstimate", "revenueActual",
            "createdAt", "updatedAt"
        )
        VALUES %s
        ON CONFLICT ("companyId", "fiscalYear", "fiscalQuarter") DO UPDATE SET
            "date"            = EXCLUDED."date",
            "hour"            = EXCLUDED."hour",
            "epsEstimate"     = EXCLUDED."epsEstimate",
            "epsActual"       = EXCLUDED."epsActual",
            "revenueEstimate" = EXCLUDED."revenueEstimate",
            "revenueActual"   = EXCLUDED."revenueActual",
            "updatedAt"       = NOW()
        """,
        payload,
        template='(%s, %s, %s, %s::"earnings_hour", %s, %s, %s, %s, %s, %s, NOW(), NOW())',
    )
    return len(payload)


def main():
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

        rows = fetch_earnings(ticker, frm, to)
        if not rows:
            print("sem dados")
            time.sleep(SLEEP_BETWEEN)
            continue

        try:
            with conn.cursor() as cur:
                n = upsert_earnings(cur, company["id"], rows)
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
