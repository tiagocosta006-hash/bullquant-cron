import requests

r = requests.get("https://data.sec.gov/api/xbrl/companyfacts/CIK0000731561.json", headers={"User-Agent": "BullQuant admin@bullocracy.com"})
facts = r.json().get("facts", {}).get("us-gaap", {})
tags = []
for tag, data in facts.items():
    if "Expense" in tag or "Revenue" in tag or "Income" in tag or "Cost" in tag or "Claims" in tag:
        # just get the first value to see if the tag exists
        for unit, entries in data.get("units", {}).items():
            for e in entries:
                if "val" in e and abs(e["val"]) > 10_000_000_000: # > 10B
                    tags.append((tag, abs(e["val"])))
                    break
                    
tags.sort(key=lambda x: x[1], reverse=True)
for tag, val in tags[:25]:
    print(f"{tag}: {val / 1e9:.2f}B")
