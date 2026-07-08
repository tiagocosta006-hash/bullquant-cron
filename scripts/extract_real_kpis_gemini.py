import os
import json
import psycopg2
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(".env.local")

# Database connection
DB_URL = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB_URL)

# Setup Gemini
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("Error: GEMINI_API_KEY not found in .env.local")
    exit(1)
    
client = genai.Client(api_key=api_key)
MODEL_ID = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Load definitions
try:
    with open("scripts/kpi_definitions.json", "r") as f:
        KPI_DEFS = json.load(f)
except Exception:
    KPI_DEFS = {}

def process_batch():
    try:
        with open("scratch/current_mda_batch.json", "r") as f:
            batch = json.load(f)
    except Exception as e:
        print(f"Error loading batch: {e}")
        return

    for ticker, text in batch.items():
        print(f"Processing {ticker} (Text length: {len(text)} chars)...")
        
        # Determine existing KPIs if any
        existing_kpis = KPI_DEFS.get(ticker, [])
        kpi_names_str = ""
        if existing_kpis:
            names = [k.get("name", k.get("metric")) if isinstance(k, dict) else k for k in existing_kpis]
            kpi_names_str = "Look SPECIFICALLY for these previously discovered KPIs: " + ", ".join(names)

        prompt = f"""
# MISSION
You are an Elite Equity Research Analyst specializing in forensic accounting and SEC filings. Your sole job is to read the provided text of a US public company (usually a 10-K) and extract their EXACT, specific Business KPIs (Key Performance Indicators) ALONG WITH their historical numerical values.

# CRITICAL RULES (ZERO TOLERANCE)
1. **NO GUESSING / NO HALLUCINATION:** If a KPI is not explicitly mentioned and tracked as a core operating metric in the provided text, DO NOT invent it.
2. **NO GENERIC FINANCIALS:** Do NOT extract standard GAAP financial metrics like "Net Income", "EBITDA", "Gross Margin", or "Revenue". We want Non-GAAP operating metrics (e.g., "Monthly Active Users", "Same-Store Sales", "Vehicle Deliveries").
3. **INDUSTRY SPECIFICITY:** The KPIs must be unique to the company's business model.
4. **NUMERICAL EXTRACTION:** For every valid KPI you find, you MUST extract the actual numerical values mentioned in the text for the periods compared (e.g., current year, prior year). Map them to the calendar year string.
5. **TARGET KPIs:** {kpi_names_str}

# OUTPUT FORMAT
You must respond with ONLY a valid JSON object containing `kpis` (array of KPI objects). Do not include markdown formatting outside the JSON block.
Example:
{{
  "kpis": [
    {{
      "name": "Vehicle Deliveries",
      "type": "number",
      "unit": "vehicles",
      "values": {{
        "2023": 1808581,
        "2022": 1313851
      }}
    }}
  ]
}}

# TEXT TO ANALYZE
{text}
"""
        
        print("Calling Gemini API...")
        try:
            response = client.models.generate_content(
                model=MODEL_ID,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.0
                )
            )
            
            result_json = response.text
            
            # Save the result
            with open(f"scratch/{ticker}_kpi.json", "w") as f:
                f.write(result_json)
                
            print(f"Successfully extracted KPIs for {ticker}!")
            
        except Exception as e:
            print(f"API Error for {ticker}: {e}")

if __name__ == "__main__":
    process_batch()
