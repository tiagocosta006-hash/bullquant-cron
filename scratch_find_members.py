import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "TiagoCosta (tiago@example.com)"}

COMPANIES = {
    "MSFT": "0000789019",
    "GOOGL": "0001652044",
    "META": "0001326801",
    "TSLA": "0001318605",
    "NVDA": "0001045810"
}

def get_latest_10q(cik):
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    r = requests.get(url, headers=HEADERS)
    if r.status_code != 200: return None
    recent = r.json().get("filings", {}).get("recent", {})
    for i in range(len(recent.get("form", []))):
        if recent["form"][i] in ["10-Q", "10-K"]:
            acc_full = recent["accessionNumber"][i]
            acc = acc_full.replace("-", "")
            doc = recent["primaryDocument"][i]
            if doc.endswith(".htm"):
                doc = doc.replace(".htm", "_htm.xml")
            return f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{doc}"
    return None

for ticker, cik in COMPANIES.items():
    print(f"\n--- {ticker} ---")
    xml_url = get_latest_10q(cik)
    if not xml_url:
        print("No XML found.")
        continue
        
    print(f"URL: {xml_url}")
    r = requests.get(xml_url, headers=HEADERS)
    if r.status_code != 200:
        print("Failed to download XML")
        continue
        
    soup = BeautifulSoup(r.content, "xml")
    members = set()
    for ctx in soup.find_all("context"):
        # only look at segments
        for member in ctx.find_all("explicitMember"):
            members.add(member.text)
            
    # print members that look like segments (filtering out standard stuff like common stock, etc)
    # usually they have the company prefix or "Member"
    for m in sorted(members):
        m_lower = m.lower()
        if "member" in m_lower and not any(x in m_lower for x in ["stock", "director", "officer", "share", "plan", "award", "equity"]):
            print(m)
