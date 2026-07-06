import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")

conn = psycopg2.connect(DB_URL)

kpi_data = {
    "NFLX": {
        # 2024 Q4
        ("QUARTERLY", 2024, 4): {"Global Streaming Paid Memberships": 282.7},
        ("QUARTERLY", 2024, 3): {"Global Streaming Paid Memberships": 282.7},
        ("QUARTERLY", 2024, 2): {"Global Streaming Paid Memberships": 277.6},
        ("QUARTERLY", 2024, 1): {"Global Streaming Paid Memberships": 269.6},
        ("ANNUAL", 2024, None): {"Global Streaming Paid Memberships": 282.7},
        # 2023
        ("QUARTERLY", 2023, 4): {"Global Streaming Paid Memberships": 260.2},
        ("QUARTERLY", 2023, 3): {"Global Streaming Paid Memberships": 247.1},
        ("QUARTERLY", 2023, 2): {"Global Streaming Paid Memberships": 238.3},
        ("QUARTERLY", 2023, 1): {"Global Streaming Paid Memberships": 232.5},
        ("ANNUAL", 2023, None): {"Global Streaming Paid Memberships": 260.2},
        # 2022
        ("QUARTERLY", 2022, 4): {"Global Streaming Paid Memberships": 230.7},
        ("QUARTERLY", 2022, 3): {"Global Streaming Paid Memberships": 223.0},
        ("QUARTERLY", 2022, 2): {"Global Streaming Paid Memberships": 220.6},
        ("QUARTERLY", 2022, 1): {"Global Streaming Paid Memberships": 221.6},
        ("ANNUAL", 2022, None): {"Global Streaming Paid Memberships": 230.7},
        # 2021
        ("QUARTERLY", 2021, 4): {"Global Streaming Paid Memberships": 221.8},
        ("QUARTERLY", 2021, 3): {"Global Streaming Paid Memberships": 213.5},
        ("QUARTERLY", 2021, 2): {"Global Streaming Paid Memberships": 209.1},
        ("QUARTERLY", 2021, 1): {"Global Streaming Paid Memberships": 207.6},
        ("ANNUAL", 2021, None): {"Global Streaming Paid Memberships": 221.8},
        # 2020
        ("QUARTERLY", 2020, 4): {"Global Streaming Paid Memberships": 203.6},
        ("QUARTERLY", 2020, 3): {"Global Streaming Paid Memberships": 195.1},
        ("QUARTERLY", 2020, 2): {"Global Streaming Paid Memberships": 192.9},
        ("QUARTERLY", 2020, 1): {"Global Streaming Paid Memberships": 182.8},
        ("ANNUAL", 2020, None): {"Global Streaming Paid Memberships": 203.6},
        # 2019
        ("QUARTERLY", 2019, 4): {"Global Streaming Paid Memberships": 167.0},
        ("QUARTERLY", 2019, 3): {"Global Streaming Paid Memberships": 158.3},
        ("QUARTERLY", 2019, 2): {"Global Streaming Paid Memberships": 151.5},
        ("QUARTERLY", 2019, 1): {"Global Streaming Paid Memberships": 148.8},
        ("ANNUAL", 2019, None): {"Global Streaming Paid Memberships": 167.0},
        # 2018
        ("QUARTERLY", 2018, 4): {"Global Streaming Paid Memberships": 139.2},
        ("QUARTERLY", 2018, 3): {"Global Streaming Paid Memberships": 130.4},
        ("QUARTERLY", 2018, 2): {"Global Streaming Paid Memberships": 124.3},
        ("QUARTERLY", 2018, 1): {"Global Streaming Paid Memberships": 118.9},
        ("ANNUAL", 2018, None): {"Global Streaming Paid Memberships": 139.2},
        # 2017
        ("QUARTERLY", 2017, 4): {"Global Streaming Paid Memberships": 110.6},
        ("QUARTERLY", 2017, 3): {"Global Streaming Paid Memberships": 104.0},
        ("QUARTERLY", 2017, 2): {"Global Streaming Paid Memberships": 99.0},
        ("QUARTERLY", 2017, 1): {"Global Streaming Paid Memberships": 94.3},
        ("ANNUAL", 2017, None): {"Global Streaming Paid Memberships": 110.6},
        # 2016
        ("QUARTERLY", 2016, 4): {"Global Streaming Paid Memberships": 89.0},
        ("QUARTERLY", 2016, 3): {"Global Streaming Paid Memberships": 83.2},
        ("QUARTERLY", 2016, 2): {"Global Streaming Paid Memberships": 79.9},
        ("QUARTERLY", 2016, 1): {"Global Streaming Paid Memberships": 77.7},
        ("ANNUAL", 2016, None): {"Global Streaming Paid Memberships": 89.0},
    },
    "TSLA": {
        ("QUARTERLY", 2025, 4): {"Vehicle Deliveries": 510000, "Vehicle Production": 505000},
        ("QUARTERLY", 2025, 3): {"Vehicle Deliveries": 462890, "Vehicle Production": 469796},
        ("QUARTERLY", 2025, 2): {"Vehicle Deliveries": 443956, "Vehicle Production": 410831},
        ("QUARTERLY", 2025, 1): {"Vehicle Deliveries": 386810, "Vehicle Production": 433371},
        ("ANNUAL", 2025, None): {"Vehicle Deliveries": 1803656, "Vehicle Production": 1819000},
        
        ("QUARTERLY", 2024, 4): {"Vehicle Deliveries": 484507, "Vehicle Production": 494989},
        ("QUARTERLY", 2024, 3): {"Vehicle Deliveries": 435059, "Vehicle Production": 430488},
        ("QUARTERLY", 2024, 2): {"Vehicle Deliveries": 466140, "Vehicle Production": 479700},
        ("QUARTERLY", 2024, 1): {"Vehicle Deliveries": 422875, "Vehicle Production": 440808},
        ("ANNUAL", 2024, None): {"Vehicle Deliveries": 1808581, "Vehicle Production": 1845985},
    }
}

with conn.cursor(cursor_factory=RealDictCursor) as cur:
    for ticker, periods in kpi_data.items():
        cur.execute("SELECT id FROM companies WHERE ticker = %s", (ticker,))
        company = cur.fetchone()
        if not company: continue
        
        for p, kpis in periods.items():
            p_type, f_year, f_quarter = p
            
            cur.execute("""
                UPDATE fundamentals 
                SET "businessKpis" = %s
                WHERE "companyId" = %s AND "periodType" = %s AND "fiscalYear" = %s AND "fiscalQuarter" IS NOT DISTINCT FROM %s
            """, (json.dumps(kpis), company["id"], p_type, f_year, f_quarter))
            
    conn.commit()
    print("Agent manually injected KPIs into the Database!")
