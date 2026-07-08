import requests

def search_custom(cik, keywords):
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    headers = {"User-Agent": "TiagoCosta (tiago@example.com)"}
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        return
    data = r.json()
    facts = data.get("facts", {})
    
    print(f"\n--- CIK {cik} ---")
    for taxonomy, tags in facts.items():
        if taxonomy in ["us-gaap", "dei"]:
            continue # skip standard
        print(f"Taxonomy: {taxonomy}")
        for tag in tags.keys():
            tag_lower = tag.lower()
            if any(k.lower() in tag_lower for k in keywords):
                print(tag)

search_custom("0000320193", ["product", "service", "iphone", "mac", "revenue", "ipad", "wearable"]) # AAPL
search_custom("0001018724", ["aws", "amazon", "web", "retail", "north", "revenue"]) # AMZN
