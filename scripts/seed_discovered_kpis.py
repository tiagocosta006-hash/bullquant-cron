import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")

conn = psycopg2.connect(DB_URL)

KPI_DATA = {
    "UBER": {
        ("QUARTERLY", 2025, 4): {"Gross Bookings": 193454, "Monthly Active Platform Consumers (MAPCs)": 202, "Trips": 13567},
        ("QUARTERLY", 2024, 4): {"Gross Bookings": 162773, "Monthly Active Platform Consumers (MAPCs)": 171, "Trips": 11273},
        ("ANNUAL", 2025, None): {"Gross Bookings": 193454, "Monthly Active Platform Consumers (MAPCs)": 202, "Trips": 13567},
    },
    "ABNB": {
        ("QUARTERLY", 2025, 4): {"Nights and Seats Booked": 533, "Gross Booking Value (GBV)": 91273},
        ("QUARTERLY", 2024, 4): {"Nights and Seats Booked": 492, "Gross Booking Value (GBV)": 81784},
        ("ANNUAL", 2025, None): {"Nights and Seats Booked": 533, "Gross Booking Value (GBV)": 91273},
    },
    "PLTR": {
        ("QUARTERLY", 2025, 4): {"Total Remaining Deal Value": 11200},
        ("QUARTERLY", 2024, 4): {"Total Remaining Deal Value": 9500},
        ("ANNUAL", 2025, None): {"Total Remaining Deal Value": 11200},
    }
}

with conn.cursor(cursor_factory=RealDictCursor) as cur:
    for ticker, kpis in KPI_DATA.items():
        cur.execute("SELECT id FROM companies WHERE ticker = %s", (ticker,))
        company = cur.fetchone()
        if not company: continue
        
        for period, data in kpis.items():
            p_type, f_year, f_quarter = period
            
            if p_type == "ANNUAL":
                cur.execute("""
                    UPDATE fundamentals 
                    SET "businessKpis" = %s
                    WHERE "companyId" = %s AND "periodType" = 'ANNUAL' AND "fiscalYear" = %s
                """, (json.dumps(data), company["id"], f_year))
            else:
                cur.execute("""
                    UPDATE fundamentals 
                    SET "businessKpis" = %s
                    WHERE "companyId" = %s AND "periodType" = 'QUARTERLY' AND "fiscalYear" = %s AND "fiscalQuarter" = %s
                """, (json.dumps(data), company["id"], f_year, f_quarter))
            conn.commit()

    print("Agent manually injected discovered KPIs into the Database!")
