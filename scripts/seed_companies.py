"""
seed_companies.py — Popula a tabela companies com as 500 empresas do S&P 500.
Corre uma vez manualmente: python scripts/seed_companies.py

Fontes:
  - Lista S&P 500: Wikipedia (pandas.read_html) — ticker, nome, sector, industry, CIK
  - Dados adicionais: Finnhub /stock/profile2 — logo, website, exchange
"""

import io
import os
import sys
import time
import uuid
import requests
import psycopg2
import pandas as pd
from dotenv import load_dotenv

ROOT = os.path.join(os.path.dirname(__file__), "..")

if os.environ.get("GITHUB_ACTIONS") == "true":
    # Em GitHub Actions as variáveis vêm dos secrets directamente
    pass
else:
    ENV_FILE = os.path.join(ROOT, ".env.dev")
    if not os.path.exists(ENV_FILE):
        sys.exit(
            "ERRO: ficheiro .env.dev não encontrado.\n"
            "Cria um projeto Supabase de DEV e preenche .env.dev com as suas credenciais.\n"
            "NUNCA uses .env.local — estes scripts só correm contra a BD de desenvolvimento."
        )
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida no .env.dev")
if not FINNHUB_API_KEY:
    sys.exit("FINNHUB_API_KEY não definida no .env.dev")


def new_id() -> str:
    return uuid.uuid4().hex


def fetch_sp500_from_wikipedia() -> pd.DataFrame:
    print("A obter lista S&P 500 da Wikipedia...")
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    headers = {"User-Agent": "Mozilla/5.0 (compatible; Bullmetrics/1.0; +https://bullocracy.com)"}
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    tables = pd.read_html(io.StringIO(r.text), header=0)
    df = tables[0]
    df.columns = [c.strip() for c in df.columns]

    col_map = {
        "Symbol": "ticker",
        "Security": "name",
        "GICS Sector": "sector",
        "GICS Sub-Industry": "industry",
        "CIK": "cik",
    }
    df = df.rename(columns=col_map)
    keep = [c for c in ["ticker", "name", "sector", "industry", "cik"] if c in df.columns]
    df = df[keep].copy()
    df["ticker"] = df["ticker"].str.strip()

    if "cik" in df.columns:
        df["cik"] = df["cik"].apply(
            lambda x: str(int(x)).zfill(10) if pd.notna(x) and str(x).strip() != "" else None
        )
    else:
        df["cik"] = None

    print(f"  {len(df)} empresas encontradas.")
    return df


def fetch_finnhub_profile(ticker: str) -> dict:
    symbol = ticker.replace(".", "-")
    url = f"https://finnhub.io/api/v1/stock/profile2?symbol={symbol}&token={FINNHUB_API_KEY}"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        return {
            "logoUrl": data.get("logo") or None,
            "website": data.get("weburl") or None,
            "exchange": data.get("exchange") or "NYSE",
            "currency": data.get("currency") or "USD",
            "country": data.get("country") or "US",
        }
    except Exception as e:
        print(f"    Finnhub error para {ticker}: {e}")
        return {}


def upsert_company(cur, company: dict):
    # Colunas camelCase — como estão na BD (Prisma sem @map nos campos)
    cur.execute(
        """
        INSERT INTO companies (
            id, ticker, name, cik, exchange, sector, industry,
            country, currency, "logoUrl", website, description, employees,
            "isActive", "createdAt", "updatedAt"
        ) VALUES (
            %(id)s, %(ticker)s, %(name)s, %(cik)s, %(exchange)s, %(sector)s, %(industry)s,
            %(country)s, %(currency)s, %(logoUrl)s, %(website)s, %(description)s, %(employees)s,
            TRUE, NOW(), NOW()
        )
        ON CONFLICT (ticker) DO UPDATE SET
            name        = EXCLUDED.name,
            cik         = COALESCE(EXCLUDED.cik, companies.cik),
            exchange    = EXCLUDED.exchange,
            sector      = COALESCE(EXCLUDED.sector, companies.sector),
            industry    = COALESCE(EXCLUDED.industry, companies.industry),
            "logoUrl"   = COALESCE(EXCLUDED."logoUrl", companies."logoUrl"),
            website     = COALESCE(EXCLUDED.website, companies.website),
            "updatedAt" = NOW()
        """,
        company,
    )


def main():
    df = fetch_sp500_from_wikipedia()
    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    total = len(df)
    errors = 0

    for i, row in df.iterrows():
        ticker = row["ticker"]
        print(f"[{i+1}/{total}] {ticker}...", end=" ", flush=True)

        profile = fetch_finnhub_profile(ticker)

        company = {
            "id": new_id(),
            "ticker": ticker,
            "name": row.get("name", ticker),
            "cik": row.get("cik") or None,
            "exchange": profile.get("exchange") or "NYSE",
            "sector": row.get("sector") or None,
            "industry": row.get("industry") or None,
            "country": profile.get("country") or "US",
            "currency": profile.get("currency") or "USD",
            "logoUrl": profile.get("logoUrl") or None,
            "website": profile.get("website") or None,
            "description": None,
            "employees": None,
        }

        try:
            with conn.cursor() as cur:
                upsert_company(cur, company)
            conn.commit()
            print("ok")
        except Exception as e:
            conn.rollback()
            # CIK duplicado (ex: GOOG/GOOGL, FOX/FOXA) → tentar sem CIK
            if "companies_cik_key" in str(e):
                company["cik"] = None
                try:
                    with conn.cursor() as cur:
                        upsert_company(cur, company)
                    conn.commit()
                    print("ok (sem CIK)")
                except Exception as e2:
                    conn.rollback()
                    print(f"ERRO: {e2}")
                    errors += 1
            else:
                print(f"ERRO: {e}")
                errors += 1

        time.sleep(1)

    conn.close()
    print(f"\nConcluído. {total - errors}/{total} inseridas/atualizadas. {errors} erros.")


if __name__ == "__main__":
    main()
