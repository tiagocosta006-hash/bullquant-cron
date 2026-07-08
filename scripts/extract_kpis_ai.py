import os
import json
import re
import time
import requests
from bs4 import BeautifulSoup
from google import genai
from google.genai import types
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")

DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

client = genai.Client(api_key=GEMINI_API_KEY)

# Load definitions
with open("scripts/kpi_definitions.json", "r") as f:
    KPI_DEFS = json.load(f)

HEADERS = {"User-Agent": "Tiago Costa tiagocosta@example.com"}

def get_edgar_html_url(cik: str, period_end_str: str) -> str | None:
    # pad cik
    cik_padded = str(cik).zfill(10)
    url = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"
    
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        print(f"Failed to fetch submissions for CIK {cik}")
        return None
        
    data = resp.json()
    filings = data.get("filings", {}).get("recent", {})
    if not filings:
        return None
        
    accessionNumbers = filings.get("accessionNumber", [])
    reportDates = filings.get("reportDate", [])
    primaryDocuments = filings.get("primaryDocument", [])
    forms = filings.get("form", [])
    
    # We want 10-K, 10-Q or 8-K matching the period_end exactly or closely
    for i in range(len(accessionNumbers)):
        if forms[i] in ["10-K", "10-Q"] and reportDates[i] == period_end_str:
            acc_num = accessionNumbers[i]
            acc_num_no_dash = acc_num.replace("-", "")
            doc = primaryDocuments[i]
            return f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_num_no_dash}/{doc}"
    return None

def fetch_and_clean_text(url: str, keywords: list[str]) -> str:
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        return ""
        
    soup = BeautifulSoup(resp.content, "lxml")
    
    # Extract text from paragraphs and table rows
    elements = soup.find_all(['p', 'span', 'td', 'div'])
    
    chunks = []
    # simple sliding window of text elements
    for i, el in enumerate(elements):
        text = el.get_text(strip=True).lower()
        if not text:
            continue
            
        found = False
        for kw in keywords:
            if kw in text:
                found = True
                break
                
        if found:
            # grab surrounding context
            start = max(0, i - 10)
            end = min(len(elements), i + 10)
            context = " ".join([elements[j].get_text(strip=True) for j in range(start, end) if elements[j].get_text(strip=True)])
            chunks.append(context)
            
    # deduplicate and combine
    unique_chunks = list(set(chunks))
    return "\n\n---\n\n".join(unique_chunks[:20]) # limit to top 20 chunks to save tokens

def extract_with_gemini(text_context: str, kpi_defs: list[dict]) -> dict:
    if not text_context.strip():
        return {}
        
    prompt = f"""
    You are a financial analyst extracting key business metrics from an SEC filing.
    Below are chunks of text retrieved from the filing that likely contain the KPIs.
    
    Extract the following KPIs based on these definitions:
    {json.dumps(kpi_defs, indent=2)}
    
    For each KPI, find the exact numerical value for the CURRENT period being reported. 
    Pay attention to the 'unit'. If the text says '230 million' and the unit is 'millions', output 230.
    
    Return ONLY a valid JSON object where keys are the KPI names and values are the extracted numbers. If a KPI is not found, omit it or set it to null.
    
    Text Chunks:
    {text_context}
    """
    
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        )
    )
    
    try:
        return json.loads(response.text)
    except Exception as e:
        print(f"Failed to parse Gemini response: {e}")
        return {}

def main():
    conn = psycopg2.connect(DB_URL)
    
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Get targets
        for ticker, kpis in KPI_DEFS.items():
            print(f"\\nProcessing {ticker}...")
            
            # get company info
            cur.execute("SELECT id, cik FROM companies WHERE ticker = %s", (ticker,))
            company = cur.fetchone()
            if not company:
                print(f"Company {ticker} not found in DB.")
                continue
                
            company_id = company["id"]
            cik = company["cik"]
            
            # get last 8 periods that don't have businessKpis
            cur.execute("""
                SELECT "periodType", "fiscalYear", "fiscalQuarter", "periodEnd", "businessKpis"
                FROM fundamentals 
                WHERE "companyId" = %s AND "businessKpis" IS NULL
                ORDER BY "periodEnd" DESC
                LIMIT 8
            """, (company_id,))
            
            periods = cur.fetchall()
            
            # gather all keywords for this company
            all_keywords = []
            for k in kpis:
                all_keywords.extend(k["keywords"])
                
            for p in periods:
                p_end = p["periodEnd"].strftime("%Y-%m-%d")
                print(f"  -> Extracting for {ticker} - {p_end}")
                
                url = get_edgar_html_url(cik, p_end)
                if not url:
                    print(f"     No EDGAR URL found.")
                    continue
                    
                print(f"     URL: {url}")
                text_chunks = fetch_and_clean_text(url, all_keywords)
                
                if not text_chunks:
                    print(f"     No relevant chunks found for keywords.")
                    continue
                    
                # print(f"     Found {len(text_chunks)} chars of relevant context")
                
                result_json = extract_with_gemini(text_chunks, kpis)
                
                if result_json:
                    print(f"     ✅ AI Extracted: {result_json}")
                    # Update DB
                    cur.execute("""
                        UPDATE fundamentals 
                        SET "businessKpis" = %s
                        WHERE "companyId" = %s AND "periodType" = %s AND "fiscalYear" = %s AND "fiscalQuarter" IS NOT DISTINCT FROM %s
                    """, (json.dumps(result_json), company_id, p["periodType"], p["fiscalYear"], p["fiscalQuarter"]))
                    conn.commit()
                else:
                    print(f"     ❌ AI found nothing.")
                
                print("     Sleeping 15s to respect 5 RPM API limit...")
                time.sleep(15) # rate limit 5 RPM

if __name__ == "__main__":
    main()
