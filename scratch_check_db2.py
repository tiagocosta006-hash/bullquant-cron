import psycopg2
from scripts.ingest_fundamentals import DIRECT_URL
conn = psycopg2.connect(DIRECT_URL)
cur = conn.cursor()
cur.execute("SELECT id FROM companies WHERE ticker = 'WMT'")
c_id = cur.fetchone()[0]
cur.execute("SELECT \"fiscalYear\", \"periodType\", \"epsDiluted\", \"updatedAt\" FROM fundamentals WHERE \"companyId\" = %s ORDER BY \"fiscalYear\" DESC LIMIT 5", (c_id,))
for r in cur.fetchall(): print(r)
