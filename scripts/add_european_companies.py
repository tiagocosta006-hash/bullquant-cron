import psycopg2
import sys
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
DIRECT_URL = os.environ.get("DIRECT_URL")

EUROPEAN_CHAMPIONS = [
    # ticker, name, cik, exchange, sector, country, currency
    ("RACE", "Ferrari N.V.", "0001648416", "NYSE", "Consumer Discretionary", "IT", "EUR"),
    ("ASML", "ASML Holding N.V.", "0000937966", "NASDAQ", "Information Technology", "NL", "EUR"),
    ("NVO",  "Novo Nordisk A/S", "0000353278", "NYSE", "Health Care", "DK", "DKK"),
    ("SAP",  "SAP SE", "0001000184", "NYSE", "Information Technology", "DE", "EUR"),
    ("UL",   "Unilever PLC", "0000217410", "NYSE", "Consumer Staples", "GB", "GBP"),
    ("SHEL", "Shell plc", "0001306965", "NYSE", "Energy", "GB", "USD"),
    ("TTE",  "TotalEnergies SE", "0000879764", "NYSE", "Energy", "FR", "USD"),
    ("BTI",  "British American Tobacco", "0001303523", "NYSE", "Consumer Staples", "GB", "GBP"),
    ("NVS",  "Novartis AG", "0001114448", "NYSE", "Health Care", "CH", "USD"),
    ("SNY",  "Sanofi", "0001121404", "NASDAQ", "Health Care", "FR", "EUR"),
    ("GSK",  "GSK plc", "0001131399", "NYSE", "Health Care", "GB", "GBP"),
    ("AZN",  "AstraZeneca PLC", "0000901832", "NASDAQ", "Health Care", "GB", "USD"),
]

def main():
    if not DIRECT_URL:
        print("Erro: DIRECT_URL não encontrado no .env")
        return

    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = True
    cur = conn.cursor()

    inserted = 0
    for ticker, name, cik, exchange, sector, country, currency in EUROPEAN_CHAMPIONS:
        if cik == "N/A":
            cik = None

        try:
            cur.execute("""
                INSERT INTO companies (id, ticker, name, cik, exchange, sector, country, currency, "isActive", "createdAt", "updatedAt")
                VALUES (replace(gen_random_uuid()::text, '-', ''), %s, %s, %s, %s, %s, %s, %s, true, NOW(), NOW())
                ON CONFLICT (ticker) DO UPDATE SET
                    name = EXCLUDED.name,
                    cik = EXCLUDED.cik,
                    exchange = EXCLUDED.exchange,
                    sector = EXCLUDED.sector,
                    country = EXCLUDED.country,
                    currency = EXCLUDED.currency,
                    "isActive" = true,
                    "updatedAt" = NOW()
            """, (ticker, name, cik, exchange, sector, country, currency))
            inserted += 1
            print(f"✅ Upserted {ticker} ({name}) - {currency}")
        except Exception as e:
            print(f"❌ Failed to upsert {ticker}: {e}")

    print(f"\nConcluído: {inserted} empresas processadas.")
    conn.close()

if __name__ == "__main__":
    main()
