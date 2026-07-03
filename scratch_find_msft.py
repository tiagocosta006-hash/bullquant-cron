import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "TiagoCosta (tiago@example.com)"}

COMPANIES = {
    "MSFT": "0000789019",
}

for ticker, cik in COMPANIES.items():
    print(f"\n--- {ticker} ---")
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    r = requests.get(url, headers=HEADERS)
    recent = r.json().get("filings", {}).get("recent", {})
    xml_url = ""
    for i in range(len(recent.get("form", []))):
        if recent["form"][i] in ["10-Q", "10-K"]:
            acc = recent["accessionNumber"][i].replace("-", "")
            doc = recent["primaryDocument"][i].replace(".htm", "_htm.xml")
            xml_url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{doc}"
            break
            
    print(xml_url)
    r = requests.get(xml_url, headers=HEADERS)
    soup = BeautifulSoup(r.content, "xml")
    
    for ctx in soup.find_all("context"):
        for member in ctx.find_all("explicitMember"):
            txt = member.text.lower()
            if "msft:" in txt and "member" in txt:
                print(member.text)
