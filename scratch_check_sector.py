import psycopg2
from scripts.ingest_fundamentals import DIRECT_URL
conn = psycopg2.connect(DIRECT_URL)
cur = conn.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'")
cols = [r[0] for r in cur.fetchall()]
print(cols)
