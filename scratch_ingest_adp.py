import psycopg2
from scripts.ingest_fundamentals import DIRECT_URL, process_company
conn = psycopg2.connect(DIRECT_URL)
cur = conn.cursor()
cur.execute("SELECT id, ticker, cik, sector FROM companies WHERE ticker = 'ADP'")
r = cur.fetchone()
if r:
    company = {"id": r[0], "ticker": r[1], "cik": r[2], "sector": r[3]}
    print("Processing", company["ticker"])
    res = process_company(conn, company)
    print("Inserted", res)
else:
    print("Company not found")
