import os
import sys
import json
import psycopg2
from dotenv import load_dotenv

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENV_FILE = os.path.join(ROOT, ".env.dev")

if not os.path.exists(ENV_FILE):
    ENV_FILE = os.path.join(ROOT, ".env")
    if not os.path.exists(ENV_FILE):
        sys.exit("ERRO: ficheiro env não encontrado.")

load_dotenv(ENV_FILE)
DIRECT_URL = os.getenv("DIRECT_URL")

DISCOVERED_TAGS_FILE = os.path.join(os.path.dirname(__file__), "discovered_tags.json")

def rollback_false_heals():
    if not os.path.exists(DISCOVERED_TAGS_FILE):
        print("Ficheiro de log não encontrado.")
        return

    with open(DISCOVERED_TAGS_FILE, 'r') as f:
        data = json.load(f)

    # Identificar tickers afetados por falsas curas
    affected_tickers = set()
    for entry in data:
        if entry.get("status") == "SUCCESS_HEALED" and entry.get("metric") in ("totalDebt", "capex"):
            affected_tickers.add(entry.get("ticker"))

    if not affected_tickers:
        print("Nenhuma falsa cura identificada para rollback.")
        return

    tickers_list = list(affected_tickers)
    print(f"Executando rollback para {len(tickers_list)} empresas: {tickers_list}")

    try:
        conn = psycopg2.connect(DIRECT_URL)
        cur = conn.cursor()
        
        # Rollback capex and totalDebt to NULL where they were recently updated
        # The easiest and safest way is to NULL them for the affected companies.
        # Since the user will run a full ingestion right after, the periods will be refreshed anyway.
        cur.execute("""
            UPDATE fundamentals f
            SET "totalDebt" = NULL, capex = NULL
            FROM companies c
            WHERE f."companyId" = c.id
              AND c.ticker = ANY(%s)
        """, (tickers_list,))
        
        conn.commit()
        print(f"Rollback concluído com sucesso. Registos afetados: {cur.rowcount}")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Erro no rollback: {e}")

if __name__ == "__main__":
    rollback_false_heals()
