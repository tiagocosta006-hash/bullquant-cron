import requests
import json
import os

EDGAR_BASE = "https://data.sec.gov/api/xbrl/companyfacts"
HEADERS = {"User-Agent": "BullQuant admin@bullocracy.com"}

ciks = {
    "JPM": "0000019617",
    "SPG": "0001045609",
    "DUK": "0001326160"
}

for ticker, cik in ciks.items():
    print(f"\n--- {ticker} ---")
    r = requests.get(f"{EDGAR_BASE}/CIK{cik}.json", headers=HEADERS)
    if r.status_code != 200:
        print("Failed to fetch")
        continue
    
    facts = r.json().get("facts", {}).get("us-gaap", {})
    
    # We want to find the tags that represent large numbers (e.g., > 1 Billion)
    large_tags = []
    for tag, data in facts.items():
        units = data.get("units", {})
        for unit, entries in units.items():
            for e in entries:
                if e.get("fy") == 2023 and e.get("fp") == "FY":
                    val = e.get("val")
                    if isinstance(val, (int, float)) and abs(val) > 1_000_000_000:
                        large_tags.append((tag, val))
                        break # Just one per tag is enough to know it's used
            
    # Sort by absolute value descending
    large_tags.sort(key=lambda x: abs(x[1]), reverse=True)
    
    # Print the top 20 largest tags to identify OpEx, COGS, etc.
    for tag, val in large_tags[:20]:
        print(f"{tag}: {val / 1e9:.2f}B")
