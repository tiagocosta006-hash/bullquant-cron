import psycopg2
from urllib.parse import urlparse
import os

DIRECT_URL = "postgres://postgres.hsviimrmjddrpxkymxtq:v2EaV3B3T216c5Hq@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
conn = psycopg2.connect(DIRECT_URL)
cur = conn.cursor()
cur.execute("SELECT ticker FROM companies WHERE ticker IN ('MSFT', 'GOOGL')")
print(cur.fetchall())
