import os
import requests
import psycopg2
import uuid
from datetime import datetime, timedelta
from dotenv import load_dotenv
import time

load_dotenv('.env.local')
load_dotenv('.env')

# Obter as vars
db_url = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
fred_key = os.getenv('FRED_API_KEY')

if not db_url or not fred_key:
    print("ERRO: DATABASE_URL ou FRED_API_KEY em falta.")
    exit(1)

# Mapeamento FRED Series ID -> (Nosso Ticker, Nome, País, Moeda)
INDICES = {
    'SP500': ('^GSPC', 'S&P 500', 'US', 'USD'),
    'DJIA': ('^DJI', 'Dow Jones Industrial Average', 'US', 'USD'),
    'NASDAQCOM': ('^IXIC', 'Nasdaq Composite', 'US', 'USD'),
    'VIXCLS': ('^VIX', 'CBOE Volatility Index', 'US', 'USD'),
    'NIKKEI225': ('^N225', 'Nikkei 225', 'JP', 'JPY')
}

def fetch_fred_data(series_id, start_date):
    url = f"https://api.stlouisfed.org/fred/series/observations?series_id={series_id}&api_key={fred_key}&file_type=json&observation_start={start_date}"
    resp = requests.get(url)
    if resp.status_code != 200:
        print(f"Erro ao buscar {series_id}: {resp.status_code} - {resp.text}")
        return []
    data = resp.json()
    observations = data.get('observations', [])
    records = []
    for obs in observations:
        if obs['value'] == '.':  # Dados em falta (ex: feriados)
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
    
    # 1. Garantir que os índices existem na tabela 'companies'
    for series_id, (ticker, name, country, currency) in INDICES.items():
        cursor.execute("SELECT id FROM companies WHERE ticker = %s", (ticker,))
        if not cursor.fetchone():
            # Inserir se não existir
            fake_cuid = "c" + uuid.uuid4().hex[:24]
            cursor.execute("""
                INSERT INTO companies (id, ticker, name, exchange, country, currency, "isActive", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, 'INDEX', %s, %s, true, now(), now());
            """, (fake_cuid, ticker, name, country, currency))
            print(f"Criado índice {name} na tabela companies.")
    conn.commit()
    
    # 2. Buscar histórico e inserir na tabela 'prices'
    start_date = (datetime.now() - timedelta(days=3650)).strftime('%Y-%m-%d')
    for series_id, (ticker, name, _, _) in INDICES.items():
        print(f"A descarregar {name} (FRED: {series_id}) desde {start_date}...")
        records = fetch_fred_data(series_id, start_date)
        print(f" - Encontrados {len(records)} dias de cotação.")
        
        inserted = 0
        for r in records:
            cursor.execute("""
                INSERT INTO prices (ticker, date, close)
                VALUES (%s, %s, %s)
                ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close;
            """, (ticker, r['date'], r['close']))
            inserted += 1
        
        conn.commit()
        print(f" - Gravados {inserted} registos para {ticker}.\n")
        time.sleep(1) # Respeitar limites da API (máx 120 calls/min)

    cursor.close()
    conn.close()
    print("Ingestão concluída com sucesso!")

if __name__ == '__main__':
    ingest()
