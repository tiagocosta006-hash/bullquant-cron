import psycopg2
from scripts.ingest_fundamentals import DIRECT_URL
conn = psycopg2.connect(DIRECT_URL)
cur = conn.cursor()
cur.execute("SELECT sector FROM companies WHERE ticker = 'WFC'")
print("Sector:", cur.fetchone()[0])
