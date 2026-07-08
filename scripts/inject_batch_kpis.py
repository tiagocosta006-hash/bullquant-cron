import os
import json
import random
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB_URL)

import sys

with open("scripts/kpi_definitions.json", "r") as f:
    KPI_DEFS = json.load(f)

if len(sys.argv) > 1:
    tickers_to_process = sys.argv[1:]
else:
    print("Usage: python3 scripts/inject_batch_kpis.py TICKER1 TICKER2...")
    sys.exit(1)

with conn.cursor(cursor_factory=RealDictCursor) as cur:
    for ticker in tickers_to_process:
        cur.execute("SELECT id FROM companies WHERE ticker = %s", (ticker,))
        company = cur.fetchone()
        if not company: continue
            
        cur.execute("SELECT id, \"fiscalYear\", \"periodEnd\" FROM fundamentals WHERE \"companyId\" = %s AND \"periodType\" = 'ANNUAL' ORDER BY \"fiscalYear\" DESC", (company["id"],))
        fundamentals = cur.fetchall()
        
        if not fundamentals:
            continue
            
        kpis_to_gen = KPI_DEFS.get(ticker, [])
        
        # We need to map fiscalYear (which is an int) to the values dict keys (which are strings like '2023')
        for f in fundamentals:
            fiscal_year_str = str(f["fiscalYear"])
            kpis_for_this_year = {}
            
            for kpi in kpis_to_gen:
                if isinstance(kpi, dict):
                    kpi_name = kpi.get("name", kpi.get("metric"))
                    values_dict = kpi.get("values", {})
                    
                    # Check if the extracted values dictionary has a key for this fiscal year
                    if fiscal_year_str in values_dict:
                        # Ensure it's numeric and inject it
                        try:
                            # Strip out commas or non-numeric stuff just in case
                            val = values_dict[fiscal_year_str]
                            if isinstance(val, str):
                                val = float(val.replace(',', ''))
                            kpis_for_this_year[kpi_name] = val
                        except ValueError:
                            pass
                else:
                    # If it's a string, it has no real values
                    continue
                    
            if kpis_for_this_year:
                # Update the database only if we have real values for this year
                cur.execute(
                    "UPDATE fundamentals SET \"businessKpis\" = %s WHERE id = %s",
                    (json.dumps(kpis_for_this_year), f["id"])
                )
        conn.commit()
        print(f"Injected historical KPIs for {ticker}.")
        
print("Successfully injected batch KPIs!")
