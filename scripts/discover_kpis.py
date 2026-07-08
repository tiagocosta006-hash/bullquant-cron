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
    text = soup.get_text(separator="\n", strip=True)
    
    # Simple heuristic to grab text around "Item 7" or "Management's Discussion"
    lines = text.split("\n")
    mda_start = -1
    for i, line in enumerate(lines):
        if "Item 7" in line and "Management" in line and "Discussion" in line:
            mda_start = i
            break
            
    if mda_start == -1: return text[:5000] # fallback to first 5000 chars
    
    return "\n".join(lines[mda_start:mda_start+200]) # Grab the first 200 lines of MD&A

def main():
    tickers = sys.argv[1:] if len(sys.argv) > 1 else ["UBER", "ABNB", "PLTR"]
    conn = psycopg2.connect(DB_URL)
    
    results = {}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        for ticker in tickers:
            print(f"Fetching latest 10-K for {ticker}...")
            cur.execute("SELECT cik FROM companies WHERE ticker = %s", (ticker,))
            company = cur.fetchone()
            if not company:
                print(f"Ticker {ticker} not found.")
                continue
                
            url = get_latest_10k_url(company["cik"])
            if not url:
                print(f"Could not find 10-K for {ticker}.")
                continue
                
            mda_text = fetch_mda_section(url)
            results[ticker] = mda_text
            print(f"Extracted {len(mda_text)} chars of MD&A for {ticker}.")
            
    with open("scratch/mda_chunks.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Saved MD&A chunks to scratch/mda_chunks.json")

if __name__ == "__main__":
    main()
