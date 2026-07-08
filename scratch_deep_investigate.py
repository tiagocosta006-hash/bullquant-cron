import requests
import json

ciks = {
    'ADBE': '0000796343', 'CDNS': '0000813672', 'CTSH': '0001058290', 
    'FLEX': '0000866374', 'GDDY': '0001609711', 'LUV': '0000092380', 
    'SNA': '0000091440', 'CHRW': '0000868857', 'TJX': '0000109198',
    'AMZN': '0001018724', 'SBUX': '0000829224'
}

def analyze_company(ticker, cik):
    try:
        r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", headers={"User-Agent": "BullQuant admin@bullocracy.com"})
        facts = r.json().get("facts", {}).get("us-gaap", {})
        tags = list(facts.keys())
        
        rd_tags = [t for t in tags if 'research' in t.lower() or 'development' in t.lower()]
        gp_tags = [t for t in tags if 'gross' in t.lower() or 'margin' in t.lower()]
        opex_tags = [t for t in tags if 'operatingexpense' in t.lower()]
        
        print(f"\n--- {ticker} ---")
        print(f"R&D related tags: {rd_tags}")
        print(f"Gross Profit related tags: {gp_tags}")
        print(f"OpEx related tags: {opex_tags}")
    except Exception as e:
        print(f"Error {ticker}: {e}")

for ticker, cik in ciks.items():
    analyze_company(ticker, cik)

