import requests

def search_tags(cik, keywords):
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    headers = {"User-Agent": "TiagoCosta (tiago@example.com)"}
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        print(f"Error fetching {cik}")
        return
    data = r.json()
    facts = data.get("facts", {}).get("us-gaap", {})
    
    print(f"\n--- CIK {cik} ---")
    for tag in facts.keys():
        tag_lower = tag.lower()
        if any(k.lower() in tag_lower for k in keywords):
            print(tag)

search_tags("0000320193", ["product", "service", "iphone", "mac", "revenue"]) # AAPL
search_tags("0001018724", ["aws", "amazon", "web", "retail", "north", "revenue"]) # AMZN
