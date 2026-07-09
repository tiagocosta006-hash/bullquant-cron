import os
import sys
import psycopg2
from dotenv import load_dotenv

# Configuração do caminho e variáveis de ambiente
ROOT = os.path.join(os.path.dirname(__file__), "..")
ENV_FILE = os.path.join(ROOT, ".env.dev")

if not os.path.exists(ENV_FILE):
    # Fallback para .env caso .env.dev não exista
    ENV_FILE = os.path.join(ROOT, ".env")
    if not os.path.exists(ENV_FILE):
        sys.exit("ERRO: ficheiro .env.dev ou .env não encontrado.")

load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("ERRO: DIRECT_URL não definida no ficheiro env")

def main():
    print("A ligar à base de dados para auditoria de métricas em falta...")
    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()

    # Métricas absolutas solicitadas
    metrics = [
        "revenue", "netIncome", "epsDiluted", "ebitda", 
        "researchAndDevelopment", "sellingGeneralAndAdmin", 
        "operatingCashFlow", "capex", "freeCashFlow", 
        "cash", "totalAssets", "totalDebt", 
        "sharesOutstanding", "dividendPerShare"
    ]

    # Query para extrair os dados e o ticker da empresa
    query = f"""
        SELECT 
            c.ticker, 
            f."periodType", 
            f."fiscalYear", 
            f."fiscalQuarter",
            {', '.join([f'f."{m}"' for m in metrics])}
        FROM fundamentals f
        JOIN companies c ON f."companyId" = c.id
        ORDER BY c.ticker, f."fiscalYear" DESC, f."fiscalQuarter" DESC
    """
    
    cur.execute(query)
    rows = cur.fetchall()

    # Agrupar erros por Ticker
    issues_by_ticker = {}

    for row in rows:
        ticker = row[0]
        period_type = row[1]
        fy = row[2]
        fq = row[3]
        
        # O período em falta formatado
        period_str = f"FY{fy}" if period_type == "ANNUAL" else f"Q{fq} '{str(fy)[-2:]}"

        missing_metrics = []
        # O offset na tuple começa no índice 4 (já que 0-3 são metadata)
        for i, metric in enumerate(metrics):
            if row[4 + i] is None:
                missing_metrics.append(metric)
        
        if missing_metrics:
            if ticker not in issues_by_ticker:
                issues_by_ticker[ticker] = []
            
            issues_by_ticker[ticker].append({
                "period": period_str,
                "missing": missing_metrics
            })

    # Mostrar o output formatado na consola
    if not issues_by_ticker:
        print("\n✅ Excelente! Nenhuma das métricas absolutas pedidas está 'null' na base de dados.")
    else:
        print("\n⚠️ RELATÓRIO DE FALHAS: MÉTRICAS NULL POR TICKER ⚠️")
        print("="*60)
        
        total_missing_periods = 0
        
        for ticker, issues in sorted(issues_by_ticker.items()):
            print(f"\n[{ticker}]")
            for issue in issues:
                total_missing_periods += 1
                missing_str = ", ".join(issue["missing"])
                print(f"  └─ {issue['period']} -> Falta: {missing_str}")
        
        print("="*60)
        print(f"Resumo: Encontrados dados em falta em {len(issues_by_ticker)} empresas (afetando {total_missing_periods} períodos fiscais).")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
