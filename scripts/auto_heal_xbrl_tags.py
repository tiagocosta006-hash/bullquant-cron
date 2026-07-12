import os
import sys
import json
import time
import re
import requests
import psycopg2
from dotenv import load_dotenv

# Configuração do caminho e variáveis de ambiente
ROOT = os.path.join(os.path.dirname(__file__), "..")
ENV_FILE = os.path.join(ROOT, ".env.dev")

if not os.path.exists(ENV_FILE):
    ENV_FILE = os.path.join(ROOT, ".env")
    if not os.path.exists(ENV_FILE):
        sys.exit("ERRO: ficheiro .env.dev ou .env não encontrado.")

load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("ERRO: DIRECT_URL não definida no ficheiro env")

SEC_HEADERS = {
    "User-Agent": "Tiago Costa tiagocosta18@gmail.com",
    "Accept-Encoding": "gzip, deflate"
}

DISCOVERED_TAGS_FILE = os.path.join(os.path.dirname(__file__), "discovered_tags.json")

# Regras de Fuzzy Matching / Regex para cada métrica
# Revenue excluído "income" genérico para evitar capturar lucros.
METRIC_REGEX = {
    "totalDebt": re.compile(r"(debt|borrowing|notespayable|financing)", re.IGNORECASE),
    "revenue": re.compile(r"(revenue|sales|turnover|interestanddividendincome|netinterestincome)", re.IGNORECASE),
    "capex": re.compile(r"(capex|property.*equipment|capitalexpenditure)", re.IGNORECASE),
    "ebitda": re.compile(r"(ebitda|operatingprofit)", re.IGNORECASE)
}

def init_db(conn):
    """Correção retroativa inicial na BD para R&D e Dividendos."""
    print("A executar correção retroativa integrada (R&D e DPS -> 0.0)...")
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE fundamentals 
            SET "dividendPerShare" = 0.0 
            WHERE "dividendPerShare" IS NULL
        """)
        cur.execute("""
            UPDATE fundamentals 
            SET "researchAndDevelopment" = 0.0 
            WHERE "researchAndDevelopment" IS NULL
        """)
        conn.commit()
        print("Correção retroativa concluída com sucesso!")
    except Exception as e:
        conn.rollback()
        print(f"Erro na correção retroativa: {e}")
    finally:
        cur.close()

def log_discovered_tag(status, ticker, metric, period, tags, value=None):
    """Regista o achado num ficheiro JSON estruturado."""
    log_entry = {
        "ticker": ticker,
        "metric": metric,
        "period": period,
        "status": status,
        "tags_found": tags,
        "value": value
    }
    
    data = []
    if os.path.exists(DISCOVERED_TAGS_FILE):
        try:
            with open(DISCOVERED_TAGS_FILE, 'r') as f:
                data = json.load(f)
        except:
            data = []
            
    data.append(log_entry)
    with open(DISCOVERED_TAGS_FILE, 'w') as f:
        json.dump(data, f, indent=4)

def fetch_sec_facts(cik: str):
    """Download robusto com rate limit dos facts da empresa."""
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik.zfill(10)}.json"
    for attempt in range(3):
        try:
            time.sleep(0.15) # Respeitar rate limit (10 req/s)
            resp = requests.get(url, headers=SEC_HEADERS, timeout=10)
            if resp.status_code == 200:
                try:
                    return resp.json().get("facts", {})
                except json.JSONDecodeError:
                    print(f"  [!] A SEC devolveu HTML em vez de JSON para o CIK {cik}")
                    return {}
            elif resp.status_code == 404:
                return {} # CIK não encontrado ou sem facts XBRL
            elif resp.status_code == 429:
                print("  [!] Rate limit atingido. A aguardar 5 segundos...")
                time.sleep(5)
                continue
            else:
                resp.raise_for_status()
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                print(f"  [!] Falha ao descarregar CIK {cik}: {e}")
                return {}
            time.sleep(2)
    return {}

def find_missing_records(conn):
    """Obtém os registos que têm as métricas vitais a NULL."""
    cur = conn.cursor()
    cur.execute("""
        SELECT c.ticker, c.cik, f."periodType", f."fiscalYear", f."fiscalQuarter", f.id,
               f."totalDebt", f.revenue, f.capex, f.ebitda
        FROM fundamentals f
        JOIN companies c ON f."companyId" = c.id
        WHERE f."totalDebt" IS NULL 
           OR f.revenue IS NULL 
           OR f.capex IS NULL 
           OR f.ebitda IS NULL
        ORDER BY c.ticker, f."fiscalYear" DESC
    """)
    rows = cur.fetchall()
    cur.close()
    
    # Agrupar por Ticker para fazer o fetch do JSON apenas 1 vez por empresa
    missing_by_ticker = {}
    for r in rows:
        ticker, cik, p_type, fy, fq, fid, tdebt, rev, capex, ebitda = r
        if not cik:
            continue
            
        if ticker not in missing_by_ticker:
            missing_by_ticker[ticker] = {
                "cik": cik,
                "records": []
            }
            
        missing_metrics = []
        if tdebt is None: missing_metrics.append("totalDebt")
        if rev is None: missing_metrics.append("revenue")
        if capex is None: missing_metrics.append("capex")
        if ebitda is None: missing_metrics.append("ebitda")
        
        missing_by_ticker[ticker]["records"].append({
            "id": fid,
            "periodType": p_type,
            "fy": fy,
            "fq": fq,
            "missing": missing_metrics
        })
    return missing_by_ticker

def search_value_in_facts(facts, metric, fy, fq, p_type):
    """Varre todas as tags XBRL (us-gaap, ifrs-full, extensões) usando Regex."""
    regex = METRIC_REGEX.get(metric)
    if not regex:
        return []
        
    found_candidates = []
    
    # O periodType da SEC XBRL: Q1/Q2/Q3 usam 'Q1', etc. ANNUAL usa 'FY'.
    sec_fp = "FY" if p_type == "ANNUAL" else f"Q{fq}"
    
    for namespace, tags in facts.items():
        for tag_name, tag_data in tags.items():
            if regex.search(tag_name):
                units = tag_data.get("units", {})
                usd_entries = units.get("USD", []) or units.get("EUR", []) or units.get("GBP", [])
                
                for entry in usd_entries:
                    if entry.get("fy") == fy and entry.get("fp") == sec_fp:
                        val = entry.get("val")
                        if val is not None:
                            # Prevenir duplicações de filing date (pegar no mais recente)
                            found_candidates.append({
                                "tag": f"{namespace}:{tag_name}",
                                "val": val
                            })
                            break # Encontrou um valor para este fy/fp nesta tag
                            
    # Se encontrou mais do que um valor, precisamos garantir unicidade de tag
    unique_tags = {}
    for c in found_candidates:
        # Se a tag já existir, pode ser uma emenda. Assumimos o primeiro (mais recente) 
        # ou evitamos complexidade se a tag for idêntica.
        if c["tag"] not in unique_tags:
            unique_tags[c["tag"]] = c["val"]
            
    return list(unique_tags.items())

def heal_database(conn):
    init_db(conn)
    
    missing_data = find_missing_records(conn)
    total_tickers = len(missing_data)
    
    print(f"\nIniciando Auto-Healing para {total_tickers} empresas...")
    
    cur = conn.cursor()
    
    for i, (ticker, data) in enumerate(missing_data.items(), 1):
        print(f"[{i}/{total_tickers}] A processar {ticker}...")
        
        facts = fetch_sec_facts(data["cik"])
        if not facts:
            continue
            
        for record in data["records"]:
            fy = record["fy"]
            fq = record["fq"]
            p_type = record["periodType"]
            fid = record["id"]
            period_str = f"FY{fy}" if p_type == "ANNUAL" else f"Q{fq} {fy}"
            
            for metric in record["missing"]:
                candidates = search_value_in_facts(facts, metric, fy, fq, p_type)
                
                if len(candidates) == 1:
                    tag_name, val = candidates[0]
                    # Encontrou correspondência exata de apenas 1 tag
                    try:
                        cur.execute(f"""
                            UPDATE fundamentals 
                            SET "{metric}" = %s 
                            WHERE id = %s
                        """, (val, fid))
                        conn.commit()
                        
                        print(f"  ✅ HEALED: {ticker} {period_str} | {metric} = {val} (Tag: {tag_name})")
                        log_discovered_tag("SUCCESS_HEALED", ticker, metric, period_str, [tag_name], val)
                        
                    except Exception as e:
                        conn.rollback()
                        print(f"  ❌ Erro DB UPDATE ({ticker}): {e}")
                        
                elif len(candidates) > 1:
                    # Conflito! Várias tags correspondem ao regex para este trimestre.
                    tag_names = [c[0] for c in candidates]
                    print(f"  ⚠️ CONFLICT: {ticker} {period_str} | {metric} teve {len(candidates)} tags. Ignorado.")
                    log_discovered_tag("CONFLICT_REQUIRES_MANUAL_REVIEW", ticker, metric, period_str, tag_names)
                    
                # Se for 0 (len == 0), significa que mesmo o regex abrangente não apanhou nada, 
                # ou a empresa simplesmente não tem XBRL estruturado para essa métrica, fica NULL silenciosamente.
                
    cur.close()
    conn.close()
    print("\nProcesso de Auto-Healing Concluído!")
    print(f"Verifique as tags descobertas ou conflitos em: {DISCOVERED_TAGS_FILE}")

if __name__ == "__main__":
    try:
        conn = psycopg2.connect(DIRECT_URL)
        heal_database(conn)
    except Exception as e:
        print(f"Erro fatal ao ligar à BD: {e}")
