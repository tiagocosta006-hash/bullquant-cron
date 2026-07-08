"""
ingest_ceos.py — Extrai o nome do CEO das empresas do S&P 500 via yfinance e atualiza a BD.
Corre mensalmente via GitHub Actions (1 de cada mês às 02:00 UTC).

⚠️ EXCEÇÃO DELIBERADA ao CLAUDE.md §9 (que proíbe yfinance por causa dos ToS do Yahoo).
   Decisão consciente (Costa, 2026-06-29) de manter yfinance APENAS para o nome do CEO,
   depois de avaliadas e rejeitadas as alternativas legais e gratuitas:
     - Finnhub free: campo CEO inexistente (/stock/executive é premium).
     - SEC Form 4 <officerTitle>: falsos positivos graves (apanha CEOs de divisões,
       ex.: "CEO CCB" na JPM em vez do CEO da empresa) + lacunas de cobertura.
     - Wikidata (P169): WDQS instável + modelação de tickers inconsistente.
   Risco assumido: ToS do Yahoo proíbem uso comercial. Revisitar se surgir fonte legal
   (ou orçamento para API paga de perfis). NÃO replicar yfinance para outros dados.
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

# Fallback: President/Director patterns used when no explicit CEO title found
PRESIDENT_KEYWORDS = [
    "president & director",
    "president and director",
    "ceo, president & director",
    "ceo, president and director",
    "chairman & ceo",
    "chairman and ceo",
    "executive chairman",
]

# Hardcoded overrides ONLY for companies with genuinely atypical leadership structures
# where no conventional "CEO" title exists (e.g. partnerships, family-controlled firms).
# DO NOT add companies here just because Yahoo Finance has a data gap —
# those should show "-" in the UI rather than show stale hardcoded data.
HARDCODED_CEOS: dict[str, str] = {
    # Apollo: co-founder partnership, Marc Rowan is the CEO equivalent
    "APO": "Mr. Marc Jeffrey Rowan",
    # Ares: co-CEO partnership structure
    "ARES": "Mr. Michael Joseph Arougheti",
    # BRK.B: Warren Buffett stepped down; Greg Abel is designated successor/CEO
    # (handled by ticker map BRK.B → BRK-B, so this is a safety net)
}

# Tickers where the dot must be replaced with a hyphen for yfinance
TICKER_MAP: dict[str, str] = {
    "BF.B": "BF-B",
    "BRK.B": "BRK-B",
}


def extract_ceo(ticker: str) -> str | None:
    """Multi-strategy CEO extraction with fallback chains."""
    # 1. Hardcoded override
    if ticker in HARDCODED_CEOS:
        return HARDCODED_CEOS[ticker]

    # 2. Resolve Yahoo Finance ticker alias (dots → hyphens)
    yf_ticker = TICKER_MAP.get(ticker, ticker)

    try:
        t = yf.Ticker(yf_ticker)
        officers: list[dict] = t.info.get("companyOfficers", [])
    except Exception as e:
        print(f"Erro ao extrair CEO para {ticker}: {e}")
        return None

    if not officers:
        return None

    # Pass 1: strict CEO keywords
    for officer in officers:
        title = officer.get("title", "").lower()
        for kw in CEO_KEYWORDS:
            if kw in title:
                return officer.get("name")

    # Pass 2: president/director fallback
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
            cur.execute('SELECT ticker FROM companies WHERE "isActive" = TRUE ORDER BY ticker')
            rows = cur.fetchall()
            tickers = [r[0] for r in rows]

        total = len(tickers)

        for i, ticker in enumerate(tickers):
            print(f"[{i+1}/{total}] {ticker}...", end=" ", flush=True)

            ceo_name = extract_ceo(ticker)

            if ceo_name:
                with conn.cursor() as cur:
                    cur.execute(
                        'UPDATE companies SET ceo = %s, "updatedAt" = NOW() WHERE ticker = %s',
                        (ceo_name, ticker),
                    )
                conn.commit()
                print(f"ok -> {ceo_name}")
                updated += 1
            else:
                print("nenhum CEO encontrado.")

            time.sleep(0.5)

    except Exception as e:
        conn.rollback()
        print(f"ERRO GLOBAL: {e}")
    finally:
        conn.close()
        print(f"\nConcluído. {updated} CEOs atualizados com sucesso.")


if __name__ == "__main__":
    main()
