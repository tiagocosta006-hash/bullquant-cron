import json
import psycopg2
import os
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
conn = psycopg2.connect(os.environ.get("DIRECT_URL"))

with conn.cursor() as cur:
    cur.execute("SELECT ticker, sector, industry FROM companies")
    companies = {r[0]: {"sector": r[1], "industry": r[2]} for r in cur.fetchall()}
    
    cur.execute("""
        SELECT c.ticker, f."businessKpis" 
        FROM companies c 
        JOIN fundamentals f ON c.id = f."companyId" 
        WHERE f."businessKpis" IS NOT NULL
    """)
    # Create a dictionary of ticker -> list of KPI names
    kpis = {}
    for row in cur.fetchall():
        ticker = row[0]
        kpi_dict = row[1]
        if ticker not in kpis and isinstance(kpi_dict, dict):
            kpis[ticker] = list(kpi_dict.keys())

generic_terms = ["Revenue", "Sales", "Margin", "Income", "Profit", "EBITDA", "Cash Flow", "Earnings"]
tech_terms = ["Active Users", "Subscribers", "ARR", "Bookings"]

issues_found = []
kpi_frequencies = defaultdict(int)

for ticker, kpi_list in kpis.items():
    comp = companies.get(ticker, {})
    sector = comp.get("sector", "Unknown")
    
    for kpi in kpi_list:
        kpi_name = kpi["name"] if isinstance(kpi, dict) else kpi
        kpi_frequencies[kpi_name] += 1
        
        # Check generic
        for term in generic_terms:
            if kpi_name == term: # Exact match to generic
                issues_found.append(f"{ticker} ({sector}): Too generic KPI - '{kpi_name}'")
                
        # Check tech terms in non-tech
        if sector not in ["Information Technology", "Communication Services", "Consumer Discretionary"]:
            for term in tech_terms:
                if term.lower() in kpi_name.lower():
                    issues_found.append(f"{ticker} ({sector}): Tech KPI '{kpi_name}' in non-tech sector")

print("=== KPI AUDIT REPORT ===")
print(f"Total Companies Audited: {len(kpis)}")
print(f"Total Unique KPIs: {len(kpi_frequencies)}")

print("\n--- ISSUES DETECTED ---")
if not issues_found:
    print("No immediate anomalies detected based on basic heuristic rules.")
else:
    for issue in issues_found[:50]: # Print top 50
        print(issue)
        
print("\n--- MOST FREQUENT KPIs (Potential Generics) ---")
sorted_freq = sorted(kpi_frequencies.items(), key=lambda x: x[1], reverse=True)
for k, v in sorted_freq[:15]:
    print(f"{k}: {v} companies")
