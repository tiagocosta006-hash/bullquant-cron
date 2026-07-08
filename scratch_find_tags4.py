import requests

cik = "0000040545" # GE CIK
url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
headers = {"User-Agent": "Tiago Costa tiago.costa@example.com"}
resp = requests.get(url, headers=headers)
if resp.status_code == 200:
    data = resp.json()
    us_gaap = data.get("facts", {}).get("us-gaap", {})
    keys = list(us_gaap.keys())
    
    income_cands = [k for k in keys if "income" in k.lower() or "profit" in k.lower() or "loss" in k.lower()]
    for k in income_cands:
        if k in us_gaap:
            vals = us_gaap[k].get("units", {}).get("USD", [])
            # check if they have values for 2023 or 2024
            for v in vals:
                if v.get("fy") in (2023, 2024, 2025):
                    print(k)
                    break
else:
    print("Failed to fetch")
