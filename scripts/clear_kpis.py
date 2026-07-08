import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
conn = psycopg2.connect(os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL"))

with conn.cursor() as cur:
    # Keep the ones we actually extracted with subagents
    valid_tickers = ['RJF', 'DVA', 'WAT', 'ED', 'SJM', 'ARE', 'TSCO']
    
    cur.execute("""
        UPDATE fundamentals 
        SET "businessKpis" = NULL 
        WHERE "companyId" IN (
            SELECT id FROM companies WHERE ticker NOT IN %s
        )
    """, (tuple(valid_tickers),))
    
    conn.commit()
    print(f"Cleared generic KPIs. Kept valid AI extractions for {valid_tickers}")
