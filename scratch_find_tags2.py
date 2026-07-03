import requests

cik = "0000008670" # ADP CIK
url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
headers = {"User-Agent": "Tiago Costa tiago.costa@example.com"}
resp = requests.get(url, headers=headers)
if resp.status_code == 200:
    data = resp.json()
    us_gaap = data.get("facts", {}).get("us-gaap", {})
    keys = list(us_gaap.keys())
    
    income_cands = [k for k in keys if "income" in k.lower() or "profit" in k.lower() or "loss" in k.lower()]
    print("Income candidates:")
    for k in income_cands:
        print(k)
else:
    print("Failed to fetch")
