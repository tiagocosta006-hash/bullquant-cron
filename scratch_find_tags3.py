import requests

cik = "0000040545" # GE CIK
url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
headers = {"User-Agent": "Tiago Costa tiago.costa@example.com"}
resp = requests.get(url, headers=headers)
if resp.status_code == 200:
    data = resp.json()
    us_gaap = data.get("facts", {}).get("us-gaap", {})
    keys = list(us_gaap.keys())
    
    opinc_cands = [k for k in keys if "operating" in k.lower() and "income" in k.lower()]
    grossprofit_cands = [k for k in keys if "gross" in k.lower() and "profit" in k.lower()]
    opex_cands = [k for k in keys if "operating" in k.lower() and "expense" in k.lower()]
    
    print("Operating Income candidates:", opinc_cands)
    print("Gross Profit candidates:", grossprofit_cands)
    print("Operating Expenses candidates:", opex_cands)
else:
    print("Failed to fetch")
