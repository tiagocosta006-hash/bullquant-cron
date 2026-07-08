import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "TiagoCosta (tiago@example.com)"}
url = "https://data.sec.gov/submissions/CIK0000789019.json"
r = requests.get(url, headers=HEADERS)
recent = r.json().get("filings", {}).get("recent", {})
xml_url = ""
for i in range(len(recent.get("form", []))):
    if recent["form"][i] in ["10-Q", "10-K"]:
        acc = recent["accessionNumber"][i].replace("-", "")
        doc = recent["primaryDocument"][i].replace(".htm", "_htm.xml")
        xml_url = f"https://www.sec.gov/Archives/edgar/data/789019/{acc}/{doc}"
        break

print(xml_url)
r = requests.get(xml_url, headers=HEADERS)
soup = BeautifulSoup(r.content, "xml")

# Find a context with msft:IntelligentCloudMember
target_ctx = None
for ctx in soup.find_all("context"):
    for member in ctx.find_all("explicitMember"):
        if "msft:IntelligentCloudMember" in member.text:
            target_ctx = ctx.get("id")
            break
    if target_ctx: break

print(f"Target Context: {target_ctx}")

if target_ctx:
    # Find any tag that uses this contextref
    for tag in soup.find_all():
        if tag.get("contextRef") == target_ctx:
            print(f"Tag: {tag.name}, Value: {tag.text}")
