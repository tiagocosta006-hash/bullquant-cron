"""
ingest_insider.py — Transações de insiders (SEC Form 4) via Finnhub.
Cron semanal: python scripts/ingest_insider.py

Por empresa pede a janela [-365 dias, hoje] em /stock/insider-transactions e faz
upsert em insider_transactions, chaveado por
(companyId, insiderName, transactionDate, transactionCode, sharesChange).

Mapeamento de códigos SEC → tipo:
  P (purchase / compra em mercado aberto) → BUY
  S (sale / venda)                        → SELL
  A, M, G, F, … (grants, exercises, etc.) → OTHER

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
PAST_DAYS = 365
SLEEP_BETWEEN = 1.1

# Código SEC → tipo do nosso enum insider_txn_type
TYPE_MAP = {"P": "BUY", "S": "SELL"}


def new_id() -> str:
    return uuid.uuid4().hex


def get_companies(cur) -> list[dict]:
    cur.execute('SELECT id, ticker FROM companies WHERE "isActive" = TRUE ORDER BY ticker')
    return [{"id": r[0], "ticker": r[1]} for r in cur.fetchall()]


def fetch_insider(ticker: str, frm: str, to: str) -> list[dict]:
    url = (
        f"{FINNHUB_BASE}/stock/insider-transactions"
        f"?symbol={ticker}&from={frm}&to={to}&token={FINNHUB_API_KEY}"
    )
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 429:
            print("    429 rate limit — a aguardar 60s...")
            time.sleep(60)
            r = requests.get(url, timeout=30)
        r.raise_for_status()
        return r.json().get("data") or []
    except Exception as e:
        print(f"    Finnhub error para {ticker}: {e}")
        return []


def upsert_insider(cur, company_id: str, rows: list[dict]) -> int:
    payload = []
    for tx in rows:
        name = (tx.get("name") or "").strip()
        change = tx.get("change")
        tdate = tx.get("transactionDate")
        # code entra na chave natural do upsert; "" (nunca NULL) para que o
        # ON CONFLICT case mesmo quando o Finnhub não fornece código — caso
        # contrário o Postgres trata NULL como distinto e duplica a cada cron.
        code = (tx.get("transactionCode") or "").strip().upper()
        if not name or change is None or not tdate:
            continue  # sem dados mínimos → ignora

        txn_type = TYPE_MAP.get(code, "OTHER")
        shares = abs(float(change))
        price = tx.get("transactionPrice")
        value = shares * float(price) if price else None

        payload.append((
            new_id(),
            company_id,
            name,
            None,  # title — não disponível neste endpoint
            txn_type,
            code,
            shares,
            float(change),
            price,
            value,
            tx.get("share"),       # sharesOwnedAfter
            tdate,
            tx.get("filingDate"),
        ))

    if not payload:
        return 0

    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO insider_transactions (
            "id", "companyId", "insiderName", "title", "type", "transactionCode",
            "shares", "sharesChange", "price", "value", "sharesOwnedAfter",
            "transactionDate", "filedAt", "source", "createdAt", "updatedAt"
        )
        VALUES %s
        ON CONFLICT ("companyId", "insiderName", "transactionDate", "transactionCode", "sharesChange")
        DO UPDATE SET
            "title"            = EXCLUDED."title",
            "type"             = EXCLUDED."type",
            "shares"           = EXCLUDED."shares",
            "price"            = EXCLUDED."price",
            "value"            = EXCLUDED."value",
            "sharesOwnedAfter" = EXCLUDED."sharesOwnedAfter",
            "filedAt"          = EXCLUDED."filedAt",
            "updatedAt"        = NOW()
        """,
        payload,
        template='(%s, %s, %s, %s, %s::"insider_txn_type", %s, %s, %s, %s, %s, %s, %s, %s, \'finnhub\', NOW(), NOW())',
    )
    return len(payload)


def main():
    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        companies = get_companies(cur)

    today = datetime.date.today()
    frm = (today - datetime.timedelta(days=PAST_DAYS)).isoformat()
    to = today.isoformat()
    total = len(companies)
    print(f"{total} empresas. Janela {frm} → {to}.")

    inserted = 0
    errors = 0

    for i, company in enumerate(companies):
        ticker = company["ticker"]
        print(f"[{i + 1}/{total}] {ticker}...", end=" ", flush=True)

        rows = fetch_insider(ticker, frm, to)
        if not rows:
            print("sem dados")
            time.sleep(SLEEP_BETWEEN)
            continue

        try:
            with conn.cursor() as cur:
                n = upsert_insider(cur, company["id"], rows)
            conn.commit()
            inserted += n
            print(f"{n} transações")
        except Exception as e:
            conn.rollback()
            print(f"ERRO DB: {e}")
            errors += 1

        time.sleep(SLEEP_BETWEEN)

    conn.close()
    print(f"\nConcluído. {inserted} transações upserted, {errors} erros.")


if __name__ == "__main__":
    main()
