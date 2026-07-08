"""
fix_missing_ceos.py — Resolve os 18 CEOs em falta com lógica alargada de fallback.

Problemas identificados no script original:
1. Tickers com ponto (BF.B, BRK.B) falham no Yahoo Finance → usar hífen (BF-B, BRK-B)
2. Algumas empresas não têm "CEO" no título mas têm "President & Director", "Chairman & CEO", etc.
3. Algumas empresas (APO, ARES) são parcerias sem CEO formal → hardcode de "Managing Partner" / Chairman
"""

import os
import sys
import time
import psycopg2
import yfinance as yf
from dotenv import load_dotenv

ROOT = os.path.join(os.path.dirname(__file__), "..")

if os.environ.get("GITHUB_ACTIONS") == "true":
    pass
else:
    ENV_FILE = os.path.join(ROOT, ".env.dev")
    if not os.path.exists(ENV_FILE):
        sys.exit("ERRO: ficheiro .env.dev não encontrado.")
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida no .env.dev")

# Priority keywords for CEO matching — ordered most → least specific
CEO_KEYWORDS = [
    "chief executive officer",
    "ceo",
    "ceo, president",
    "president & ceo",
    "president and ceo",
    "president, ceo",
    "co-ceo",
    "co-chief executive",
]

# President/Director patterns used when no explicit CEO title found
PRESIDENT_KEYWORDS = [
    "president & director",
    "president and director",
    "ceo, president & director",
    "ceo, president and director",
    "chairman & ceo",
    "chairman and ceo",
    "executive chairman",   # last resort
]

# Hardcoded overrides for edge cases where Yahoo Finance returns no useful data
HARDCODED_CEOS: dict[str, str] = {
    # APO — Apollo uses "Co-Founder" structure, Marc Rowan is de-facto CEO
    "APO": "Mr. Marc Jeffrey Rowan",
    # ARES — Michael Arougheti is CEO (listed as Co-CEO in filings)
    "ARES": "Mr. Michael Joseph Arougheti",
    # WRB — W. R. Berkley: Robert Berkley Jr. is CEO
    "WRB": "Mr. William Robert Berkley Jr.",
    # EXE — Expand Energy (formerly Chesapeake spin-off): Nick Dell'Osso Jr.
    "EXE": "Mr. Domenic J. Dell'Osso Jr.",
}

# Tickers where the dot must be replaced with a hyphen for yfinance
TICKER_MAP: dict[str, str] = {
    "BF.B": "BF-B",
    "BRK.B": "BRK-B",
}


def extract_ceo_extended(ticker: str) -> str | None:
    """Multi-strategy CEO extraction with fallback chains."""
    # 1. Hardcoded override
    if ticker in HARDCODED_CEOS:
        return HARDCODED_CEOS[ticker]

    # 2. Resolve Yahoo Finance ticker alias
    yf_ticker = TICKER_MAP.get(ticker, ticker)

    try:
        t = yf.Ticker(yf_ticker)
        officers: list[dict] = t.info.get("companyOfficers", [])
    except Exception as e:
        print(f"  ⚠ yfinance error for {ticker}: {e}")
        return None

    if not officers:
        return None

    # Pass 1: strict CEO keywords
    for officer in officers:
        title = officer.get("title", "").lower()
        for kw in CEO_KEYWORDS:
            if kw in title:
                return officer.get("name")

    # Pass 2: president/director fallback (common in US filings when CEO == President)
    for officer in officers:
        title = officer.get("title", "").lower()
        for kw in PRESIDENT_KEYWORDS:
            if kw in title:
                return officer.get("name")

    return None


def main() -> None:
    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    updated = 0

    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT ticker, name FROM companies WHERE ceo IS NULL AND "isActive" = TRUE ORDER BY ticker'
            )
            rows = cur.fetchall()

        total = len(rows)
        print(f"Empresas sem CEO: {total}\n")

        for i, (ticker, company_name) in enumerate(rows):
            print(f"[{i+1}/{total}] {ticker} ({company_name})...", end=" ", flush=True)

            ceo_name = extract_ceo_extended(ticker)

            if ceo_name:
                with conn.cursor() as cur:
                    cur.execute(
                        'UPDATE companies SET ceo = %s, "updatedAt" = NOW() WHERE ticker = %s',
                        (ceo_name, ticker),
                    )
                conn.commit()
                print(f"✓ {ceo_name}")
                updated += 1
            else:
                print("✗ nenhum CEO encontrado.")

            time.sleep(0.4)

    except Exception as e:
        conn.rollback()
        print(f"\nERRO GLOBAL: {e}")
    finally:
        conn.close()
        print(f"\nConcluído. {updated}/{total} CEOs adicionados.")


if __name__ == "__main__":
    main()
