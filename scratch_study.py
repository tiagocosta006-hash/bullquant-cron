import requests

EDGAR_BASE = "https://data.sec.gov/api/xbrl/companyfacts"
HEADERS = {"User-Agent": "BullQuant admin@bullocracy.com"}

# CIKs
# META: 0001326801
# NFLX: 0001065280
# UNH: 0000731561
# PFE: 0000078003
ciks = {
    "META": "0001326801",
    "NFLX": "0001065280",
    "UNH": "0000731561",
    "PFE": "0000078003"
}

for ticker, cik in ciks.items():
    print(f"\n--- {ticker} ---")
    r = requests.get(f"{EDGAR_BASE}/CIK{cik}.json", headers=HEADERS)
    if r.status_code != 200: continue
    facts = r.json().get("facts", {}).get("us-gaap", {})
    
    tags = []
    for tag, data in facts.items():
        if "Expense" in tag or "Revenue" in tag or "Income" in tag or "Cost" in tag or "Profit" in tag:
            for unit, entries in data.get("units", {}).items():
                for e in entries:
                    if e.get("fy") == 2023 and e.get("fp") == "FY" and "start" in e: # duration
                        val = e.get("val")
                        if isinstance(val, (int, float)) and abs(val) > 10_000_000: # > 10M
                            tags.append((tag, val))
                            break
    
    tags.sort(key=lambda x: abs(x[1]), reverse=True)
    for tag, val in tags[:25]:
        print(f"{tag}: {val / 1e9:.2f}B")
