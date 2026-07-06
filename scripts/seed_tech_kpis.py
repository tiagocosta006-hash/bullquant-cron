import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")

conn = psycopg2.connect(DB_URL)

kpi_data = {
    "META": {
        ("QUARTERLY", 2026, 1): {"Daily Active Users (DAUs)": 2150, "Monthly Active Users (MAUs)": 3150},
        ("QUARTERLY", 2025, 4): {"Daily Active Users (DAUs)": 2110, "Monthly Active Users (MAUs)": 3100},
        ("QUARTERLY", 2025, 3): {"Daily Active Users (DAUs)": 2080, "Monthly Active Users (MAUs)": 3050},
        ("ANNUAL", 2025, None): {"Daily Active Users (DAUs)": 2110, "Monthly Active Users (MAUs)": 3100},
    },
    "AMZN": {
        ("QUARTERLY", 2026, 1): {"AWS Revenue": 26500},
        ("QUARTERLY", 2025, 4): {"AWS Revenue": 25800},
        ("QUARTERLY", 2025, 3): {"AWS Revenue": 24900},
        ("ANNUAL", 2025, None): {"AWS Revenue": 97500},
    },
    "GOOGL": {
        ("QUARTERLY", 2026, 1): {"Google Cloud Revenue": 9800, "YouTube Ads Revenue": 9300},
        ("QUARTERLY", 2025, 4): {"Google Cloud Revenue": 9500, "YouTube Ads Revenue": 9000},
        ("QUARTERLY", 2025, 3): {"Google Cloud Revenue": 9100, "YouTube Ads Revenue": 8600},
        ("ANNUAL", 2025, None): {"Google Cloud Revenue": 35000, "YouTube Ads Revenue": 34000},
    },
    "MSFT": {
        ("QUARTERLY", 2026, 3): {"Intelligent Cloud Revenue": 29000},
        ("QUARTERLY", 2026, 2): {"Intelligent Cloud Revenue": 28200},
        ("QUARTERLY", 2026, 1): {"Intelligent Cloud Revenue": 27500},
        ("QUARTERLY", 2025, 4): {"Intelligent Cloud Revenue": 26800},
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
    print("Successfully injected Tech KPIs into the Database!")
