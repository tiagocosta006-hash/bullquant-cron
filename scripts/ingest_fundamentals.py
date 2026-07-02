"""
ingest_fundamentals.py — Ingere fundamentais históricos (10 anos) via SEC EDGAR XBRL.
Cron semanal (domingo 3h UTC): python scripts/ingest_fundamentals.py

https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json
User-Agent obrigatório pelo SEC; ≤10 req/s → sleep 0.2s entre empresas.

Cada registo = 1 período fiscal (QUARTERLY ou ANNUAL).
Métricas derivadas (FCF, margens, ROIC, ROE) calculadas e guardadas.
"""

import os
import sys
import time
import datetime
import uuid
import requests
import psycopg2
from dotenv import load_dotenv

ROOT = os.path.join(os.path.dirname(__file__), "..")

if os.environ.get("GITHUB_ACTIONS") == "true":
    pass
else:
    ENV_FILE = os.path.join(ROOT, ".env.dev")
    if not os.path.exists(ENV_FILE):
        sys.exit(
            "ERRO: ficheiro .env.dev não encontrado.\n"
            "Cria um projeto Supabase de DEV e preenche .env.dev com as suas credenciais.\n"
            "NUNCA uses .env.local — estes scripts só correm contra a BD de desenvolvimento."
        )
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

EDGAR_BASE = "https://data.sec.gov/api/xbrl/companyfacts"
EDGAR_HEADERS = {"User-Agent": "BullQuant admin@bullocracy.com"}
SLEEP_BETWEEN = 0.2
HISTORY_YEARS = 10

# ── Tags XBRL com fallbacks (ordem = prioridade) ─────────────────────────────

DURATION_TAGS = {
    # NOTA: revenue usa seleção sensível à magnitude (ver extract_all_metrics):
    # a tag ASC 606 só cobre contract revenue — leases (REITs) e juros/prémios
    # (bancos/seguradoras) estão fora do ASC 606, portanto para esses setores
    # ela devolve apenas fee income (ex.: AVB $7M vs Revenues $3.04B).
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "SalesRevenueGoodsNet",
        "RevenuesNetOfInterestExpense",
        "InterestAndDividendIncomeOperating",
        "InterestIncomeOperating",
        "InterestAndFeeIncomeLoansAndLeases",
        "OperatingLeaseLeaseIncome",
        "OperatingLeasesIncomeStatementLeaseRevenue",
        "OperatingLeasesIncomeStatementMinimumLeaseRevenue",
        "RealEstateRevenueNet",
        "RegulatedAndUnregulatedOperatingRevenue",
        "RegulatedOperatingRevenue",
    ],
    "costOfRevenue": [
        "CostOfRevenue",
        "CostOfGoodsAndServicesSold",
        "CostOfGoodsSold",
        "CostOfServices",
    ],
    "grossProfit": ["GrossProfit"],
    "operatingExpenses": ["OperatingExpenses"],
    "operatingIncome": ["OperatingIncomeLoss"],
    "interestExpense": [
        "InterestExpense",
        "InterestAndDebtExpense",
        "InterestExpenseDebt",
        "InterestExpenseNonoperating",  # fallback: taxonomia XBRL migrou, ex: CMCSA reporta só em 2025
    ],
    "taxExpense": ["IncomeTaxExpenseBenefit"],
    "netIncome": [
        "NetIncomeLoss",
        "ProfitLoss",
        "NetIncomeLossAvailableToCommonStockholdersBasic",
    ],
    "epsDiluted": ["EarningsPerShareDiluted"],
    "sharesOutstandingDur": [
        "WeightedAverageNumberOfDilutedSharesOutstanding",
        "WeightedAverageNumberOfSharesOutstandingBasic",
    ],
    "operatingCashFlow": ["NetCashProvidedByUsedInOperatingActivities"],
    "capex": [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireAndDevelopRealEstate",  # REITs: aquisição/desenvolvimento é o "capex"
        "PaymentsToAcquireCommercialRealEstate",  # REITs alternativo
        "PaymentsToAcquireProductiveAssets",
        "PaymentsForProceedsFromProductiveAssets",
        "PaymentsForCapitalImprovements",
        "PaymentsForLeasingCostsCommissionsAndTenantImprovements",
    ],
    "intangibles": [
        "PaymentsToAcquireIntangibleAssets",
        "PaymentsToDevelopSoftware",
    ],
    "dividendPerShare": [
        "CommonStockDividendsPerShareDeclared",
        "CommonStockDividendsPerShareCashPaid",
    ],
    "researchAndDevelopment": [
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
    ],
    "sellingGeneralAndAdmin": [
        "SellingGeneralAndAdministrativeExpense",
        "GeneralAndAdministrativeExpense",
    ],
    "ebitda": ["EarningsBeforeInterestTaxesDepreciationAndAmortization"],
    # Só usado como fallback de operatingExpenses (não vai para a BD diretamente)
    "costsAndExpenses": ["CostsAndExpenses"],
    "depreciationAndAmortization": [
        "DepreciationDepletionAndAmortization",
        "DepreciationAndAmortization",
        "Depreciation",
        "AmortizationOfIntangibleAssets",
    ],
}

INSTANT_TAGS = {
    "totalAssets": ["Assets"],
    "totalCurrentLiab": ["LiabilitiesCurrent"],
    "totalLiabilities": ["Liabilities"],
    "longTermDebt": ["LongTermDebtNoncurrent", "LongTermDebt"],
    "longTermDebtCurrent": ["LongTermDebtCurrent"],
    "shortTermDebt": ["ShortTermBorrowings", "ShortTermDebt"],
    "commercialPaper": ["CommercialPaper"],
    "totalDebt": [
        "DebtLongtermAndShorttermCombinedAmount",
        "LongTermDebtAndCapitalLeaseObligations",
        "DebtInstrumentCarryingAmount",  # fallback: empresas que emitem dívida consolidada (ex: META bonds)
    ],
    "securedDebt": [  # não vai direto para a BD; fallback para REITs em build_row()
        "SecuredDebt",
        "SecuredDebtNoncurrent",
        "SecuredDebtCurrent",
    ],
    "unsecuredDebt": [  # não vai direto para a BD; fallback para REITs em build_row()
        "UnsecuredDebt",
        "UnsecuredDebtNoncurrent",
        "UnsecuredDebtCurrent",
    ],
    "cash": [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        "Cash",
    ],
    "marketableSecuritiesCurrent": [
        "MarketableSecuritiesCurrent",
        "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
        "AvailableForSaleSecuritiesCurrent",
        "AvailableForSaleSecurities",
        "ShortTermInvestments"
    ],
    "totalEquity": [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "sharesOutstandingInst": ["CommonStockSharesOutstanding"],
}


def new_id() -> str:
    return uuid.uuid4().hex


def get_companies_with_cik(cur, tickers: list[str] | None = None) -> list[dict]:
    if tickers:
        cur.execute(
            'SELECT id, ticker, cik FROM companies WHERE "isActive" = TRUE AND cik IS NOT NULL '
            "AND ticker = ANY(%s) ORDER BY ticker",
            (tickers,),
        )
    else:
        cur.execute(
            'SELECT id, ticker, cik FROM companies WHERE "isActive" = TRUE AND cik IS NOT NULL ORDER BY ticker'
        )
    return [{"id": r[0], "ticker": r[1], "cik": r[2]} for r in cur.fetchall()]


session = requests.Session()
session.headers.update(EDGAR_HEADERS)

def fetch_edgar_facts(cik: str) -> dict | None:
    padded = cik.zfill(10)
    url = f"{EDGAR_BASE}/CIK{padded}.json"
    try:
        r = session.get(url, timeout=30)
        if r.status_code == 404:
            return None
        if r.status_code == 429:
            print("    429 rate limit — a aguardar 60s...")
            time.sleep(60)
            r = session.get(url, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"    EDGAR error: {e}")
        return None


def extract_tag_entries(us_gaap: dict, tag: str) -> list[dict]:
    node = us_gaap.get(tag)
    if not node:
        return []
    for unit_entries in (node.get("units") or {}).values():
        if isinstance(unit_entries, list):
            # Excluir proxies (DEF 14A etc.): a disclosure "pay versus performance"
            # tagga NetIncomeLoss em milhões/milhares (ex.: PCG FY2023 val=2242
            # no DEF 14A vs 2,242,000,000 no 10-K). Só formulários financeiros.
            return [e for e in unit_entries if "14A" not in (e.get("form") or "")]
    return []


def is_annual_duration(e: dict) -> bool:
    if "start" not in e:
        return False
    days = (datetime.date.fromisoformat(e["end"]) - datetime.date.fromisoformat(e["start"])).days
    return 350 <= days <= 380


def is_quarterly_duration(entry):
    start = entry.get("start")
    end = entry.get("end")
    if not start or not end:
        return False
    d1 = datetime.date.fromisoformat(start)
    d2 = datetime.date.fromisoformat(end)
    return 80 <= (d2 - d1).days <= 100


def is_ytd_duration(entry, fp):
    start = entry.get("start")
    end = entry.get("end")
    if not start or not end:
        return False
    d1 = datetime.date.fromisoformat(start)
    d2 = datetime.date.fromisoformat(end)
    days = (d2 - d1).days
    if fp == "Q1": return 80 <= days <= 110
    if fp == "Q2": return 170 <= days <= 200
    if fp == "Q3": return 260 <= days <= 290
    if fp in ("Q4", "FY"): return 350 <= days <= 380
    return False


def best_for_period(entries: list[dict], expected_end: str) -> float | None:
    matches = [e for e in entries if e.get("end") == expected_end]
    if not matches:
        return None
    matches.sort(key=lambda e: e.get("filed") or "", reverse=True)
    val = matches[0].get("val")
    # Guard de unidades: alguns filings tagham o mesmo facto em milhares/milhões
    # (ex.: ANET NetIncomeLoss "841" vs "841000000" com o mesmo period end).
    # Restatements legítimos nunca divergem 100x; bugs de escala são 1000x+.
    # Nesses casos, preferir o match de maior magnitude em vez do mais recente.
    vals = [e.get("val") for e in matches if e.get("val") is not None]
    if val is not None and val != 0 and vals:
        vmax = max(vals, key=abs)
        if abs(vmax) > 100 * abs(val):
            return vmax
    return val


def extract_all_metrics(us_gaap: dict, periods: list[tuple], period_ends: dict) -> tuple[dict, dict]:
    """Extrai métricas duration e instant para todos os períodos.
    Devolve (dur_map, inst_map): {(fy, fp): {campo: val}}.
    """
    dur_map: dict = {p: {} for p in periods}
    inst_map: dict = {p: {} for p in periods}

    for field, tags in DURATION_TAGS.items():
        for (fy, fp) in periods:
            expected_end = period_ends.get((fy, fp))
            if not expected_end:
                continue
            candidates: list[float] = []  # valores por tag, na ordem de prioridade
            for tag in tags:
                entries = extract_tag_entries(us_gaap, tag)
                if not entries:
                    candidates.append(None)
                    continue

                if fp == "FY":
                    pool = [e for e in entries if is_annual_duration(e)]
                elif field in ("operatingCashFlow", "capex"):
                    pool = [e for e in entries if is_ytd_duration(e, fp)]
                else:
                    pool = [e for e in entries if is_quarterly_duration(e)]

                val = best_for_period(pool, expected_end)
                candidates.append(val)
                if val is not None and field != "revenue":
                    dur_map[(fy, fp)][field] = val
                    break

            # Revenue: seleção sensível à magnitude. A prioridade cega falha para
            # REITs/bancos/seguradoras, onde a tag ASC 606 só tem fee income.
            # Escolher a tag de maior prioridade cujo valor seja >= 50% do maior
            # candidato — mantém a tag "certa" nas empresas normais e rejeita
            # componentes minúsculos quando existe um total muito maior.
            if field == "revenue":
                present = [v for v in candidates if v is not None]
                if present:
                    max_abs = max(abs(v) for v in present)
                    for v in candidates:
                        if v is not None and abs(v) >= 0.5 * max_abs:
                            dur_map[(fy, fp)][field] = v
                            break

    # Apply differencing for cash flow metrics
    original_ytd = {}
    for (fy, fp) in periods:
        original_ytd[(fy, fp)] = {
            "operatingCashFlow": dur_map[(fy, fp)].get("operatingCashFlow"),
            "capex": dur_map[(fy, fp)].get("capex")
        }
    
    for (fy, fp) in periods:
        if fp in ("Q1", "FY"): continue
        dur = dur_map[(fy, fp)]
        
        ocf_ytd = original_ytd[(fy, fp)].get("operatingCashFlow")
        capex_ytd = original_ytd[(fy, fp)].get("capex")
        
        ocf_stand = ocf_ytd
        capex_stand = capex_ytd
        
        if fp == "Q2":
            q1 = original_ytd.get((fy, "Q1"), {})
            if q1.get("operatingCashFlow") is not None and ocf_stand is not None:
                ocf_stand -= q1["operatingCashFlow"]
            if q1.get("capex") is not None and capex_stand is not None:
                capex_stand -= q1["capex"]
        elif fp == "Q3":
            q2 = original_ytd.get((fy, "Q2"), {})
            if q2.get("operatingCashFlow") is not None and ocf_stand is not None:
                ocf_stand -= q2["operatingCashFlow"]
            if q2.get("capex") is not None and capex_stand is not None:
                capex_stand -= q2["capex"]
        elif fp == "Q4":
            q3 = original_ytd.get((fy, "Q3"), {})
            if q3.get("operatingCashFlow") is not None and ocf_stand is not None:
                ocf_stand -= q3["operatingCashFlow"]
            if q3.get("capex") is not None and capex_stand is not None:
                capex_stand -= q3["capex"]
                
        dur["operatingCashFlow"] = ocf_stand
        dur["capex"] = capex_stand

    for field, tags in INSTANT_TAGS.items():
        for (fy, fp) in periods:
            expected_end = period_ends.get((fy, fp))
            if not expected_end:
                continue
            for tag in tags:
                entries = extract_tag_entries(us_gaap, tag)
                if not entries:
                    continue
                val = best_for_period(entries, expected_end)
                if val is not None:
                    inst_map[(fy, fp)][field] = val
                    break

    return dur_map, inst_map


def safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    return round(a / b, 6)


def safe_clamp(v, lo, hi):
    if v is None:
        return None
    return max(lo, min(hi, v))


def get_period_info(us_gaap: dict, fy: int, fp: str) -> tuple[str | None, str | None]:
    """Devolve (period_end, filed_at) para um período."""
    for tag in ["Assets", "NetIncomeLoss", "Revenues", "StockholdersEquity"]:
        entries = extract_tag_entries(us_gaap, tag)
        matches = [e for e in entries if e.get("fy") == fy and e.get("fp") == fp]
        if matches:
            if tag in ["NetIncomeLoss", "Revenues"]:
                if fp == "FY":
                    matches = [e for e in matches if is_annual_duration(e)]
                else:
                    matches = [e for e in matches if is_quarterly_duration(e)]
            if not matches:
                continue
            matches.sort(key=lambda e: e.get("end") or "", reverse=True)
            period_end = matches[0].get("end")
            matches_for_end = [e for e in matches if e.get("end") == period_end]
            matches_for_end.sort(key=lambda e: e.get("filed") or "", reverse=True)
            return period_end, matches_for_end[0].get("filed")
    return None, None





def build_row(company_id: str, fy: int, fp: str, period_end: str, filed_at: str | None,
              dur: dict, inst: dict) -> dict:
    shares = dur.get("sharesOutstandingDur") or inst.get("sharesOutstandingInst")
    # Guard: alguns filings têm shares em unidades erradas (milhares/milhões em
    # vez de unidades — ex.: HST "738" ou BRO "276000" em vez de ~276M).
    # netIncome / epsDiluted é a própria definição de shares diluídas: se o valor
    # reportado desviar > 5x dessa referência, usar a referência; sem referência,
    # aceitar apenas valores plausíveis (>= 100k ações).
    # Referência fiável só quando |eps| >= 0.5 (senão o arredondamento a 2 casas
    # domina — ex.: KMI eps 0.01) e o resultado é plausível (>= 1M ações).
    ni_g = dur.get("netIncome")
    eps_g = dur.get("epsDiluted")
    expected_shares = None
    if ni_g is not None and eps_g is not None and abs(eps_g) >= 0.5:
        candidate = ni_g / eps_g
        if candidate >= 1_000_000:
            expected_shares = candidate
    if expected_shares is not None:
        if shares is None or shares / expected_shares > 5 or shares / expected_shares < 0.2:
            shares = expected_shares
    elif shares is not None and shares < 100_000:
        shares = None
    capex_raw = dur.get("capex")
    capex = abs(capex_raw) if capex_raw is not None else None
    op_cf = dur.get("operatingCashFlow")
    fcf = (op_cf - capex) if (op_cf is not None and capex is not None) else None

    revenue = dur.get("revenue")
    gross_profit = dur.get("grossProfit")

    # Fallback: muitas empresas reportam Revenue e CostOfRevenue mas NÃO a tag
    # explícita GrossProfit. Calcular grossProfit = revenue − costOfRevenue
    # recupera a gross margin sem depender dessa única tag XBRL.
    # (Bancos/seguradoras não têm COGS → continua None, que é o correto.)
    cost_of_rev = dur.get("costOfRevenue")
    if gross_profit is None and revenue is not None and cost_of_rev is not None:
        gross_profit = revenue - cost_of_rev

    # ── Level 1 Accounting Integrity ──
    if revenue is not None and gross_profit is not None and gross_profit > revenue:
        gross_profit = revenue  # Força a integridade se a extração colidir tags residuais

    op_income = dur.get("operatingIncome")

    # operatingExpenses: a tag mãe (OperatingExpenses) falta em ~76% das rows.
    # Fallbacks por ordem de fiabilidade:
    #   1. grossProfit − operatingIncome (identidade contabilística)
    #   2. R&D + SG&A (quando ambos existem)
    #   3. CostsAndExpenses − costOfRevenue (total de custos menos COGS)
    op_expenses = dur.get("operatingExpenses")
    if op_expenses is None and gross_profit is not None and op_income is not None:
        derived = gross_profit - op_income
        op_expenses = derived if derived >= 0 else None
    if op_expenses is None:
        rd = dur.get("researchAndDevelopment")
        sga = dur.get("sellingGeneralAndAdmin")
        if rd is not None and sga is not None:
            op_expenses = rd + sga
    if op_expenses is None:
        total_costs = dur.get("costsAndExpenses")
        if total_costs is not None and cost_of_rev is not None:
            derived = total_costs - cost_of_rev
            op_expenses = derived if derived >= 0 else None

    net_income = dur.get("netIncome")
    tax_expense = dur.get("taxExpense")
    total_assets = inst.get("totalAssets")
    curr_liab = inst.get("totalCurrentLiab")
    
    total_debt = inst.get("totalDebt")
    if total_debt is None:
        # Nível 1: somar current + noncurrent (longTermDebt + longTermDebtCurrent + shortTermDebt/commercialPaper)
        # Bug fix: distinguir "tag ausente" (None) de "tag presente com valor 0" — CMG tem LongTermDebt=0.0
        ltd_nc = inst.get("longTermDebt")
        ltd_c = inst.get("longTermDebtCurrent")
        st = inst.get("shortTermDebt") or inst.get("commercialPaper")
        if ltd_nc is not None or ltd_c is not None or st is not None:
            total_debt = (ltd_nc or 0) + (ltd_c or 0) + (st or 0)
    if total_debt is None:
        # Nível 2: dívida secured + unsecured (REITs reportam assim em vez de current/noncurrent)
        secured = inst.get("securedDebt")
        unsecured = inst.get("unsecuredDebt")
        if secured is not None or unsecured is not None:
            total_debt = (secured or 0) + (unsecured or 0)

    cash = inst.get("cash")
    if cash is not None:
        marketable = inst.get("marketableSecuritiesCurrent") or 0
        cash = cash + marketable

    total_equity = inst.get("totalEquity")

    gross_margin = safe_clamp(safe_div(gross_profit, revenue), -99.0, 99.0)
    op_margin = safe_clamp(safe_div(op_income, revenue), -99.0, 99.0)
    net_margin = safe_clamp(safe_div(net_income, revenue), -99.0, 99.0)

    roic = None
    if op_income is not None and total_assets is not None:
        if net_income is not None and tax_expense is not None:
            pre_tax = net_income + tax_expense
            tax_rate = safe_clamp(safe_div(tax_expense, pre_tax), 0, 0.5) or 0.21
        else:
            tax_rate = 0.21
        nopat = op_income * (1 - tax_rate)
        # Abordagem "financing": Dívida Total + Equity − Caixa.
        # Quando a dívida total não resolve (tag em falta), recorrer à base
        # "operating" (Ativos − Passivo Corrente − Caixa), que não depende da
        # dívida — senão o denominador encolhe e o ROIC fica artificialmente alto.
        if total_debt is not None:
            inv_cap = total_debt + (total_equity or 0) - (cash or 0)
        else:
            inv_cap = (total_assets or 0) - (curr_liab or 0) - (cash or 0)
        roic = safe_clamp(safe_div(nopat, inv_cap) if inv_cap > 0 else None, -99.0, 99.0)

    roe = safe_clamp(safe_div(net_income, total_equity) if total_equity and total_equity > 0 else None, -99.0, 99.0)

    ebitda_raw = dur.get("ebitda")
    if ebitda_raw is not None:
        ebitda = ebitda_raw
    else:
        da = dur.get("depreciationAndAmortization") or 0
        interest_exp = dur.get("interestExpense")
        if net_income is not None and tax_expense is not None and interest_exp is not None:
            ebitda = net_income + tax_expense + interest_exp + da
        elif op_income is not None:
            ebitda = op_income + da
        else:
            ebitda = None

    if fp == "FY":
        period_type = "ANNUAL"
        fiscal_quarter = None
    else:
        period_type = "QUARTERLY"
        fiscal_quarter = int(fp[1]) if fp.startswith("Q") else None

    return {
        "id": new_id(),
        "companyId": company_id,
        "periodType": period_type,
        "fiscalYear": fy,
        "fiscalQuarter": fiscal_quarter,
        "periodEnd": period_end,
        "filedAt": filed_at,
        "revenue": revenue,
        "costOfRevenue": dur.get("costOfRevenue"),
        "grossProfit": gross_profit,
        "operatingExpenses": op_expenses,
        "operatingIncome": op_income,
        "interestExpense": dur.get("interestExpense"),
        "taxExpense": tax_expense,
        "netIncome": net_income,
        "epsDiluted": dur.get("epsDiluted"),
        "sharesOutstanding": shares,
        "operatingCashFlow": op_cf,
        "capex": capex,
        "freeCashFlow": fcf,
        "totalAssets": total_assets,
        "totalCurrentLiab": curr_liab,
        "longTermDebt": inst.get("longTermDebt"),
        "totalDebt": total_debt,
        "cash": cash,
        "totalEquity": total_equity,
        "grossMargin": gross_margin,
        "operatingMargin": op_margin,
        "netMargin": net_margin,
        "roic": roic,
        "returnOnEquity": roe,
        "dividendPerShare": dur.get("dividendPerShare"),
        "researchAndDevelopment": dur.get("researchAndDevelopment"),
        "sellingGeneralAndAdmin": dur.get("sellingGeneralAndAdmin"),
        "ebitda": ebitda,
    }


def delete_period(cur, company_id: str, period_type: str, fy: int, fq):
    if fq is None:
        cur.execute(
            """DELETE FROM fundamentals WHERE "companyId" = %s AND "periodType" = %s::"period_type"
               AND "fiscalYear" = %s AND "fiscalQuarter" IS NULL""",
            (company_id, period_type, fy),
        )
    else:
        cur.execute(
            """DELETE FROM fundamentals WHERE "companyId" = %s AND "periodType" = %s::"period_type"
               AND "fiscalYear" = %s AND "fiscalQuarter" = %s""",
            (company_id, period_type, fy, fq),
        )


def insert_fundamental(cur, row: dict):
    cur.execute(
        """
        INSERT INTO fundamentals (
            id, "companyId", "periodType", "fiscalYear", "fiscalQuarter",
            "periodEnd", "filedAt",
            revenue, "costOfRevenue", "grossProfit", "operatingExpenses",
            "operatingIncome", "interestExpense", "taxExpense",
            "netIncome", "epsDiluted", "sharesOutstanding",
            "operatingCashFlow", capex, "freeCashFlow",
            "totalAssets", "totalCurrentLiab", "longTermDebt", "totalDebt",
            cash, "totalEquity",
            "grossMargin", "operatingMargin", "netMargin", roic, "returnOnEquity",
            "dividendPerShare", "researchAndDevelopment", "sellingGeneralAndAdmin", ebitda,
            "createdAt", "updatedAt"
        ) VALUES (
            %(id)s, %(companyId)s, %(periodType)s::"period_type", %(fiscalYear)s, %(fiscalQuarter)s,
            %(periodEnd)s, %(filedAt)s,
            %(revenue)s, %(costOfRevenue)s, %(grossProfit)s, %(operatingExpenses)s,
            %(operatingIncome)s, %(interestExpense)s, %(taxExpense)s,
            %(netIncome)s, %(epsDiluted)s, %(sharesOutstanding)s,
            %(operatingCashFlow)s, %(capex)s, %(freeCashFlow)s,
            %(totalAssets)s, %(totalCurrentLiab)s, %(longTermDebt)s, %(totalDebt)s,
            %(cash)s, %(totalEquity)s,
            %(grossMargin)s, %(operatingMargin)s, %(netMargin)s, %(roic)s, %(returnOnEquity)s,
            %(dividendPerShare)s, %(researchAndDevelopment)s, %(sellingGeneralAndAdmin)s, %(ebitda)s,
            NOW(), NOW()
        )
        """,
        row,
    )


def process_company(conn, company: dict) -> int:
    company_id = company["id"]
    cik = company["cik"]

    facts_json = fetch_edgar_facts(cik)
    if not facts_json:
        return 0

    us_gaap = (facts_json.get("facts") or {}).get("us-gaap") or {}
    if not us_gaap:
        return 0

    min_fy = datetime.date.today().year - HISTORY_YEARS
    periods: set = set()

    # Descobrir todos os (fy, fp) disponíveis nos últimos 10 anos
    for sample_tags in [["NetIncomeLoss", "Assets", "Revenues"]]:
        for tag in sample_tags:
            for e in extract_tag_entries(us_gaap, tag):
                fy = e.get("fy")
                fp = e.get("fp")
                if fy and fp and fy >= min_fy and fp in ("FY", "Q1", "Q2", "Q3", "Q4"):
                    periods.add((fy, fp))

    if not periods:
        return 0

    periods_list = sorted(periods)
    
    period_ends = {}
    period_filed = {}
    for (fy, fp) in periods_list:
        p_end, p_filed = get_period_info(us_gaap, fy, fp)
        period_ends[(fy, fp)] = p_end
        period_filed[(fy, fp)] = p_filed

    dur_map, inst_map = extract_all_metrics(us_gaap, periods_list, period_ends)

    inserted = 0
    for (fy, fp) in periods_list:
        period_end = period_ends.get((fy, fp))
        filed_at = period_filed.get((fy, fp))
        if not period_end:
            continue

        dur = dur_map.get((fy, fp)) or {}
        inst = inst_map.get((fy, fp)) or {}
        if not dur and not inst:
            continue

        row = build_row(company_id, fy, fp, period_end, filed_at, dur, inst)

        try:
            with conn.cursor() as cur:
                delete_period(cur, company_id, row["periodType"], fy, row["fiscalQuarter"])
                insert_fundamental(cur, row)
            conn.commit()
            inserted += 1
        except Exception as e:
            conn.rollback()
            print(f"    DB error {fy}/{fp}: {e}")

    try:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE companies SET "lastFundamentalsUpdate" = NOW(), "updatedAt" = NOW() WHERE id = %s',
                (company_id,),
            )
        conn.commit()
    except Exception:
        conn.rollback()

    return inserted


def main():
    # Uso: python ingest_fundamentals.py [--tickers AAPL,MSFT,...]
    tickers = None
    if "--tickers" in sys.argv:
        idx = sys.argv.index("--tickers")
        if idx + 1 >= len(sys.argv):
            sys.exit("--tickers requer lista separada por vírgulas (ex: --tickers AAPL,AVB)")
        tickers = [t.strip().upper() for t in sys.argv[idx + 1].split(",") if t.strip()]

    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        companies = get_companies_with_cik(cur, tickers)

    total = len(companies)
    print(f"{total} empresas com CIK a processar.")

    total_periods = 0
    errors = 0

    for i, company in enumerate(companies):
        ticker = company["ticker"]
        print(f"[{i+1}/{total}] {ticker}...", end=" ", flush=True)

        try:
            n = process_company(conn, company)
            print(f"{n} períodos")
            total_periods += n
        except psycopg2.OperationalError:
            try:
                # Supabase drops idle connections after ~10 mins, reconnect and retry
                conn = psycopg2.connect(DIRECT_URL)
                conn.autocommit = False
                n = process_company(conn, company)
                print(f"{n} períodos (reconectado)")
                total_periods += n
            except Exception as e2:
                print(f"ERRO na reconexão: {e2}")
                errors += 1
        except Exception as e:
            print(f"ERRO: {e}")
            errors += 1

        time.sleep(SLEEP_BETWEEN)

    conn.close()
    print(f"\nConcluído. {total_periods} períodos inseridos. {errors} erros.")


if __name__ == "__main__":
    main()
