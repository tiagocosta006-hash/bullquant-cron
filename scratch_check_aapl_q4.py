import os
from dotenv import load_dotenv
import psycopg2

load_dotenv('.env.dev')
DIRECT_URL = os.getenv('DIRECT_URL')
conn = psycopg2.connect(DIRECT_URL)
cur = conn.cursor()

cur.execute("SELECT id FROM companies WHERE ticker = 'AAPL'")
aapl_id = cur.fetchone()[0]

cur.execute('''
    SELECT "periodEnd", "periodType"
    FROM fundamentals
    WHERE "companyId" = %s AND "periodEnd" >= '2025-01-01'
    ORDER BY "periodEnd" DESC
''', (aapl_id,))

for r in cur.fetchall():
    print(r)
