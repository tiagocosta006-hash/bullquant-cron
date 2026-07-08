import os
import sys
import json
import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import warnings
from bs4 import XMLParsedAsHTMLWarning
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

load_dotenv(dotenv_path=".env.local")
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
HEADERS = {"User-Agent": "Tiago Costa tiagocosta@example.com"}

with open("scripts/kpi_definitions.json", "r") as f:
    KPI_DEFS = json.load(f)

def get_latest_10k_url(cik: str) -> str | None:
    cik_padded = str(cik).zfill(10)
    url = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200: return None
        
    filings = resp.json().get("filings", {}).get("recent", {})
    if not filings: return None
        
    accessionNumbers = filings.get("accessionNumber", [])
    primaryDocuments = filings.get("primaryDocument", [])
    forms = filings.get("form", [])
    
    for i in range(len(accessionNumbers)):
        if forms[i] == "10-K":
            acc_num_no_dash = accessionNumbers[i].replace("-", "")
            return f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_num_no_dash}/{primaryDocuments[i]}"
    return None

def fetch_mda_section(url: str) -> str:
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200: return ""
    soup = BeautifulSoup(resp.content, "lxml")
    # Return the entire text of the document instead of trying to crop Item 7
    # Gemini 2.5 Flash has 1M token context, so the full document is easily processed
    text = soup.get_text(separator="\n", strip=True)
    return text

# Top Priority S&P 500 Companies (Market Cap leaders)
TOP_COMPANIES = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "BRK.B", "LLY", "TSLA", "AVGO",
    "JPM", "V", "UNH", "MA", "PG", "JNJ", "HD", "MRK", "COST", "ABBV",
    "CRM", "AMD", "NFLX", "CVX", "PEP", "KO", "BAC", "WMT", "TMO", "MCD"
]

def main():
    batch_size = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    conn = psycopg2.connect(DB_URL)
    
    results = {}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Fetch companies that are in the TOP_COMPANIES list first
        cur.execute("SELECT ticker, cik FROM companies")
        all_db_companies = cur.fetchall()
        
        # Create a sorted list: TOP_COMPANIES first, then the rest
        top_set = set(TOP_COMPANIES)
        sorted_companies = [c for c in all_db_companies if c["ticker"] in top_set]
        sorted_companies.extend([c for c in all_db_companies if c["ticker"] not in top_set])
        
        count = 0
        for company in sorted_companies:
            # We ONLY skip if the company is in KPI_DEFS and ALREADY HAS REAL VALUES.
            # But wait, to be safe, since we wiped the DB, we want to re-process ALL TOP 30 companies!
            # If they are in TOP_COMPANIES, we process them regardless of whether they are in KPI_DEFS
            # If they are NOT in TOP_COMPANIES, we skip if they are in KPI_DEFS to avoid re-running 300 companies that have names
            if company["ticker"] not in top_set and company["ticker"] in KPI_DEFS:
                continue
            
            print(f"Fetching latest 10-K for {company['ticker']}...")
            url = get_latest_10k_url(company["cik"])
            if not url: continue
                
            mda_text = fetch_mda_section(url)
            results[company["ticker"]] = mda_text
            count += 1
            if count >= batch_size: break
            
    with open("scratch/current_mda_batch.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"Saved {count} MD&A chunks to scratch/current_mda_batch.json")

if __name__ == "__main__":
    main()
