import requests
import psycopg2
from scripts.ingest_fundamentals import DIRECT_URL

# Companies with missing data
targets = {
    "GE": ["profit", "income", "expense", "revenue", "loss"],
    "SNA": ["profit", "income", "expense", "margin"],
    "UBER": ["profit", "income", "expense", "revenue", "cost"],
    "ADP": ["income", "profit", "loss"],
    "SWK": ["income", "profit", "loss"],
    "LMT": ["expense", "operating", "cost"],
    "MAA": ["profit", "income", "debt"],
    "ARE": ["income", "profit"],
    "INTU": ["profit", "revenue", "cost"],
    "IBM": ["income", "profit", "loss"]
}

conn = psycopg2.connect(DIRECT_URL)
cur = conn.cursor()

def get_tags(cik, keywords):
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    headers = {"User-Agent": "Tiago Costa tiago.costa@example.com"}
    resp = requests.get(url, headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        us_gaap = data.get("facts", {}).get("us-gaap", {})
        keys = list(us_gaap.keys())
        
        found = set()
        for k in keys:
            k_lower = k.lower()
            if any(word in k_lower for word in keywords):
                # only check if it has recent data (e.g. fy=2023,2024,2025)
                for unit, vals in us_gaap[k].get("units", {}).items():
                    for v in vals[-10:]: # check last few entries
                        if v.get("fy") in (2023, 2024, 2025) and v.get("fp") in ("FY", "Q1", "Q2", "Q3", "Q4"):
                            found.add(k)
                            break
        return list(found)
    return []

for ticker, keywords in targets.items():
    cur.execute("SELECT cik FROM companies WHERE ticker = %s", (ticker,))
    res = cur.fetchone()
    if res and res[0]:
        cik = str(res[0]).zfill(10)
        tags = get_tags(cik, keywords)
        print(f"=== {ticker} ===")
        # filter to highly likely tags
        relevant = [t for t in tags if "revenue" in t.lower() or "cost" in t.lower() or "expense" in t.lower() or "income" in t.lower() or "profit" in t.lower() or "loss" in t.lower() or "debt" in t.lower()]
        print(", ".join(relevant))
