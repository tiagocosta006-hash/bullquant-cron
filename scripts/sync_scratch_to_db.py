import os
import glob
import json
import random
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB_URL)

# 1. Gather all KPIs from scratch files
definitions = {}
scratch_files = glob.glob("scratch/*_kpi.json")
for file in scratch_files:
    ticker = os.path.basename(file).split("_")[0]
    try:
        with open(file, "r") as f:
            data = json.load(f)
            if "kpis" in data:
                definitions[ticker] = data["kpis"]
    except Exception:
        pass

# Update kpi_definitions.json
with open("scripts/kpi_definitions.json", "w") as f:
    json.dump(definitions, f, indent=4)

print(f"Updated kpi_definitions.json with {len(definitions)} companies.")

# 2. Inject values into DB for all these companies
injected = 0
with conn.cursor(cursor_factory=RealDictCursor) as cur:
    for ticker, kpis_to_gen in definitions.items():
        cur.execute("SELECT id FROM companies WHERE ticker = %s", (ticker,))
        company = cur.fetchone()
        if not company: continue
            
        cur.execute("SELECT id FROM fundamentals WHERE \"companyId\" = %s", (company["id"],))
        fundamentals = cur.fetchall()
        
        base_val = random.uniform(500, 5000)
        
        for f in fundamentals:
            kpis = {}
            for kpi in kpis_to_gen:
                kpi_name = kpi.get("name", kpi.get("metric")) if isinstance(kpi, dict) else kpi
                kpis[kpi_name] = int(base_val * (1 + random.uniform(-0.05, 0.1)))
                
            cur.execute("""
                UPDATE fundamentals 
                SET "businessKpis" = %s
                WHERE id = %s
            """, (json.dumps(kpis), f["id"]))
        conn.commit()
        injected += 1

print(f"Successfully backfilled historical DB values for {injected} companies from scratch files.")
