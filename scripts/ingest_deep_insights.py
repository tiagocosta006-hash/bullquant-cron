"""
ingest_deep_insights.py — Gera insights profundos de negócio (SWOT, Bull/Bear) usando JSON Mode no Gemini.
"""

import os
import sys
import time
import json
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
Atua como um analista financeiro de Wall Street de topo. Analisa a empresa {name} (Ticker: {ticker}, setor: {sector}, indústria: {industry}).

Tens de devolver a resposta ESTRITAMENTE num formato JSON válido (sem blocos de código markdown como ```json) de acordo com o seguinte esquema:
{{
  "tenhoDadosSuficientes": true/false (boolean. Mete false se não conheceres bem a empresa ou não tiveres dados suficientes para fazer uma análise profunda de qualidade. Se conheceres, mete true),
  "mercadoGeografico": "String com os principais mercados de atuação da empresa. Ex: 'Global', 'América do Norte', 'Europa e Ásia'. (Máximo de 5 palavras).",
  "bullCase": "String. A tese do Touro: Porque é que os investidores estão otimistas com esta ação? O que a torna num bom investimento a longo prazo? (2 a 3 frases curtas)",
  "bearCase": "String. A tese do Urso: Porque é que os pessimistas evitam esta ação? Quais são as grandes falhas da tese otimista? (2 a 3 frases curtas)",
  "swot": {{
    "forcas": ["Array de 2 a 3 strings curtas (Forças)"],
    "fraquezas": ["Array de 2 a 3 strings curtas (Fraquezas)"],
    "oportunidades": ["Array de 2 a 3 strings curtas (Oportunidades)"],
    "ameacas": ["Array de 2 a 3 strings curtas (Ameaças)"]
  }},
  "outrasInformacoesRelevantes": "String ou null. Partilha alguma curiosidade, vantagem competitiva oculta, risco regulatório gigante ou 'fun fact' importante. Se não tiveres nada de especial a acrescentar, usa null."
}}

Regras Críticas:
- A linguagem de todos os campos de texto deve ser em Português de Portugal.
- Os dados na SWOT devem ser diretos e fáceis de ler.
- NÃO inventes teses genéricas se não conheceres a empresa a fundo (mete tenhoDadosSuficientes = false).
"""

def generate_insights(name: str, ticker: str, sector: str, industry: str) -> dict | None:
    prompt = PROMPT_TEMPLATE.format(
        name=name,
        ticker=ticker,
        sector=sector or "Desconhecido",
        industry=industry or "Desconhecido"
    ).strip()

    try:
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
            ),
        )
        response = model.generate_content(prompt)
        text = response.text.strip()
        
        data = json.loads(text)
        
        if not data.get("tenhoDadosSuficientes", False):
            return None
            
        return data
    except Exception as e:
        print(f"Erro Gemini ou JSON: {e}")
        return None

def main() -> None:
    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    updated = 0

    try:
        with conn.cursor() as cur:
            # Selecionar empresas ativas que ainda não têm o bullCase preenchido
            cur.execute('''
                SELECT id, ticker, name, sector, industry 
                FROM companies 
                WHERE "isActive" = TRUE 
                AND "bullCase" IS NULL
                ORDER BY ticker
            ''')
            rows = cur.fetchall()

        total = len(rows)
        print(f"Empresas para gerar/atualizar insights profundos: {total}")

        for i, row in enumerate(rows):
            comp_id, ticker, name, sector, industry = row
            print(f"[{i+1}/{total}] {ticker}...", end=" ", flush=True)

            data = generate_insights(name, ticker, sector, industry)

            if data:
                with conn.cursor() as cur:
                    cur.execute(
                        '''UPDATE companies 
                           SET "geographicFocus" = %s,
                               "bullCase" = %s,
                               "bearCase" = %s,
                               "swot" = %s,
                               "extraInfo" = %s,
                               "updatedAt" = NOW() 
                           WHERE id = %s''',
                        (
                            data.get("mercadoGeografico"),
                            data.get("bullCase"),
                            data.get("bearCase"),
                            json.dumps(data.get("swot", {})),
                            data.get("outrasInformacoesRelevantes"),
                            comp_id
                        ),
                    )
                conn.commit()
                print(f"ok")
                updated += 1
            else:
                print("sem dados/falha.")

            time.sleep(4) # Rate limit Gemini Free (15 RPM)

    except Exception as e:
        conn.rollback()
        print(f"ERRO GLOBAL: {e}")
    finally:
        conn.close()
        print(f"\nConcluído. {updated} perfis completos atualizados.")

if __name__ == "__main__":
    main()
