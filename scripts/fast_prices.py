import os
import sys
import datetime
import yfinance as yf
import psycopg2
import psycopg2.extras
import pandas as pd
from dotenv import load_dotenv

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENV_FILE = os.path.join(ROOT, ".env.dev")
if not os.path.exists(ENV_FILE):
    sys.exit("ERRO: ficheiro .env.dev não encontrado.")
load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida no .env.dev")

def main():
    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    print("Fetching companies from database...")
    with conn.cursor() as cur:
        cur.execute('SELECT ticker FROM companies WHERE "isActive" = TRUE')
        tickers = [r[0] for r in cur.fetchall()]

    if not tickers:
        print("No active companies found.")
        return

    print("Determining backfill start date...")
    with conn.cursor() as cur:
        cur.execute('SELECT MIN(max_date) FROM (SELECT MAX(date) as max_date FROM prices WHERE ticker = ANY(%s)) sub', (tickers,))
        min_max_date = cur.fetchone()[0]

    if not min_max_date:
        start_date = (datetime.date.today() - datetime.timedelta(days=10*365)).isoformat()
    else:
        start_date = min_max_date.isoformat()

    end_date = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

    print(f"Downloading prices from {start_date} to {end_date} for {len(tickers)} companies via yfinance...")
    
    data = yf.download(tickers, start=start_date, end=end_date, group_by="ticker", auto_adjust=False)
    
    rows = []
    
    for ticker in tickers:
        try:
            if len(tickers) > 1:
                if ticker not in data.columns.levels[0]:
                    continue
                ticker_data = data[ticker]
            else:
                ticker_data = data
            
            if ticker_data.empty:
                continue
                
            for idx, row in ticker_data.iterrows():
                if pd.isna(row['Close']):
                    continue
                    
                row_date = idx.date()
                close_price = float(row['Close'])
                vol = None if pd.isna(row.get('Volume')) else int(row['Volume'])
                
                rows.append((
                    ticker,
                    row_date,
                    float(row['Open']) if not pd.isna(row.get('Open')) else None,
                    float(row['High']) if not pd.isna(row.get('High')) else None,
                    float(row['Low']) if not pd.isna(row.get('Low')) else None,
                    close_price,
                    vol
                ))
        except Exception as e:
            print(f"Warning: Failed to parse data for {ticker}: {e}")
            
    if not rows:
        print("No valid price data downloaded.")
        conn.close()
        return
        
    print(f"Upserting {len(rows)} prices into database...")
    chunk_size = 50000
    try:
        with conn.cursor() as cur:
            for i in range(0, len(rows), chunk_size):
                chunk = rows[i:i + chunk_size]
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO prices (ticker, date, open, high, low, close, volume)
                    VALUES %s
                    ON CONFLICT (ticker, date) DO UPDATE SET
                        open   = EXCLUDED.open,
                        high   = EXCLUDED.high,
                        low    = EXCLUDED.low,
                        close  = EXCLUDED.close,
                        volume = EXCLUDED.volume
                    """,
                    chunk,
                    template="(%s, %s, %s, %s, %s, %s, %s)"
                )
                
            cur.execute(
                'UPDATE companies SET "lastPriceUpdate" = NOW(), "updatedAt" = NOW() WHERE ticker = ANY(%s)',
                (tickers,)
            )
            
        conn.commit()
        print("Success! Database populated.")
    except Exception as e:
        conn.rollback()
        print(f"ERRO DB: {e}")

    conn.close()

if __name__ == "__main__":
    main()
