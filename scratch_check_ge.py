import requests

cik = "0000040545" # GE CIK
url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
headers = {"User-Agent": "Tiago Costa tiago.costa@example.com"}
resp = requests.get(url, headers=headers)
if resp.status_code == 200:
    data = resp.json()
    us_gaap = data.get("facts", {}).get("us-gaap", {})
    tag = "OperatingIncomeLoss"
    if tag in us_gaap:
        for unit, vals in us_gaap[tag].get("units", {}).items():
            print(f"--- {tag} ({unit}) ---")
            for v in vals[-5:]:
                print(v)
    else:
        print(f"Tag {tag} not found")
