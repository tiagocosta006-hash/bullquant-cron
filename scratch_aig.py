import requests

r = requests.get("https://data.sec.gov/api/xbrl/companyfacts/CIK0000005272.json", headers={"User-Agent": "BullQuant admin@bullocracy.com"})
facts = r.json().get("facts", {}).get("us-gaap", {})
tags = []
for tag, data in facts.items():
    if "Expense" in tag or "Cost" in tag:
        for unit, entries in data.get("units", {}).items():
            for e in entries:
                if e.get("fy") == 2023 and e.get("fp") == "FY" and "start" in e:
                    val = e.get("val")
                    if isinstance(val, (int, float)) and abs(val) > 1_000_000_000:
                        tags.append((tag, val))
                        break
                    
tags.sort(key=lambda x: abs(x[1]), reverse=True)
for tag, val in tags[:15]:
    print(f"{tag}: {val / 1e9:.2f}B")
