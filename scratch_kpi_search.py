import requests

def search_kpis(cik, keywords):
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    headers = {"User-Agent": "TiagoCosta (tiago@example.com)"}
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        return
    data = r.json()
    facts = data.get("facts", {})
    
    print(f"\n--- CIK {cik} ---")
    for taxonomy, tags in facts.items():
        for tag in tags.keys():
            tag_lower = tag.lower()
            if any(k.lower() in tag_lower for k in keywords):
                print(f"{taxonomy}: {tag}")

# Meta (DAUs, MAUs)
search_kpis("0001326801", ["user", "active", "dau", "mau"]) 

# Netflix (Subscribers, Paid)
search_kpis("0001065280", ["subscriber", "member", "paid", "additions"])
