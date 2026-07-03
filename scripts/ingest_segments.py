"""
ingest_segments.py — Extração "Hardcore" de KPIs e Segmentos via raw XML (XBRL)

Descarrega ficheiros zipados ou XMLs diretos da SEC e faz o parsing das árvores dimensionais 
(Contexts > ExplicitMembers) para injetar dados no campo `revenueSegments`.
"""

import os
import sys
import time
import requests
import json
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import psycopg2
from datetime import datetime

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENV_FILE = os.path.join(ROOT, ".env.dev")
if os.path.exists(ENV_FILE):
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

HEADERS = {"User-Agent": "TiagoCosta (tiago@example.com)"}

# Dicionário de mapeamento auto-gerado
from segment_targets import TARGETS

def get_db_connection():
    return psycopg2.connect(DIRECT_URL)

def fetch_submissions(cik: str) -> list:
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    r = requests.get(url, headers=HEADERS)
    if r.status_code != 200:
        print(f"Erro a buscar submissions para {cik}")
        return []
    
    data = r.json()
    recent = data.get("filings", {}).get("recent", {})
    if not recent:
        return []
    
    filings = []
    for i in range(len(recent.get("accessionNumber", []))):
        form = recent["form"][i]
        if form in ["10-Q", "10-K"]:
            filings.append({
                "acc": recent["accessionNumber"][i],
                "form": form,
                "reportDate": recent["reportDate"][i], # end of period
                "primaryDoc": recent["primaryDocument"][i]
            })
    return filings

def parse_xml_segments(xml_content, mapping: dict, target_end_date: str) -> dict:
    soup = BeautifulSoup(xml_content, "xml")
    context_mapping = {}
    
    # 1. Map contexts to segments
    for ctx in soup.find_all("context"):
        ctx_id = ctx.get("id")
        for member in ctx.find_all("explicitMember"):
            if member.text in mapping:
                period = ctx.find("period")
                if period and period.find("startDate") and period.find("endDate"):
                    start = period.find("startDate").text
                    end = period.find("endDate").text
                    
                    # Ensure it's roughly a quarter (approx 90-95 days) or a year (approx 360-370 days)
                    try:
                        sd = datetime.strptime(start, "%Y-%m-%d")
                        ed = datetime.strptime(end, "%Y-%m-%d")
                        days = (ed - sd).days
                        if (85 <= days <= 100) or (355 <= days <= 375):
                            context_mapping[ctx_id] = {
                                "segment": mapping[member.text],
                                "end": end
                            }
                    except:
                        pass

    # 2. Extract facts
    results = {}
    # Common tags used for segmented revenues
    tags_to_check = [
        "us-gaap:SalesRevenueNet", 
        "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
        "us-gaap:Revenues",
        "us-gaap:SalesRevenueGoodsNet",
        "us-gaap:SalesRevenueServicesNet"
    ]
    
    for tag in tags_to_check:
        for f in soup.find_all(tag):
            ctx_id = f.get("contextRef")
            if ctx_id in context_mapping:
                info = context_mapping[ctx_id]
                # Try to match the report date (or be close to it)
                # target_end_date is YYYY-MM-DD
                if info["end"] == target_end_date:
                    try:
                        results[info["segment"]] = float(f.text)
                    except:
                        pass
    
    return results

def main():
    conn = get_db_connection()
    cur = conn.cursor()
    
    for cik, mapping in TARGETS.items():
        print(f"\nA processar CIK {cik}...")
        
        cur.execute("SELECT id, ticker FROM companies WHERE cik = %s", (cik.lstrip('0'),))
        row = cur.fetchone()
        
        if not row:
            # Maybe the cik in DB has leading zeros, let's try with zeros
            cur.execute("SELECT id, ticker FROM companies WHERE cik = %s", (cik,))
            row = cur.fetchone()
            
        if not row:
            print(f"CIK {cik} não encontrado na BD!")
            continue
            
        company_id = row[0]
        ticker = row[1]
            
        filings = fetch_submissions(cik)
        # Limit to 10 most recent quarters/annuals
        filings = filings[:10]
        
        for f in filings:
            report_date = f["reportDate"]
            acc_full = f["acc"]
            acc_clean = acc_full.replace("-", "")
            primary_doc = f["primaryDoc"]
            
            # The XML instance is usually the primary document itself if it ends in _htm.xml
            # However, sometimes primary is .htm and the XML is ticker-YYYYMMDD_htm.xml
            # We'll try the common iXBRL format
            base_url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_clean}/"
            
            if primary_doc.endswith(".htm"):
                xml_filename = primary_doc.replace(".htm", "_htm.xml")
            else:
                xml_filename = primary_doc
                
            xml_url = base_url + xml_filename
            print(f"  -> A extrair {ticker} para {report_date} via {xml_url}")
            
            r = requests.get(xml_url, headers=HEADERS)
            if r.status_code == 200:
                segments = parse_xml_segments(r.content, mapping, report_date)
                
                print(f"DEBUG: {cik} - {report_date} - Segmentos extraídos: {segments}")
                if segments:
                    print(f"     ✅ Sucesso: {segments}")
                    # Update DB
                    cur.execute('''
                        UPDATE "fundamentals"
                        SET "revenueSegments" = %s
                        WHERE "companyId" = %s AND "periodEnd"::date = %s
                    ''', (json.dumps(segments), company_id, report_date))
                    conn.commit()
                else:
                    print(f"     ❌ Nenhum segmento encontrado ou parse falhou.")
            else:
                print(f"     ⚠️ HTTP {r.status_code} ao buscar XML")
                
            time.sleep(0.5)

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
