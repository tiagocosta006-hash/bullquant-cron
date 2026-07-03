import psycopg2
from scripts.ingest_fundamentals import DIRECT_URL, insert_fundamental, delete_period

row = {
    "id": "test_id_123",
    "companyId": "82c6523e8c264b8a8fabcf9739468b95", # WFC
    "periodType": "ANNUAL",
    "fiscalYear": 2026,
    "fiscalQuarter": None,
    "periodEnd": "2026-12-31",
    "filedAt": "2027-02-01",
    "revenue": 100,
    "costOfRevenue": None,
    "grossProfit": 100,
    "operatingExpenses": 50,
    "operatingIncome": 50,
    "interestExpense": None,
    "taxExpense": 10,
    "netIncome": 40,
    "epsDiluted": 1.0,
    "sharesOutstanding": 40,
    "operatingCashFlow": 10,
    "capex": 0.0,
    "freeCashFlow": 10,
    "totalAssets": 1000,
    "totalCurrentLiab": 500,
    "longTermDebt": 100,
    "totalDebt": 100,
    "cash": 200,
    "totalEquity": 500,
    "grossMargin": 1.0,
    "operatingMargin": 0.5,
    "netMargin": 0.4,
    "roic": 0.1,
    "returnOnEquity": 0.08,
    "dividendPerShare": 0.0,
    "researchAndDevelopment": 0.0,
    "sellingGeneralAndAdmin": 0.0,
    "ebitda": 50,
    "createdAt": "2026-07-02T19:00:00",
    "updatedAt": "2026-07-02T19:00:00"
}

conn = psycopg2.connect(DIRECT_URL)
cur = conn.cursor()
try:
    delete_period(cur, row["companyId"], row["periodType"], row["fiscalYear"], row["fiscalQuarter"])
    insert_fundamental(cur, row)
    conn.commit()
    print("Insert OK")
except Exception as e:
    print("Error:", e)
