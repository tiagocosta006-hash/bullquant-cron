import os
import time
import requests
from bs4 import BeautifulSoup
import psycopg2
from dotenv import load_dotenv

load_dotenv('.env.dev')
DIRECT_URL = os.getenv('DIRECT_URL')

HEADERS = {"User-Agent": "TiagoCosta (tiago@example.com)"}

def get_db_connection():
    return psycopg2.connect(DIRECT_URL)

conn = get_db_connection()
cur = conn.cursor()
cur.execute("SELECT id, ticker, cik FROM companies WHERE cik IS NOT NULL ORDER BY id")
companies = cur.fetchall()

def get_latest_10k_xml(cik):
    url = f"https://data.sec.gov/submissions/CIK{cik.zfill(10)}.json"
    r = requests.get(url, headers=HEADERS)
    if r.status_code != 200: return None
    data = r.json()
    recent = data.get("filings", {}).get("recent", {})
    if not recent: return None
    
    for i in range(len(recent.get("form", []))):
        if recent["form"][i] == "10-K":
            acc_full = recent["accessionNumber"][i]
            acc = acc_full.replace("-", "")
            doc = recent["primaryDocument"][i]
            if doc.endswith(".htm"):
                doc = doc.replace(".htm", "_htm.xml")
            return f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{doc}"
    return None

tags_to_check = [
    "us-gaap:SalesRevenueNet", 
    "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
    "us-gaap:Revenues",
    "us-gaap:SalesRevenueGoodsNet",
    "us-gaap:SalesRevenueServicesNet",
    "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax"
]

def clean_segment_name(raw_name):
    # Remove standard suffixes
    name = raw_name.split(":")[-1]
    name = name.replace("SegmentMember", "").replace("Member", "").replace("Segment", "")
    
    # Split camel case
    res = []
    for char in name:
        if char.isupper() and len(res) > 0:
            res.append(" ")
        res.append(char)
    
    final_name = "".join(res).strip()
    return final_name if final_name else raw_name

# We will write to a python file
out_file = open("scripts/segment_targets.py", "w")
out_file.write('TARGETS = {\n')

justifications = open("justifications.md", "w")
justifications.write("# Justificações de Falha de Segmentação\n\n")

print(f"Vai processar {len(companies)} empresas...")

# Iterate all companies
for idx, (c_id, ticker, cik) in enumerate(companies):
    # Sleep to avoid 429
    time.sleep(0.15) 
    
    xml_url = get_latest_10k_xml(cik)
    if not xml_url:
        justifications.write(f"- **{ticker}**: Sem 10-K legível via XBRL encontrado na SEC.\n")
        continue
        
    r = requests.get(xml_url, headers=HEADERS)
    if r.status_code != 200:
        justifications.write(f"- **{ticker}**: Falha ao descarregar XML do 10-K.\n")
        continue
        
    soup = BeautifulSoup(r.content, "xml")
    
    revenue_contexts = set()
    for tag_name in tags_to_check:
        pure_name = tag_name.split(":")[-1]
        for f in soup.find_all([tag_name, pure_name]):
            ctx_id = f.get("contextRef")
            if ctx_id: revenue_contexts.add(ctx_id)
                
    segments = set()
    for ctx_id in revenue_contexts:
        ctx = soup.find(id=ctx_id)
        if ctx:
            for member in ctx.find_all("explicitMember"):
                txt = member.text
                txt_l = txt.lower()
                
                # Rejeitar geografias e filtros irrelevantes
                if any(x in txt_l for x in ["asia", "europe", "america", "nonus", "emea", "international", "domestic", "foreign", "geograph", "country"]):
                    continue
                if any(x in txt_l for x in ["productmember", "servicemember", "othermember", "corporate"]):
                    continue
                    
                if "Segment" in txt or "Member" in txt or txt_l.startswith(f"{ticker.lower()}:"):
                    segments.add(txt)
                    
    if len(segments) == 0:
        justifications.write(f"- **{ticker}**: Empresa não reporta múltiplos segmentos (Single Segment Company) ou usa taxonomia financeira não-standard (ex: Bancos e Seguradoras).\n")
    else:
        # Write to dict
        out_file.write(f'    "{cik}": {{ # {ticker}\n')
        for s in segments:
            clean = clean_segment_name(s)
            out_file.write(f'        "{s}": "{clean}",\n')
        out_file.write('    },\n')
        
    if idx % 10 == 0:
        print(f"Progresso: {idx}/{len(companies)}...")

out_file.write('}\n')
out_file.close()
justifications.close()

print("Mapeamento concluído! Ver segment_targets.py e justifications.md.")
