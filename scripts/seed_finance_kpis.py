import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")

conn = psycopg2.connect(DB_URL)

kpi_data = {
    "JPM": {
        ("QUARTERLY", 2026, 1): {"Credit Card Sales Volume": 487600},
        ("QUARTERLY", 2025, 4): {"Credit Card Sales Volume": 492300},
        ("QUARTERLY", 2025, 3): {"Credit Card Sales Volume": 480000},
        ("ANNUAL", 2025, None): {"Credit Card Sales Volume": 1900000},
    },
    "V": {
        ("QUARTERLY", 2026, 2): {"Payments Volume": 3733},
        ("QUARTERLY", 2026, 1): {"Payments Volume": 3868},
        ("QUARTERLY", 2025, 4): {"Payments Volume": 3822},
        ("ANNUAL", 2025, None): {"Payments Volume": 14800},
    },
    "MA": {
        ("QUARTERLY", 2026, 1): {"Gross Dollar Volume": 2350},
        ("QUARTERLY", 2025, 4): {"Gross Dollar Volume": 2400},
        ("QUARTERLY", 2025, 3): {"Gross Dollar Volume": 2310},
        ("ANNUAL", 2025, None): {"Gross Dollar Volume": 9000},
    },
    "BAC": {
        ("QUARTERLY", 2026, 1): {"Total Deposits": 2037663},
        ("QUARTERLY", 2025, 4): {"Total Deposits": 2018729},
        ("QUARTERLY", 2025, 3): {"Total Deposits": 1991434},
        ("ANNUAL", 2025, None): {"Total Deposits": 2018729},
    }
}

with conn.cursor(cursor_factory=RealDictCursor) as cur:
    for ticker, periods in kpi_data.items():
        cur.execute('SELECT id FROM companies WHERE ticker = %s', (ticker,))
        company = cur.fetchone()
        if not company: 
            print(f"Company {ticker} not found in DB.")
            continue
        
        for p, kpis in periods.items():
            p_type, f_year, f_quarter = p
            
            cur.execute("""
                UPDATE fundamentals
                SET "businessKpis" = %s
                WHERE "companyId" = %s AND "periodType" = %s AND "fiscalYear" = %s AND "fiscalQuarter" IS NOT DISTINCT FROM %s
            """, (json.dumps(kpis), company["id"], p_type, f_year, f_quarter))
            
    conn.commit()
    print("Successfully injected Finance KPIs into the Database!")

