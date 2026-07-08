import requests
from bs4 import BeautifulSoup
import psycopg2

HEADERS = {"User-Agent": "TiagoCosta (tiago@example.com)"}
import os
from dotenv import load_dotenv

load_dotenv('.env.dev')
DIRECT_URL = os.getenv('DIRECT_URL')

def get_db_connection():
    return psycopg2.connect(DIRECT_URL)

conn = get_db_connection()
cur = conn.cursor()
cur.execute("SELECT id, ticker, cik FROM companies WHERE cik IS NOT NULL LIMIT 5")
companies = cur.fetchall()

def get_latest_10k_xml(cik):
    url = f"https://data.sec.gov/submissions/CIK{cik.zfill(10)}.json"
    r = requests.get(url, headers=HEADERS)
    if r.status_code != 200: return None
    recent = r.json().get("filings", {}).get("recent", {})
    if not recent: return None
    
    for i in range(len(recent.get("form", []))):
        if recent["form"][i] == "10-K":
            acc_full = recent["accessionNumber"][i]
            acc = acc_full.replace("-", "")
            doc = recent["primaryDocument"][i]
            if doc.endswith(".htm"):
                doc = doc.replace(".htm", "_htm.xml")
            return f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{doc}"
    return None

tags_to_check = [
    "us-gaap:SalesRevenueNet", 
    "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
    "us-gaap:Revenues",
    "us-gaap:SalesRevenueGoodsNet",
    "us-gaap:SalesRevenueServicesNet",
    "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax"
]

for c_id, ticker, cik in companies:
    print(f"\n--- {ticker} ({cik}) ---")
    xml_url = get_latest_10k_xml(cik)
    if not xml_url:
        print("No 10-K XML found.")
        continue
        
    print(f"URL: {xml_url}")
    r = requests.get(xml_url, headers=HEADERS)
    if r.status_code != 200:
        print("Failed to download XML")
        continue
        
    soup = BeautifulSoup(r.content, "xml")
    
    # Find all contexts that are used by revenue tags
    revenue_contexts = set()
    for tag_name in tags_to_check:
        pure_name = tag_name.split(":")[-1]
        for f in soup.find_all([tag_name, pure_name]):
            ctx_id = f.get("contextRef")
            if ctx_id:
                revenue_contexts.add(ctx_id)
                
    # Now for each revenue context, find explicitMembers
    segments = set()
    for ctx_id in revenue_contexts:
        ctx = soup.find(id=ctx_id)
        if ctx:
            for member in ctx.find_all("explicitMember"):
                txt = member.text
                if "Segment" in txt or "Member" in txt or txt.lower().startswith(f"{ticker.lower()}:"):
                    segments.add(txt)
                    
    print(f"Found {len(segments)} possible segment members:")
    for s in segments:
        print(" -", s)
