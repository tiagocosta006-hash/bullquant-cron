import os
import requests
import psycopg2
import psycopg2.extras
import uuid
from datetime import datetime
from dotenv import load_dotenv
import time

load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
fred_key = os.getenv('FRED_API_KEY')

if not db_url or not fred_key:
    print("ERRO: DATABASE_URL ou FRED_API_KEY em falta.")
    exit(1)

# Mapeamento: FRED Series ID -> (Nosso Ticker, Nome, Categoria, units)
# units='lin' é linear (valor normal). units='pc1' é a percentagem de mudança homóloga (Year over Year).
MACRO_METRICS = {
    'DGS1MO': ('^DGS1MO', '1-Month Treasury Yield', 'Interest', 'lin'),
    'DGS10': ('^DGS10', '10-Year Treasury Yield', 'Interest', 'lin'),
    'DGS30': ('^DGS30', '30-Year Treasury Yield', 'Interest', 'lin'),
    'T10Y2Y': ('^T10Y2Y', '10-Year minus 2-Year Yield Curve Spread', 'Interest', 'lin'),
    'FEDFUNDS': ('^FEDFUNDS', 'Federal Funds Effective Rate', 'Interest', 'lin'),
    'CPIAUCSL': ('^CPI_YOY', 'US Inflation Rate (YoY)', 'Inflation', 'pc1'),
    'GDPC1': ('^GDP_YOY', 'US Real GDP Growth (YoY)', 'Economy', 'pc1'),
    'UNRATE': ('^UNRATE', 'US Unemployment Rate', 'Economy', 'lin'),
    'VIXCLS': ('^VIX', 'CBOE Volatility Index', 'Sentiment', 'lin'),
    'SP500': ('^GSPC', 'S&P 500 Index', 'Market', 'lin'),
    'NASDAQCOM': ('^IXIC', 'NASDAQ Composite Index', 'Market', 'lin'),
    'DJIA': ('^DJI', 'Dow Jones Industrial Average', 'Market', 'lin')
}

def fetch_fred_data(series_id, start_date, units='lin'):
    url = f"https://api.stlouisfed.org/fred/series/observations?series_id={series_id}&api_key={fred_key}&file_type=json&observation_start={start_date}&units={units}"
    resp = requests.get(url)
    if resp.status_code != 200:
        print(f"Erro ao buscar {series_id}: {resp.status_code} - {resp.text}")
        return []
    data = resp.json()
    observations = data.get('observations', [])
    records = []
    for obs in observations:
        if obs['value'] == '.':  # missing data
            continue
        try:
            records.append({
                'date': obs['date'],
                'close': float(obs['value'])
            })
        except ValueError:
            pass
    return records

def ingest():
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    
    # 1. Garantir que os tickers existem na tabela 'companies' (exchange = 'MACRO')
    for series_id, (ticker, name, category, _) in MACRO_METRICS.items():
        cursor.execute("SELECT id FROM companies WHERE ticker = %s", (ticker,))
        if not cursor.fetchone():
            fake_cuid = "c" + uuid.uuid4().hex[:24]
            # Usamos 'MACRO' como exchange para distingui-los facilmente
            cursor.execute("""
                INSERT INTO companies (id, ticker, name, exchange, country, currency, "isActive", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, 'MACRO', 'US', 'USD', true, now(), now());
            """, (fake_cuid, ticker, name))
            print(f"Criado indicador {name} na tabela companies.")
    conn.commit()
    
    # 2. Descarregar histórico (desde o início dos tempos para apanhar todo o histórico disponível)
    start_date = '1900-01-01'
    for series_id, (ticker, name, _, units) in MACRO_METRICS.items():
        print(f"A descarregar {name} (FRED: {series_id}) desde {start_date}...")
        records = fetch_fred_data(series_id, start_date, units)
        print(f" - Encontradas {len(records)} observações.")
        
        inserted = 0
        
        # Prepare records for batch insertion
        # We need a list of tuples: (ticker, date, close)
        batch_data = [(ticker, r['date'], r['close']) for r in records]
        
        if batch_data:
            insert_query = """
                INSERT INTO prices (ticker, date, close)
                VALUES %s
                ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close;
            """
            psycopg2.extras.execute_values(
                cursor, insert_query, batch_data, template="(%s, %s, %s)", page_size=1000
            )
            inserted = len(batch_data)
        
        conn.commit()
        print(f" - Gravados {inserted} registos para {ticker}.\n")
        time.sleep(1)

    cursor.close()
    conn.close()
    print("Ingestão Macro concluída com sucesso!")

if __name__ == '__main__':
    ingest()
