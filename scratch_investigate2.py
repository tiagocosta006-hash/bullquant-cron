import requests

def inspect_tags(cik, keywords):
    r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", headers={"User-Agent": "BullQuant admin@bullocracy.com"})
    facts = r.json().get("facts", {}).get("us-gaap", {})
    found = []
    for tag in facts.keys():
        tag_lower = tag.lower()
        if any(k.lower() in tag_lower for k in keywords):
            found.append(tag)
    print(f"{cik} tags for {keywords}: {found}")

# V
inspect_tags('0001403161', ['NetIncome', 'eps', 'Diluted'])
# CRM
inspect_tags('0001108524', ['NetIncome', 'eps', 'Diluted'])
