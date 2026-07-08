import requests

r = requests.get("https://data.sec.gov/api/xbrl/companyfacts/CIK0001559720.json", headers={"User-Agent": "BullQuant admin@bullocracy.com"})
facts = r.json().get("facts", {}).get("us-gaap", {})
tags = []
for tag, data in facts.items():
    if "EarningsPerShare" in tag or "NetIncomeLossPerOutstanding" in tag or "eps" in tag.lower():
        tags.append(tag)
                    
print("ABNB EPS tags:", tags)
