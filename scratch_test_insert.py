import psycopg2
from scripts.ingest_fundamentals import DIRECT_URL
conn = psycopg2.connect(DIRECT_URL)
cur = conn.cursor()
cur.execute("UPDATE fundamentals SET capex = 0.0 WHERE id = (SELECT id FROM fundamentals WHERE \"companyId\" = (SELECT id FROM companies WHERE ticker = 'WFC') LIMIT 1) RETURNING capex")
print(cur.fetchone())
conn.commit()
