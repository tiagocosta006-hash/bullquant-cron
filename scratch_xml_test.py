import requests
from bs4 import BeautifulSoup
import re

headers = {"User-Agent": "TiagoCosta (tiago@example.com)"}

# AAPL latest 10-Q (Q2 2024 ended March 30, 2024)
# CIK: 0000320193, Acc: 0000320193-24-000069
cik = "320193"
acc_full = "0000320193-24-000069"
acc = acc_full.replace("-", "")
url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/aapl-20240330_htm.xml"

r = requests.get(url, headers=headers)
if r.status_code != 200:
    print(f"Failed to fetch {url}")
    exit(1)

soup = BeautifulSoup(r.content, "xml")

# 1. Find contexts with segments
target_members = {
    "aapl:IPhoneMember": "iPhone",
    "aapl:MacMember": "Mac",
    "aapl:IPadMember": "iPad",
    "aapl:WearablesHomeAndAccessoriesMember": "Wearables",
    "aapl:ServicesMember": "Services"
}

context_mapping = {} # context_id -> segment name

for ctx in soup.find_all("context"):
    ctx_id = ctx.get("id")
    # Find explicit members in the segment axis
    for member in ctx.find_all("explicitMember"):
        if member.text in target_members:
            # Check if this context is for the 3-month period (not 6-month YTD)
            period = ctx.find("period")
            if period and period.find("startDate") and period.find("endDate"):
                start = period.find("startDate").text
                end = period.find("endDate").text
                # roughly 90 days?
                # Simple check for now
                context_mapping[ctx_id] = {
                    "segment": target_members[member.text],
                    "start": start,
                    "end": end
                }

print(f"Found {len(context_mapping)} segmented contexts.")
for k, v in list(context_mapping.items())[:5]:
    print(f"{k} -> {v}")

# 2. Extract Revenues for these contexts
# AAPL uses us-gaap:SalesRevenueNet or us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax
results = {}
for tag in ["us-gaap:SalesRevenueNet", "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax"]:
    facts = soup.find_all(tag)
    for f in facts:
        ctx_id = f.get("contextRef")
        if ctx_id in context_mapping:
            info = context_mapping[ctx_id]
            # only grab the recent quarter (e.g. end date 2024-03-30)
            if info["end"] == "2024-03-30":
                results[info["segment"]] = int(f.text)

print("\nRevenues:")
for k, v in results.items():
    print(f"{k}: {v}")
