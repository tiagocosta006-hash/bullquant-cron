import sys
import os
import psycopg2
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv('.env')

def get_db_connection():
    db_url = os.environ.get("DIRECT_URL")
    if not db_url:
        print("Erro: DIRECT_URL não encontrado no .env")
        sys.exit(1)
    return psycopg2.connect(db_url)

def fetch_db_fundamentals(cur, ticker: str):
    cur.execute('''
        SELECT 
            f."periodEnd", 
            f."revenue", 
            f."netIncome", 
            f."epsDiluted", 
            f."sharesOutstanding", 
            f."operatingCashFlow", 
            f."capex",
            f."fiscalYear",
            f."fiscalQuarter"
        FROM fundamentals f
        JOIN companies c ON c.id = f."companyId"
        WHERE c.ticker = %s AND f."periodType" = 'QUARTERLY'
        ORDER BY f."periodEnd" DESC
    ''', (ticker,))
    
    cols = [desc[0] for desc in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]

def compare_values(name, db_val, yf_val, tolerance=0.05):
    if pd.isna(yf_val) or yf_val is None:
        return True, "N/A in YF"
        
    # YF Capex é frequentemente negativo. Vamos padronizar para positivo absoluto para comparação
    if name == 'Capex':
        yf_val = abs(yf_val)
        if db_val is not None:
            db_val = abs(float(db_val))
            
    if db_val is None:
        return False, f"MISSING in DB (YF: {yf_val:,.2f})"
        
    db_val = float(db_val)
    yf_val = float(yf_val)
    
    # Se ambos são quase zero
    if abs(db_val) < 1e-6 and abs(yf_val) < 1e-6:
        return True, "Match"
        
    if abs(yf_val) < 1e-6:
        diff = abs(db_val)
    else:
        diff = abs(db_val - yf_val) / abs(yf_val)
        
    if diff > tolerance:
        return False, f"DB: {db_val:,.2f} | YF: {yf_val:,.2f} | Diff: {diff*100:.1f}%"
        
    return True, "Match"

def audit_ticker(ticker: str):
    print(f"\n{'='*50}\n AUDITING: {ticker}\n{'='*50}")
    
    conn = get_db_connection()
    cur = conn.cursor()
    db_data = fetch_db_fundamentals(cur, ticker)
    conn.close()
    
    if not db_data:
        print(f"Sem dados na base de dados para {ticker}.")
        return

    print("Extraindo dados do Yahoo Finance...")
    t = yf.Ticker(ticker)
    
    try:
        inc = t.quarterly_income_stmt
        cf = t.quarterly_cash_flow
    except Exception as e:
        print(f"Erro ao extrair YF para {ticker}: {e}")
        return

    if inc.empty:
        print(f"YF não devolveu Income Statement para {ticker}")
        return

    dates = inc.columns
    
    total_audited = 0
    total_errors = 0
    
    for dt in dates:
        yf_date = pd.to_datetime(dt).date()
        
        # Encontrar correspondente na DB (margem de 15 dias)
        db_row = None
        for row in db_data:
            db_date = row['periodEnd']
            if isinstance(db_date, datetime):
                db_date = db_date.date()
            if abs((db_date - yf_date).days) <= 15:
                db_row = row
                break
                
        if not db_row:
            print(f"\n[!] YF Quarter {yf_date}: MISSING IN DATABASE!")
            total_errors += 1
            continue
            
        print(f"\n--- Quarter {db_row['fiscalYear']} Q{db_row['fiscalQuarter']} (End: {db_row['periodEnd']}) ---")
        
        # Extrair valores YF
        try:
            yf_rev = inc.loc['Total Revenue', dt] if 'Total Revenue' in inc.index else None
            yf_ni = inc.loc['Net Income', dt] if 'Net Income' in inc.index else None
            yf_eps = inc.loc['Diluted EPS', dt] if 'Diluted EPS' in inc.index else None
            yf_shares = inc.loc['Diluted Average Shares', dt] if 'Diluted Average Shares' in inc.index else None
            yf_ocf = cf.loc['Operating Cash Flow', dt] if not cf.empty and 'Operating Cash Flow' in cf.index else None
            yf_capex = cf.loc['Capital Expenditure', dt] if not cf.empty and 'Capital Expenditure' in cf.index else None
        except KeyError:
            continue
            
        metrics_to_check = [
            ('Revenue', db_row['revenue'], yf_rev),
            ('Net Income', db_row['netIncome'], yf_ni),
            ('EPS Diluted', db_row['epsDiluted'], yf_eps),
            ('Shares Out', db_row['sharesOutstanding'], yf_shares),
            ('Op. Cash Flow', db_row['operatingCashFlow'], yf_ocf),
            ('Capex', db_row['capex'], yf_capex),
        ]
        
        quarter_errors = 0
        for name, db_v, yf_v in metrics_to_check:
            ok, msg = compare_values(name, db_v, yf_v)
            if not ok:
                print(f"  [ERROR] {name:<14}: {msg}")
                quarter_errors += 1
                
        if quarter_errors == 0:
            print("  [OK] All core metrics match!")
        else:
            total_errors += quarter_errors
            
        total_audited += len(metrics_to_check)
        
    print(f"\n[SUMMARY for {ticker}]")
    print(f"Metrics Audited: {total_audited}")
    print(f"Errors Found:    {total_errors}")

def get_all_tickers():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT ticker FROM companies WHERE "isActive" = TRUE ORDER BY ticker')
    tickers = [row[0] for row in cur.fetchall()]
    conn.close()
    return tickers

if __name__ == "__main__":
    if len(sys.argv) > 1:
        tickers = sys.argv[1:]
    else:
        print("Obtendo todos os tickers ativos da base de dados...")
        tickers = get_all_tickers()
        print(f"Total de empresas a auditar: {len(tickers)}")
        
    for t in tickers:
        audit_ticker(t)
