import os
import json
import time
import psycopg2
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from google import genai
from google.genai import types
import re

load_dotenv(".env.local")

# Configs
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL_ID = "gemini-flash-latest"
HEADERS = {"User-Agent": "TiagoCosta18 (tiago@example.com)"}
SLEEP_TIME = 0

# Top Priority S&P 500 Companies (Market Cap leaders)
TOP_COMPANIES = [
    "AAPL", "AMZN", "META", "TSLA", "NVDA"
]

def get_latest_10k_url(cik: str) -> str:
    if not cik: return None
    submissions_url = f"https://data.sec.gov/submissions/CIK{str(cik).zfill(10)}.json"
    resp = requests.get(submissions_url, headers=HEADERS)
    if resp.status_code != 200: return None
    data = resp.json()
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessionNumbers = recent.get("accessionNumber", [])
    primaryDocuments = recent.get("primaryDocument", [])
    for i, form in enumerate(forms):
        if form == "10-K":
            acc_num_no_dash = accessionNumbers[i].replace("-", "")
            return f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_num_no_dash}/{primaryDocuments[i]}"
    return None

def fetch_full_text(url: str) -> str:
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200: return ""
    soup = BeautifulSoup(resp.content, "lxml")
    return soup.get_text(separator="\n", strip=True)

def main():
    if not API_KEY:
        print("Error: GEMINI_API_KEY missing.")
        return

    conn = psycopg2.connect(DB_URL)
    client = genai.Client(api_key=API_KEY)
    
    # Load definitions
    try:
        with open("scripts/kpi_definitions.json", "r") as f:
            KPI_DEFS = json.load(f)
    except:
        KPI_DEFS = {}

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, ticker, cik FROM companies")
        all_db_companies = cur.fetchall()
        
        # Sort priorities
        top_set = set(TOP_COMPANIES)
        sorted_companies = [c for c in all_db_companies if c["ticker"] in top_set]
        
        for company in sorted_companies:
            ticker = company["ticker"]
            company_id = company["id"]
            
            # Check if this company already has REAL data populated
            # We check if fundamentals "businessKpis" is not empty '{}'
            cur.execute("SELECT \"businessKpis\" FROM fundamentals WHERE \"companyId\" = %s AND \"periodType\" = 'ANNUAL' AND \"businessKpis\"::text != '{}' LIMIT 1", (company_id,))
            has_real_data = cur.fetchone()
            
            if has_real_data:
                print(f"Skipping {ticker} - already has real KPI data in database.")
                continue

            print(f"\n--- Processing {ticker} ---")
            url = get_latest_10k_url(company["cik"])
            if not url:
                print(f"Failed to find 10-K URL for {ticker}")
                continue
                
            print(f"Downloading 10-K...")
            text = fetch_full_text(url)
            if not text:
                print(f"Failed to fetch text for {ticker}")
                continue
                
            print(f"Downloaded {len(text)} characters. Calling Gemini API...")
            
            existing_kpis = KPI_DEFS.get(ticker, [])
            kpi_names_str = ""
            if existing_kpis:
                names = [k.get("name", k.get("metric")) if isinstance(k, dict) else k for k in existing_kpis]
                kpi_names_str = "Look SPECIFICALLY for these previously discovered KPIs: " + ", ".join(names)

            prompt = f"""
# MISSION
You are an Elite Equity Research Analyst specializing in forensic accounting and SEC filings. Your sole job is to read the provided text of a US public company (usually a 10-K) and extract their EXACT, specific Business KPIs (Key Performance Indicators) ALONG WITH their historical numerical values.

# CRITICAL RULES (ZERO TOLERANCE)
1. **NO GUESSING / NO HALLUCINATION:** If a KPI is not explicitly mentioned and tracked as a core operating metric in the provided text, DO NOT invent it.
2. **NO GENERIC FINANCIALS:** Do NOT extract standard GAAP financial metrics like "Net Income", "EBITDA", "Gross Margin", or "Revenue". We want Non-GAAP operating metrics (e.g., "Monthly Active Users", "Same-Store Sales", "Vehicle Deliveries").
3. **INDUSTRY SPECIFICITY:** The KPIs must be unique to the company's business model.
4. **NUMERICAL EXTRACTION:** For every valid KPI you find, you MUST extract the actual numerical values mentioned in the text for ALL periods compared (typically the 3 most recent fiscal years). Map them to the explicit calendar/fiscal year string mentioned.
5. **TARGET KPIs:** {kpi_names_str}

# OUTPUT FORMAT
You must respond with ONLY a valid JSON object containing `kpis` (array of KPI objects). Do not include markdown formatting outside the JSON block.
Example:
{{
  "kpis": [
    {{
      "name": "Vehicle Deliveries",
      "type": "number",
      "unit": "vehicles",
      "values": {{
        "2025": 1808581,
        "2024": 1313851,
        "2023": 936222
      }}
    }}
  ]
}}

# TEXT TO ANALYZE
{text}
"""
            try:
                response = client.models.generate_content(
                    model=MODEL_ID,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.0
                    )
                )
                
                result_json = json.loads(response.text)
                
                if "kpis" in result_json:
                    extracted_kpis = result_json["kpis"]
                    KPI_DEFS[ticker] = extracted_kpis
                    
                    with open("scripts/kpi_definitions.json", "w") as f:
                        json.dump(KPI_DEFS, f, indent=4)
                        
                    print(f"Updated kpi_definitions.json for {ticker}.")
                    
                    # Inject into DB
                    cur.execute("SELECT id, \"fiscalYear\" FROM fundamentals WHERE \"companyId\" = %s AND \"periodType\" = 'ANNUAL'", (company_id,))
                    fundamentals = cur.fetchall()
                    
                    for f_row in fundamentals:
                        fiscal_year_str = str(f_row["fiscalYear"])
                        kpis_for_this_year = {}
                        
                        for kpi in extracted_kpis:
                            kpi_name = kpi.get("name", kpi.get("metric"))
                            values_dict = kpi.get("values", {})
                            
                            if fiscal_year_str in values_dict:
                                try:
                                    val = values_dict[fiscal_year_str]
                                    if isinstance(val, str): val = float(val.replace(',', ''))
                                    kpis_for_this_year[kpi_name] = val
                                except ValueError: pass
                                
                        if kpis_for_this_year:
                            cur.execute(
                                "UPDATE fundamentals SET \"businessKpis\" = %s WHERE id = %s",
                                (json.dumps(kpis_for_this_year), f_row["id"])
                            )
                    conn.commit()
                    print(f"Successfully injected real KPIs for {ticker} into Database!")
                else:
                    print(f"No KPIs found for {ticker} by Gemini.")
                    
            except Exception as e:
                print(f"Error processing {ticker}: {e}")
                
            print(f"Sleeping for {SLEEP_TIME} seconds to respect Free Tier API limits...")
            time.sleep(SLEEP_TIME)

if __name__ == "__main__":
    import psycopg2.extras
    main()
