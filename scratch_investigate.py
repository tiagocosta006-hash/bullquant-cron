import requests

def get_cik(ticker):
    # Quick lookup mapping for the ones we need to check
    ciks = {
        'V': '0001403161', 'CRM': '0001108524', 'SBUX': '0000829224', 'WMT': '0000104169', 'KO': '0000021344',
        'PLTR': '0001321655', 'NOW': '0001373715', 'DDOG': '0001561550', 'CDNS': '0000813672', 'GM': '0001467858',
        'MCD': '0000063908'
    }
    return ciks.get(ticker)

def inspect_tags(ticker, keywords):
    cik = get_cik(ticker)
    if not cik: return
    r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", headers={"User-Agent": "BullQuant admin@bullocracy.com"})
    facts = r.json().get("facts", {}).get("us-gaap", {})
    found = []
    for tag in facts.keys():
        tag_lower = tag.lower()
        if any(k.lower() in tag_lower for k in keywords):
            found.append(tag)
    print(f"{ticker} tags for {keywords}: {found}")

inspect_tags('V', ['PerShare', 'EarningsPerShare'])
inspect_tags('CRM', ['PerShare', 'EarningsPerShare'])
inspect_tags('SBUX', ['PerShare', 'EarningsPerShare'])
inspect_tags('KO', ['PerShare', 'EarningsPerShare'])
inspect_tags('WMT', ['PerShare', 'EarningsPerShare'])

inspect_tags('PLTR', ['Debt', 'Borrowing', 'Liabilities'])
inspect_tags('NOW', ['Debt', 'Borrowing'])
inspect_tags('DDOG', ['Debt', 'Borrowing'])

inspect_tags('CDNS', ['OperatingExpense'])
inspect_tags('GM', ['GrossProfit', 'CostOfRevenue'])
inspect_tags('MCD', ['GrossProfit', 'CostOfRevenue'])

