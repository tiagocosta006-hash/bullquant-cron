import requests

CIK = "0001652044"
url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK}.json"
headers = {"User-Agent": "TiagoCosta (tiago@example.com)"}
resp = requests.get(url, headers=headers)
data = resp.json()

try:
    eps_data = data["facts"]["us-gaap"]["EarningsPerShareDiluted"]["units"]["USD/shares"]
    for val in eps_data:
        if val.get("form") in ["10-Q", "10-K"] and val.get("fy") == 2026 and val.get("fp") == "Q1":
            print(f"FY26 Q1 reported: {val}")
except KeyError:
    print("Tag not found")
