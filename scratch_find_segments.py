import requests
import json

def check_segments(cik):
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    headers = {"User-Agent": "TiagoCosta (tiago@example.com)"}
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        return
    data = r.json()
    rev = data.get("facts", {}).get("us-gaap", {}).get("SalesRevenueNet", {}).get("units", {}).get("USD", [])
    if not rev:
        rev = data.get("facts", {}).get("us-gaap", {}).get("Revenues", {}).get("units", {}).get("USD", [])
        
    print(f"\n--- CIK {cik} ---")
    segments = set()
    for val in rev:
        # Does this value have dimensional segments?
        # Typically looks like: {"val": 123, "segment": {"dimension": "...", "value": "..."}}
        if "segment" in val:
            segments.add(str(val["segment"]))
            
    for s in segments:
        print(s)

check_segments("0000320193")
