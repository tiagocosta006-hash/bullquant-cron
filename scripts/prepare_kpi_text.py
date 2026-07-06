import os
import json
import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
HEADERS = {"User-Agent": "Tiago Costa tiagocosta@example.com"}

with open("scripts/kpi_definitions.json", "r") as f:
    KPI_DEFS = json.load(f)

def get_edgar_html_url(cik: str, period_end_str: str) -> str | None:
    cik_padded = str(cik).zfill(10)
    url = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200: return None
        
    filings = resp.json().get("filings", {}).get("recent", {})
    if not filings: return None
        
    accessionNumbers = filings.get("accessionNumber", [])
    reportDates = filings.get("reportDate", [])
    primaryDocuments = filings.get("primaryDocument", [])
    forms = filings.get("form", [])
    
    for i in range(len(accessionNumbers)):
        if forms[i] in ["10-K", "10-Q"] and reportDates[i] == period_end_str:
            acc_num_no_dash = accessionNumbers[i].replace("-", "")
            return f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_num_no_dash}/{primaryDocuments[i]}"
    return None

def fetch_and_clean_text(url: str, keywords: list[str]) -> str:
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200: return ""
    
    import warnings
    from bs4 import XMLParsedAsHTMLWarning
    warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
    
    soup = BeautifulSoup(resp.content, "lxml")
    elements = soup.find_all(['p', 'span', 'td', 'div'])
    chunks = []
    
    for i, el in enumerate(elements):
        text = el.get_text(strip=True).lower()
        if not text: continue
        found = any(kw in text for kw in keywords)
        if found:
            start = max(0, i - 10)
            end = min(len(elements), i + 10)
            context = " ".join([elements[j].get_text(strip=True) for j in range(start, end) if elements[j].get_text(strip=True)])
            chunks.append(context)
            
    unique_chunks = list(set(chunks))
    return "\n\n---\n\n".join(unique_chunks[:10])

import sys

def main():
    conn = psycopg2.connect(DB_URL)
    output = {}
    
    tickers_to_process = sys.argv[1:] if len(sys.argv) > 1 else list(KPI_DEFS.keys())
    
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        for ticker in tickers_to_process:
            if ticker not in KPI_DEFS: continue
            kpis = KPI_DEFS[ticker]
            print(f"Preparing chunks for {ticker}...")
            cur.execute("SELECT id, cik FROM companies WHERE ticker = %s", (ticker,))
            company = cur.fetchone()
            if not company: continue
            
            cur.execute("""
                SELECT "periodType", "fiscalYear", "fiscalQuarter", "periodEnd"
                FROM fundamentals 
                WHERE "companyId" = %s AND "businessKpis" IS NULL
                ORDER BY "periodEnd" DESC LIMIT 4
            """, (company["id"],))
            periods = cur.fetchall()
            
            all_keywords = []
            for k in kpis: all_keywords.extend(k["keywords"])
            
            ticker_data = []
            for p in periods:
                p_end = p["periodEnd"].strftime("%Y-%m-%d")
                url = get_edgar_html_url(company["cik"], p_end)
                if not url: continue
                text = fetch_and_clean_text(url, all_keywords)
                if text:
                    ticker_data.append({
                        "periodType": p["periodType"],
                        "fiscalYear": p["fiscalYear"],
                        "fiscalQuarter": p["fiscalQuarter"],
                        "text": text
                    })
            if ticker_data:
                output[ticker] = ticker_data

    # Save to scratch directory
    os.makedirs("/Users/tiagocosta18/.gemini/antigravity/brain/b296142d-5e1b-43a7-afeb-ddec21b5f615/scratch", exist_ok=True)
    out_path = "/Users/tiagocosta18/.gemini/antigravity/brain/b296142d-5e1b-43a7-afeb-ddec21b5f615/scratch/kpi_text_chunks.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Text chunks saved to {out_path}")

if __name__ == "__main__":
    main()
