import os
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.dev", override=True)

conn = psycopg2.connect(os.getenv("DIRECT_URL"))
cur = conn.cursor()
cur.execute('SELECT id, ticker, name, sector, industry FROM companies WHERE "isActive" = TRUE AND "bullCase" IS NULL ORDER BY ticker')
rows = cur.fetchall()

chunks = [rows[i:i+105] for i in range(0, len(rows), 105)]

for idx, chunk in enumerate(chunks):
    data = [{"id": r[0], "ticker": r[1], "name": r[2], "sector": r[3], "industry": r[4]} for r in chunk]
    with open(f"chunk_deep_{idx+1}.json", "w") as f:
        json.dump(data, f, indent=2)

print(f"Criados {len(chunks)} chunks.")
