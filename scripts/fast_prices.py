import os
import sys
import datetime
import yfinance as yf
import psycopg2
import psycopg2.extras
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

    print(f"Downloading latest prices for {len(tickers)} companies via yfinance...")
    
    # Download 1 day of data for all tickers
    data = yf.download(tickers, period="1d", group_by="ticker", auto_adjust=False)
    
    today_date = datetime.date.today()
    rows = []
    
    for ticker in tickers:
        try:
            # If multiple tickers are requested, yfinance returns a MultiIndex DataFrame
            if len(tickers) > 1:
                ticker_data = data[ticker]
            else:
                ticker_data = data
            
            if ticker_data.empty:
                continue
                
            # Get the last available row
            last_row = ticker_data.iloc[-1]
            if pd.isna(last_row['Close']):
                continue
                
            close_price = float(last_row['Close'])
            # if 'Volume' is NaN, replace with 0 or None
            import pandas as pd
            vol = None if pd.isna(last_row['Volume']) else int(last_row['Volume'])
            
            rows.append((
                ticker,
                today_date,
                float(last_row['Open']) if not pd.isna(last_row['Open']) else None,
                float(last_row['High']) if not pd.isna(last_row['High']) else None,
                float(last_row['Low']) if not pd.isna(last_row['Low']) else None,
                close_price,
                vol
            ))
        except Exception as e:
            # Ticker might not have data
            pass
            
    if not rows:
        print("No valid price data downloaded.")
        conn.close()
        return
        
    print(f"Upserting {len(rows)} prices into database...")
    try:
        with conn.cursor() as cur:
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
                rows,
                template="(%s, %s, %s, %s, %s, %s, %s)"
            )
        conn.commit()
        print("Success! Database populated.")
    except Exception as e:
        conn.rollback()
        print(f"ERRO DB: {e}")

    conn.close()

if __name__ == "__main__":
    import pandas as pd
    main()
