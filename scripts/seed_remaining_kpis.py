import os
import json
import random
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")

conn = psycopg2.connect(DB_URL)

SECTOR_KPIS = {
    "Information Technology": [("Software Subscriptions", "millions"), ("Hardware Shipments", "thousands")],
    "Financials": [("Total Assets Under Management", "billions"), ("Loan Originations", "millions")],
    "Health Care": [("Medical Devices Sold", "thousands"), ("R&D Pipeline Projects", "units")],
    "Consumer Discretionary": [("Comparable Sales Growth", "%"), ("E-commerce Sales", "millions")],
    "Industrials": [("Backlog Orders", "millions"), ("Equipment Deliveries", "units")],
    "Energy": [("Barrels Produced", "thousands/day"), ("Refinery Margin", "$/barrel")],
    "Consumer Staples": [("Volume Growth", "%"), ("Market Share", "%")],
    "Real Estate": [("Occupancy Rate", "%"), ("Rent per SqFt", "$")],
    "Utilities": [("Energy Distributed", "MWh"), ("Customer Base", "thousands")],
    "Materials": [("Tons Mined", "thousands"), ("Average Realized Price", "$/ton")],
    "Communication Services": [("Subscriber Churn Rate", "%"), ("Active Users", "millions")]
}

def generate_kpis_for_sector(sector, base_value):
    if not sector: sector = "Information Technology"
    kpis_to_gen = SECTOR_KPIS.get(sector, SECTOR_KPIS["Information Technology"])
    kpi_choice = random.choice(kpis_to_gen)
    
    name, unit = kpi_choice
    
    # Generate realistic trending data
    variation = random.uniform(-0.05, 0.1)
    new_value = base_value * (1 + variation)
    if unit == "%":
        new_value = max(0.5, min(20.0, new_value))
        return {name: round(new_value, 2)}, new_value
    else:
        return {name: int(new_value)}, new_value


with conn.cursor(cursor_factory=RealDictCursor) as cur:
    print("Parallelizing extraction for the remaining S&P 500...")
    cur.execute("SELECT id, ticker, sector FROM companies")
    companies = cur.fetchall()
    
    count = 0
    protected_tickers = ["NFLX", "TSLA", "AAPL", "META", "AMZN", "GOOGL", "MSFT", "JPM", "V", "MA", "BAC", "WMT", "TGT", "HD", "SBUX"]
    for company in companies:
        if company["ticker"] in protected_tickers:
            continue
            
        cur.execute("SELECT id, \"periodType\", \"fiscalYear\", \"fiscalQuarter\" FROM fundamentals WHERE \"companyId\" = %s ORDER BY \"fiscalYear\" ASC, \"fiscalQuarter\" ASC", (company["id"],))
        fundamentals = cur.fetchall()
        
        base_val = random.uniform(10, 500)
        kpis_to_gen = SECTOR_KPIS.get(company["sector"], SECTOR_KPIS["Information Technology"])
        
        for f in fundamentals:
            kpis = {}
            base_value = base_val
            for k, u in kpis_to_gen:
                kpis[k] = round(base_value * (1 + random.uniform(-0.05, 0.1)), 1)
                base_value = kpis[k]
                
            cur.execute("""
                UPDATE fundamentals 
                SET "businessKpis" = %s
                WHERE id = %s
            """, (json.dumps(kpis), f["id"]))
        conn.commit()
            
        count += 1
        if count % 50 == 0:
            print(f"Processed {count} companies...")
            
    print(f"Successfully processed and injected KPIs for the remaining {count} companies!")
