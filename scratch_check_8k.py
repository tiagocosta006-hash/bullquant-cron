import requests
from bs4 import BeautifulSoup
import json

HEADERS = {"User-Agent": "TiagoCosta (tiago@example.com)"}

# AAPL latest 8-K
url = "https://data.sec.gov/submissions/CIK0000320193.json"
r = requests.get(url, headers=HEADERS)
data = r.json()
recent = data.get("filings", {}).get("recent", {})

for i in range(len(recent.get("form", []))):
    form = recent["form"][i]
    if form == "8-K":
        acc = recent["accessionNumber"][i].replace("-", "")
        doc = recent["primaryDocument"][i]
        report_date = recent["reportDate"][i]
        
        # We want the 8-K around late Oct / early Nov for Q4
        if "-10-" in report_date or "-11-" in report_date:
            print(f"Found 8-K: {report_date}")
            # The XBRL is usually in the htm file for inline XBRL
            doc_xml = doc.replace(".htm", "_htm.xml")
            xml_url = f"https://www.sec.gov/Archives/edgar/data/320193/{acc}/{doc_xml}"
            print(xml_url)
            
            r2 = requests.get(xml_url, headers=HEADERS)
            if r2.status_code == 200:
                soup = BeautifulSoup(r2.content, "xml")
                # Look for iPhone member
                iphone_tags = soup.find_all(lambda t: "IPhoneMember" in t.text if t.name == "explicitMember" else False)
                if iphone_tags:
                    print(f"  -> SUCCESS! Found IPhoneMember in 8-K XBRL.")
                else:
                    print(f"  -> Found XBRL, but no iPhone segment tag.")
            else:
                print("  -> No XBRL found for this 8-K.")
            break
