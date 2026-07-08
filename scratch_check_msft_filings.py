import requests
HEADERS = {"User-Agent": "TiagoCosta (tiago@example.com)"}
url = "https://data.sec.gov/submissions/CIK0000789019.json"
r = requests.get(url, headers=HEADERS)
data = r.json()
recent = data.get("filings", {}).get("recent", {})
filings = []
for i in range(len(recent.get("accessionNumber", []))):
    form = recent["form"][i]
    if form in ["10-Q", "10-K"]:
        filings.append({
            "acc": recent["accessionNumber"][i],
            "form": form,
            "reportDate": recent["reportDate"][i],
            "primaryDoc": recent["primaryDocument"][i]
        })
print(len(filings))
if filings:
    print(filings[0])
