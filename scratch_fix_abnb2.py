import psycopg2
import sys
from scripts.ingest_fundamentals import process_company, DIRECT_URL

conn = psycopg2.connect(DIRECT_URL)
conn.autocommit = False
cur = conn.cursor()
cur.execute("SELECT id, ticker, name, sector, industry, cik FROM \"Company\" WHERE ticker = 'ABNB'")
row = cur.fetchone()
if row:
    comp = {
        "id": row[0],
        "ticker": row[1],
        "name": row[2],
        "sector": row[3],
        "industry": row[4],
        "cik": row[5]
    }
    n = process_company(conn, comp)
    conn.commit()
    print(f"ABNB reingested: {n} periods.")
else:
    print("ABNB not found in DB.")
