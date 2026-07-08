import os
import sys
import datetime
import yfinance as yf
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
import pandas as pd

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENV_FILE = os.path.join(ROOT, ".env.dev")
if not os.path.exists(ENV_FILE):
    sys.exit("ERRO: ficheiro .env.dev não encontrado.")
load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida no .env.dev")

def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def main():
    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        cur.execute('SELECT ticker FROM companies WHERE "isActive" = TRUE')
        all_tickers = [r[0] for r in cur.fetchall()]

    print(f"Total companies to fetch: {len(all_tickers)}")
    
    # Process in chunks of 50 to avoid memory or URL length issues
    chunk_size = 50
    total_inserted = 0

    for i, ticker_chunk in enumerate(chunks(all_tickers, chunk_size)):
        print(f"\\n--- Processing chunk {i+1} ({len(ticker_chunk)} tickers) ---")
        
        try:
            data = yf.download(ticker_chunk, period="5y", group_by="ticker", auto_adjust=False, progress=False)
            
            rows = []
            
            for ticker in ticker_chunk:
                try:
                    ticker_data = data[ticker] if len(ticker_chunk) > 1 else data
                    if ticker_data.empty:
                        continue
                        
                    for date, row in ticker_data.iterrows():
                        if pd.isna(row['Close']):
                            continue
                            
                        close_price = float(row['Close'])
                        vol = None if pd.isna(row['Volume']) else int(row['Volume'])
                        
                        rows.append((
                            ticker,
                            date.date(),
                            float(row['Open']) if not pd.isna(row['Open']) else None,
                            float(row['High']) if not pd.isna(row['High']) else None,
                            float(row['Low']) if not pd.isna(row['Low']) else None,
                            close_price,
                            vol
                        ))
                except Exception as e:
                    print(f"  Error processing {ticker}: {e}")
                    pass
                    
            if rows:
                print(f"  Upserting {len(rows)} rows to database...")
                with conn.cursor() as cur:
                    # Insert in batches of 5000 to avoid huge SQL statements
                    for batch_idx in range(0, len(rows), 5000):
                        batch = rows[batch_idx:batch_idx + 5000]
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
                            batch,
                            template="(%s, %s, %s, %s, %s, %s, %s)"
                        )
                conn.commit()
                total_inserted += len(rows)
            else:
                print("  No valid data in this chunk.")
        except Exception as e:
            conn.rollback()
            print(f"  ERROR fetching/upserting chunk: {e}")

    print(f"\\nSUCCESS! Total historical prices upserted: {total_inserted}")
    conn.close()

if __name__ == "__main__":
    main()
