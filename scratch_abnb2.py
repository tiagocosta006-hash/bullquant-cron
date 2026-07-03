import requests

r = requests.get("https://data.sec.gov/api/xbrl/companyfacts/CIK0001559720.json", headers={"User-Agent": "BullQuant admin@bullocracy.com"})
facts = r.json().get("facts", {}).get("us-gaap", {})
tags = []
for tag in facts.keys():
    if "PerShare" in tag or "Share" in tag:
        tags.append(tag)
                    
print("ABNB Share tags:", tags)
