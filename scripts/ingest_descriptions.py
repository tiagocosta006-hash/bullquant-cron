"""
ingest_descriptions.py — Gera descrições de negócio curtas para as empresas usando a API Gemini.
Corre periodicamente (ex: mensalmente) para atualizar descrições desatualizadas ou vazias.
"""

import os
import sys
import time
from datetime import datetime, timedelta
import psycopg2
import google.generativeai as genai
from dotenv import load_dotenv

ROOT = os.path.join(os.path.dirname(__file__), "..")

if os.environ.get("GITHUB_ACTIONS") == "true":
    pass
else:
    ENV_FILE_DEV = os.path.join(ROOT, ".env.dev")
    ENV_FILE_LOCAL = os.path.join(ROOT, ".env.local")
    if os.path.exists(ENV_FILE_DEV):
        load_dotenv(ENV_FILE_DEV, override=True)
    if os.path.exists(ENV_FILE_LOCAL):
        load_dotenv(ENV_FILE_LOCAL, override=True)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida no ambiente")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    sys.exit("GEMINI_API_KEY não definida")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
genai.configure(api_key=GEMINI_API_KEY)

PROMPT_TEMPLATE = """
Em 2-3 frases curtas, explica de forma muito clara e simples o que a empresa {name} (Ticker: {ticker}, setor: {sector}, indústria: {industry}) faz e como é que ganha dinheiro.
A linguagem deve ser acessível para um investidor iniciante português de Portugal.
Se não souberes ou não tiveres a certeza sobre o negócio atual desta empresa, responde EXATAMENTE com a frase: "Dados insuficientes" — não inventes nada.
"""

def generate_description(name: str, ticker: str, sector: str, industry: str) -> str | None:
    prompt = PROMPT_TEMPLATE.format(
        name=name,
        ticker=ticker,
        sector=sector or "Desconhecido",
        industry=industry or "Desconhecido"
    ).strip()

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt)
        text = response.text.strip()
        
        if text.lower() == "dados insuficientes" or text.lower() == '"dados insuficientes"':
            return None
            
        return text
    except Exception as e:
        print(f"Erro Gemini: {e}")
        return None

def main() -> None:
    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    updated = 0
    # Considera expiradas as descrições geradas há mais de 6 meses
    expiry_date = datetime.now() - timedelta(days=180)

    try:
        with conn.cursor() as cur:
            # Selecionar empresas ativas que não têm descrição ou a descrição expirou
            cur.execute('''
                SELECT id, ticker, name, sector, industry 
                FROM companies 
                WHERE "isActive" = TRUE 
                AND (description IS NULL OR "descriptionGeneratedAt" IS NULL OR "descriptionGeneratedAt" < %s)
                ORDER BY ticker
            ''', (expiry_date,))
            rows = cur.fetchall()

        total = len(rows)
        print(f"Empresas para gerar/atualizar descrição: {total}")

        # Limit to 5 for initial PoC testing if running manually, unless overridden
        # We will process all of them for now, but Gemini free tier has 15 req/min
        for i, row in enumerate(rows):
            comp_id, ticker, name, sector, industry = row
            print(f"[{i+1}/{total}] {ticker}...", end=" ", flush=True)

            desc = generate_description(name, ticker, sector, industry)

            if desc:
                with conn.cursor() as cur:
                    cur.execute(
                        '''UPDATE companies 
                           SET description = %s, "descriptionGeneratedAt" = NOW(), "updatedAt" = NOW() 
                           WHERE id = %s''',
                        (desc, comp_id),
                    )
                conn.commit()
                print(f"ok")
                updated += 1
            else:
                print("sem dados/falha.")

            # Sleep to respect 15 req/min rate limit (approx 4 seconds per request)
            time.sleep(4)

    except Exception as e:
        conn.rollback()
        print(f"ERRO GLOBAL: {e}")
    finally:
        conn.close()
        print(f"\nConcluído. {updated} descrições atualizadas.")

if __name__ == "__main__":
    main()
