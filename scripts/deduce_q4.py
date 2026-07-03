import os
from dotenv import load_dotenv
import psycopg2
import json

load_dotenv('.env.dev')
DIRECT_URL = os.getenv('DIRECT_URL')

def get_db_connection():
    return psycopg2.connect(DIRECT_URL)

CUMULATIVE_FIELDS = [
    "revenue", "costOfRevenue", "grossProfit", "operatingExpenses", 
    "researchAndDevelopment", "sellingGeneralAndAdmin", "ebitda", 
    "operatingIncome", "interestExpense", "taxExpense", "netIncome",
    "operatingCashFlow", "capex", "freeCashFlow"
]

SNAPSHOT_FIELDS = [
    "totalAssets", "totalCurrentLiab", "longTermDebt", "totalDebt", 
    "cash", "totalEquity", "sharesOutstanding", "dividendPerShare"
]

def main(dry_run=True, target_ticker="AAPL"):
    conn = get_db_connection()
    cur = conn.cursor()
    
    if target_ticker:
        cur.execute("SELECT id, ticker FROM companies WHERE ticker = %s", (target_ticker,))
    else:
        cur.execute("SELECT id, ticker FROM companies")
        
    companies = cur.fetchall()
    total_q4_inserted = 0
    
    for c_id, ticker in companies:
        cur.execute('''
            SELECT "fiscalYear", "fiscalQuarter", "periodType", "periodEnd",
                   "revenue", "costOfRevenue", "grossProfit", "operatingExpenses",
                   "researchAndDevelopment", "sellingGeneralAndAdmin", "ebitda",
                   "operatingIncome", "interestExpense", "taxExpense", "netIncome",
                   "operatingCashFlow", "capex", "freeCashFlow",
                   "totalAssets", "totalCurrentLiab", "longTermDebt", "totalDebt",
                   "cash", "totalEquity", "sharesOutstanding", "dividendPerShare",
                   "revenueSegments"
            FROM fundamentals
            WHERE "companyId" = %s
        ''', (c_id,))
        
        records = cur.fetchall()
        
        years = {}
        for r in records:
            fy = r[0]
            if fy not in years:
                years[fy] = {"Q1": None, "Q2": None, "Q3": None, "Q4": None, "ANNUAL": None}
            ptype = r[2]
            fq = r[1]
            if ptype == "ANNUAL": years[fy]["ANNUAL"] = r
            elif ptype == "QUARTERLY":
                if fq == 1: years[fy]["Q1"] = r
                if fq == 2: years[fy]["Q2"] = r
                if fq == 3: years[fy]["Q3"] = r
                if fq == 4: years[fy]["Q4"] = r
                
        for fy, data in sorted(years.items()):
            if data["ANNUAL"] and data["Q1"] and data["Q2"] and data["Q3"]:
                if data["Q4"] is not None:
                    continue
                    
                ann = data["ANNUAL"]
                q1 = data["Q1"]
                q2 = data["Q2"]
                q3 = data["Q3"]
                
                q4_period_end = ann[3]
                new_q4 = {"periodEnd": q4_period_end}
                is_valid = True
                
                for idx, field in enumerate(CUMULATIVE_FIELDS):
                    v_a = ann[4 + idx]
                    v_1 = q1[4 + idx]
                    v_2 = q2[4 + idx]
                    v_3 = q3[4 + idx]
                    
                    if v_a is not None and v_1 is not None and v_2 is not None and v_3 is not None:
                        calc = float(v_a) - float(v_1) - float(v_2) - float(v_3)
                        if field == "revenue" and calc < 0:
                            is_valid = False
                        new_q4[field] = calc
                    else:
                        new_q4[field] = None
                        
                if not is_valid:
                    if dry_run: print(f"Skipping {ticker} FY {fy} due to negative revenue")
                    continue
                
                for idx, field in enumerate(SNAPSHOT_FIELDS):
                    new_q4[field] = ann[4 + len(CUMULATIVE_FIELDS) + idx]
                    
                new_segments = {}
                seg_a = ann[26]
                seg_1 = q1[26]
                seg_2 = q2[26]
                seg_3 = q3[26]
                
                if seg_a and seg_1 and seg_2 and seg_3:
                    for k, val_a in seg_a.items():
                        v_1 = seg_1.get(k)
                        v_2 = seg_2.get(k)
                        v_3 = seg_3.get(k)
                        if v_1 is not None and v_2 is not None and v_3 is not None:
                            calc = float(val_a) - float(v_1) - float(v_2) - float(v_3)
                            new_segments[k] = calc
                new_q4["revenueSegments"] = json.dumps(new_segments) if new_segments else None
                
                rev = new_q4["revenue"]
                gp = new_q4["grossProfit"]
                oi = new_q4["operatingIncome"]
                ni = new_q4["netIncome"]
                
                new_q4["grossMargin"] = (gp / rev) if (rev and gp and rev > 0) else None
                new_q4["operatingMargin"] = (oi / rev) if (rev and oi and rev > 0) else None
                new_q4["netMargin"] = (ni / rev) if (rev and ni and rev > 0) else None
                
                if dry_run:
                    print(f"[{ticker}] Deduced Q4 for FY {fy}: Rev={rev}, Segments={new_segments}")
                else:
                    import uuid
                    new_id = uuid.uuid4().hex
                    try:
                        cur.execute('''
                            INSERT INTO fundamentals (
                                "id", "companyId", "periodType", "fiscalYear", "fiscalQuarter", "periodEnd",
                                "revenue", "costOfRevenue", "grossProfit", "operatingExpenses",
                                "researchAndDevelopment", "sellingGeneralAndAdmin", "ebitda",
                                "operatingIncome", "interestExpense", "taxExpense", "netIncome",
                                "operatingCashFlow", "capex", "freeCashFlow",
                                "totalAssets", "totalCurrentLiab", "longTermDebt", "totalDebt",
                                "cash", "totalEquity", "sharesOutstanding", "dividendPerShare",
                                "revenueSegments", "grossMargin", "operatingMargin", "netMargin",
                                "updatedAt"
                            ) VALUES (
                                %s, %s, 'QUARTERLY', %s, 4, %s,
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, NOW()
                            ) ON CONFLICT DO NOTHING
                        ''', (
                            new_id, c_id, fy, new_q4["periodEnd"],
                            new_q4["revenue"], new_q4["costOfRevenue"], new_q4["grossProfit"], new_q4["operatingExpenses"],
                            new_q4["researchAndDevelopment"], new_q4["sellingGeneralAndAdmin"], new_q4["ebitda"],
                            new_q4["operatingIncome"], new_q4["interestExpense"], new_q4["taxExpense"], new_q4["netIncome"],
                            new_q4["operatingCashFlow"], new_q4["capex"], new_q4["freeCashFlow"],
                            new_q4["totalAssets"], new_q4["totalCurrentLiab"], new_q4["longTermDebt"], new_q4["totalDebt"],
                            new_q4["cash"], new_q4["totalEquity"], new_q4["sharesOutstanding"], new_q4["dividendPerShare"],
                            new_q4["revenueSegments"], new_q4["grossMargin"], new_q4["operatingMargin"], new_q4["netMargin"]
                        ))
                        conn.commit()
                        total_q4_inserted += 1
                    except Exception as e:
                        print(f"Error inserting Q4 for {ticker} FY {fy}: {e}")
                        conn.rollback()

    if not dry_run:
        print(f"Done! Inserted {total_q4_inserted} Q4 periods.")
        
if __name__ == "__main__":
    import sys
    dry_run = True
    target = "AAPL"
    if len(sys.argv) > 1 and sys.argv[1] == "--execute":
        dry_run = False
        target = None
    main(dry_run, target)
