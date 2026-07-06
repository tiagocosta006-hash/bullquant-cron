import os
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")

DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB_URL)

with conn.cursor() as cur:
    cur.execute("""
        SELECT c.ticker, f."businessKpis" 
        FROM companies c 
        JOIN fundamentals f ON c.id = f."companyId" 
        WHERE f."businessKpis" IS NOT NULL 
        ORDER BY c.ticker ASC
    """)
    rows = cur.fetchall()

    md_path = "/Users/tiagocosta18/.gemini/antigravity/brain/b296142d-5e1b-43a7-afeb-ddec21b5f615/database_kpis_snapshot.md"
    
    with open(md_path, "w") as f:
        f.write("# Snapshot: KPIs na Base de Dados\n\n")
        f.write("Abaixo está a lista completa de todas as empresas e os respetivos KPIs (com os valores reais) que estão atualmente injetados na tabela `fundamentals`.\n\n")
        
        # We group by ticker to avoid repeating tickers if there are multiple quarters, 
        # just showing the latest quarter's KPIs.
        processed_tickers = set()
        
        for row in rows:
            ticker = row[0]
            kpis = row[1]
            
            if ticker in processed_tickers:
                continue
                
            processed_tickers.add(ticker)
            
            # Skip empty objects
            if not kpis or len(kpis.keys()) == 0:
                continue
                
            f.write(f"### {ticker}\n")
            for k, v in kpis.items():
                f.write(f"- **{k}**: {v}\n")
            f.write("\n")

print(f"Exported {len(processed_tickers)} companies to markdown.")
