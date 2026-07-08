import requests

cik = "0000008670" # ADP CIK
url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
headers = {"User-Agent": "Tiago Costa tiago.costa@example.com"}
resp = requests.get(url, headers=headers)
if resp.status_code == 200:
    data = resp.json()
    us_gaap = data.get("facts", {}).get("us-gaap", {})
    keys = list(us_gaap.keys())
    capex_cands = [k for k in keys if "property" in k.lower() or "equipment" in k.lower() or "capex" in k.lower() or "addition" in k.lower() or "purchase" in k.lower() or "payment" in k.lower()]
    print("Candidates:", capex_cands)
else:
    print("Failed to fetch")
