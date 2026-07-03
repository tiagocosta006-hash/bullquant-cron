import requests
from bs4 import BeautifulSoup
from datetime import datetime

HEADERS = {"User-Agent": "TiagoCosta (tiago@example.com)"}

# AAPL latest 10-K
url = "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927_htm.xml"
r = requests.get(url, headers=HEADERS)
soup = BeautifulSoup(r.content, "xml")

# Target end date
target_end = "2025-09-27"

q4_contexts = []
for ctx in soup.find_all("context"):
    period = ctx.find("period")
    if period and period.find("startDate") and period.find("endDate"):
        start = period.find("startDate").text
        end = period.find("endDate").text
        if end == target_end:
            sd = datetime.strptime(start, "%Y-%m-%d")
            ed = datetime.strptime(end, "%Y-%m-%d")
            days = (ed - sd).days
            if 85 <= days <= 100:
                q4_contexts.append(ctx.get("id"))

print(f"Found {len(q4_contexts)} contexts for Q4 (~90 days ending {target_end})")
print("Sample contexts:", q4_contexts[:10])

# Check if SalesRevenueNet has facts for these contexts
for tag in soup.find_all(["us-gaap:SalesRevenueNet", "SalesRevenueNet", "aapl:IPhoneMember"]):
    if tag.get("contextRef") in q4_contexts:
        print(f"Tag: {tag.name}, Context: {tag.get('contextRef')}, Value: {tag.text}")

