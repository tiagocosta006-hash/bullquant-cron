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
import bisect
import gzip
import json
import uuid
import requests
import yfinance as yf  # SÓ para splits (TODO(polygon): migrar; FX já é BCE)
import psycopg2
from urllib.parse import urlparse
from psycopg2.extras import Json
from dotenv import load_dotenv

# Consolas Windows usam cp1252 — sem isto, prints com caracteres fora do cp1252
# (ex.: "←" no sync de classes duplas) matam o script a meio da ingestão.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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


def assert_local_db(url: str) -> None:
    # load_dotenv NÃO faz override de variáveis já exportadas na shell — uma
    # DIRECT_URL exportada a apontar à Supabase venceria o .env.dev em silêncio
    # e este script escreveria em produção. Fora do cron (GITHUB_ACTIONS) só se
    # aceita localhost; aplicar a produção exige um --allow-remote deliberado.
    if os.environ.get("GITHUB_ACTIONS") == "true" or "--allow-remote" in sys.argv:
        return
    host = (urlparse(url).hostname or "").lower()
    if host not in ("localhost", "127.0.0.1", "::1"):
        sys.exit(
            f"ERRO: DIRECT_URL aponta para '{host}', não localhost.\n"
            "Se queres mesmo escrever numa BD remota, corre com --allow-remote."
        )


assert_local_db(DIRECT_URL)

EDGAR_BASE = "https://data.sec.gov/api/xbrl/companyfacts"
EDGAR_HEADERS = {"User-Agent": "Bullmetrics admin@bullocracy.com"}
SLEEP_BETWEEN = 0.2
HISTORY_YEARS = 10
REFRESH_CACHE = "--refresh-cache" in sys.argv

# Moedas de reporte suportadas (ordem = prioridade de seleção de unidade).
# DKK/SEK/NOK: a NVO (DKK) ficou meses gravada em coroas cruas porque a lista
# antiga não as tinha — a inferência caía para "USD" e nada era convertido.
VALID_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "JPY", "AUD", "DKK", "SEK", "NOK"]

# ── Tags XBRL com fallbacks (ordem = prioridade) ─────────────────────────────

DURATION_TAGS = {
    # NOTA: revenue usa seleção sensível à magnitude (ver extract_all_metrics):
    # a tag ASC 606 só cobre contract revenue — leases (REITs) e juros/prémios
    # (bancos/seguradoras) estão fora do ASC 606, portanto para esses setores
    # ela devolve apenas fee income (ex.: AVB $7M vs Revenues $3.04B).
    "revenue": [
        # RevenuesNetOfInterestExpense primeiro: quando existe, é o "total net
        # revenues" reportado por brokers/bancos (ex.: IBKR $2.2B) — a tag ASC 606
        # nestes emitentes só cobre comissões/fees e passaria o guard de 50%.
        "RevenuesNetOfInterestExpense",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "SalesRevenueServicesNet",
        "Revenue",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "SalesRevenueGoodsNet",
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
        "CostOfSales",
        "CostOfGoodsAndServicesSold",
        "CostOfGoodsSold",
        "CostOfServices",
        "CostOfPurchasedPower",
        "CostOfSalesEnergy",
        "FuelCosts",
        "UtilitiesOperatingExpenseMaintenanceOperationsAndOtherCostsAndExpenses",
        "DirectCostsOfLeasedAndRentedPropertyOrEquipment",
        "PropertyOperatingExpense",
        "RealEstateTaxExpense",
        "PolicyholderBenefitsAndClaimsIncurredNet"
    ],
    "grossProfit": ["GrossProfit"],
    "operatingExpenses": ["OperatingExpenses", "NoninterestExpense", "OperatingCostsAndExpenses", "OtherOperatingIncomeExpense", "AdministrativeExpense"],
    "operatingIncome": ["OperatingIncomeLoss", "IncomeFromOperations", "OperatingIncomeLossFromContinuingOperations", "ProfitLossFromOperatingActivities"],
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
        "ProfitLossAttributableToOwnersOfParent",
        "NetIncomeLossAvailableToCommonStockholdersBasic",
    ],
    "epsDiluted": [
        "EarningsPerShareDiluted",
        "DilutedEarningsLossPerShare",
        # Loss-makers (WDAY/WBD-class): com prejuízo, diluído == básico e muitas
        # empresas tagham APENAS a variante combinada — sem ela, EPS fica null.
        "EarningsPerShareBasicAndDiluted",
        "NetIncomeLossPerOutstandingShare",
        "NetIncomeLossPerShareDiluted",
        # Fallback: empresas com discontinued ops tagham só o EPS de continuing
        # (ex.: COP FY2018 — sem isto, o guard NI/EPS de shares não corre e
        # shares taggadas em milhares passam despercebidas).
        "IncomeLossFromContinuingOperationsPerDilutedShare",
        "IncomeLossFromContinuingOperationsPerBasicShare",
        # IFRS continuing-ops (SHEL-class): últimas na fila — só quando não há
        # EPS total; preferível a null e o guard NI/EPS continua a validar.
        "DilutedEarningsLossPerShareFromContinuingOperations",
        "BasicEarningsLossPerShareFromContinuingOperations",
    ],
    "sharesOutstandingDur": [
        "WeightedAverageNumberOfDilutedSharesOutstanding",
        "WeightedAverageNumberOfSharesOutstandingBasic",
        # Variante combinada dos loss-makers — AMBAS as grafias existem na
        # taxonomia ("Share" singular é a oficial us-gaap; a plural aparece
        # em extensões/versões antigas).
        "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
        "WeightedAverageNumberOfSharesOutstandingBasicAndDiluted",
        "NumberOfSharesOutstanding",
    ],
    "operatingCashFlow": [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        "CashFlowsFromUsedInOperatingActivities"
    ],
    "capex": [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
        "PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets",
        "PurchaseOfPropertyPlantAndEquipment",
        "PaymentsToAcquireOtherPropertyPlantAndEquipment",
        "PaymentsToAcquirePropertyPlantAndEquipmentAndOtherAssets",
        "PaymentsToAcquireAndDevelopRealEstate",  # REITs: aquisição/desenvolvimento é o "capex"
        "PaymentsToAcquireOilAndGasProperty",
        "PaymentsToAcquireEquityMethodInvestments",
        "PaymentsToExploreAndDevelopOilAndGasProperties",
        "PaymentsToAcquireCommercialRealEstate",  # REITs alternativo
        "PaymentsToAcquireProductiveAssets",
        "PaymentsForProceedsFromProductiveAssets",
        "PaymentsForCapitalImprovements",
        "PaymentsForLeasingCostsCommissionsAndTenantImprovements",
    ],
    "intangibles": [
        "PaymentsToAcquireIntangibleAssets",
        "PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities",
        "PaymentsToDevelopSoftware",
    ],
    "dividendPerShare": [
        "CommonStockDividendsPerShareDeclared",
        "CommonStockDividendsPerShareCashPaid",
        "DividendsPerShare",
    ],
    "researchAndDevelopment": [
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
        "ResearchAndDevelopmentExpenseSoftwareExcludingAcquiredInProcessCost"
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
        "DepreciationAndAmortisationExpense",
        "DepreciationExpense",
        "AmortisationExpense",
        "Depreciation",
        "AmortizationOfIntangibleAssets",
    ],
}

INSTANT_TAGS = {
    "totalAssets": ["Assets"],
    "totalCurrentLiab": ["LiabilitiesCurrent", "CurrentLiabilities"],
    "totalLiabilities": ["Liabilities"],
    "longTermDebt": [
        "LongTermDebtNoncurrent",
        # ⚠️ NUNCA reintroduzir "NoncurrentLiabilities" aqui: em IFRS é o TOTAL
        # dos passivos não correntes (pensões, impostos diferidos, provisões…),
        # não dívida — sobrestimava a dívida das europeias em múltiplos.
        "LongTermDebt",
        "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
        "ConvertibleDebtNoncurrent",
        "ConvertibleDebt",
        # IFRS: parcela non-current dos borrowings (SAP/RACE-class filers)
        "NoncurrentPortionOfNoncurrentBorrowings",
    ],
    "longTermDebtCurrent": ["LongTermDebtCurrent", "CurrentBorrowings"],
    "shortTermDebt": ["ShortTermBorrowings", "ShortTermDebt", "ShorttermBorrowings"],
    "commercialPaper": ["CommercialPaper"],
    "totalDebt": [
        "DebtLongtermAndShorttermCombinedAmount",
        "Borrowings",
        "LongTermDebtAndCapitalLeaseObligations",
    ],
    # Fallback de nível 2 em build_row (DEPOIS da soma current+noncurrent):
    # é valor de face da dívida emitida (ex: META bonds) — no MSFT dava $52.9B
    # vs $47.2B do balanço, por isso não pode vencer a soma dos componentes.
    "debtInstrumentCarryingAmount": ["DebtInstrumentCarryingAmount"],
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
        "CashAndCashEquivalents",
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        "Cash",
        # Bancos (JPM/WFC 2016-class): o caixa é "cash and due from banks";
        # os depósitos QUE O BANCO TEM noutros bancos entram via
        # interestBearingDeposits (só somado para Financials em build_row).
        "CashAndDueFromBanks",
    ],
    # Ativo de bancos: depósitos remunerados detidos noutros bancos — parte do
    # caixa e equivalentes na convenção bancária. NÃO confundir com "Deposits"
    # (passivo = depósitos de clientes), que nunca pode entrar em cash/dívida.
    "interestBearingDeposits": ["InterestBearingDepositsInBanks"],
    "marketableSecuritiesCurrent": [
        "MarketableSecuritiesCurrent",
        "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
        "AvailableForSaleSecuritiesCurrent",
        "AvailableForSaleSecurities",
        "ShortTermInvestments"
    ],
    "totalEquity": [
        "StockholdersEquity",
        "Equity",
        "EquityAttributableToOwnersOfParent",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "sharesOutstandingInst": ["CommonStockSharesOutstanding", "NumberOfSharesOutstanding"],
}


def new_id() -> str:
    return uuid.uuid4().hex


def get_companies_with_cik(cur, tickers: list[str] | None = None) -> list[dict]:
    if tickers:
        cur.execute(
            'SELECT id, ticker, cik, sector, currency FROM companies WHERE "isActive" = TRUE AND cik IS NOT NULL '
            "AND ticker = ANY(%s) ORDER BY ticker",
            (tickers,),
        )
    else:
        cur.execute(
            'SELECT id, ticker, cik, sector, currency FROM companies WHERE "isActive" = TRUE AND cik IS NOT NULL ORDER BY ticker'
        )
    return [{"id": r[0], "ticker": r[1], "cik": r[2], "sector": r[3], "currency": r[4]} for r in cur.fetchall()]


session = requests.Session()
session.headers.update(EDGAR_HEADERS)

CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache", "companyfacts")

# True quando o último fetch foi à rede (cache miss) — o loop principal só
# dorme SLEEP_BETWEEN nesses casos; com cache quente a re-ingestão é local.
last_fetch_was_network = False


def fetch_edgar_facts(cik: str, refresh: bool = False) -> dict | None:
    global last_fetch_was_network
    padded = cik.zfill(10)
    cache_path = os.path.join(CACHE_DIR, f"CIK{padded}.json.gz")
    if not refresh and os.path.exists(cache_path):
        try:
            with gzip.open(cache_path, "rt", encoding="utf-8") as f:
                data = json.load(f)
            last_fetch_was_network = False
            return data
        except Exception:
            pass  # cache corrompida → refetch normal
    last_fetch_was_network = True
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
        data = r.json()
        try:
            os.makedirs(CACHE_DIR, exist_ok=True)
            with gzip.open(cache_path, "wt", encoding="utf-8") as f:
                json.dump(data, f)
        except Exception:
            pass  # cache é otimização; falhar a escrita nunca é fatal
        return data
    except Exception as e:
        print(f"    EDGAR error: {e}")
        return None


def extract_tag_entries(us_gaap: dict, tag: str) -> list[dict]:
    node = us_gaap.get(tag)
    if not node:
        return []
        
    units = node.get("units") or {}

    # Priorizar extração de valores monetários (fiat) corretos
    for currency in VALID_CURRENCIES:
        if currency in units:
            unit_entries = units[currency]
            if isinstance(unit_entries, list):
                return [e for e in unit_entries if "14A" not in (e.get("form") or "")]
                
    # Fallback para métricas não monetárias (ex: shares, pure)
    for unit_entries in units.values():
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


def best_for_period(entries: list[dict], expected_end: str, prefer_annual_form: bool = False,
                    prefer_max_scale: bool = True) -> float | None:
    matches = [e for e in entries if e.get("end") == expected_end]
    if not matches:
        return None
    if prefer_annual_form:
        # Um facto de período anual deve vir do relatório anual. 10-Qs posteriores
        # por vezes mis-datam durações comparativas (ex.: FIX Q1-2026 tagga Revenues
        # $1.83B com start/end anuais 2025) e, sendo mais recentes, venceriam o 10-K.
        annual_forms = [e for e in matches if (e.get("form") or "").startswith(("10-K", "20-F", "40-F"))]
        if annual_forms:
            matches = annual_forms
    matches.sort(key=lambda e: e.get("filed") or "", reverse=True)
    val = matches[0].get("val")
    # Guard de unidades: alguns filings tagham o mesmo facto em milhares/milhões
    # (ex.: ANET NetIncomeLoss "841" vs "841000000" com o mesmo period end).
    # Restatements legítimos nunca divergem 100x; bugs de escala são 1000x+.
    # Nesses casos, preferir o match de maior magnitude em vez do mais recente.
    # SÓ para campos monetários (prefer_max_scale=True): em campos per-share o
    # maior é quase sempre o errado (ICE 2016: EPS taggado "120000000" no 10-Q
    # original vs 0.62 nos filings seguintes) — aí fica o mais recente.
    if prefer_max_scale:
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

                val = best_for_period(pool, expected_end, prefer_annual_form=(fp == "FY"),
                                      prefer_max_scale=(field not in ("epsDiluted", "dividendPerShare")))
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
                pairs = list(zip(tags, candidates))
                # Excise taxes: em tabaco/combustíveis o guard de magnitude escolheria
                # o revenue COM excise (ex.: PM $80.7B "IncludingAssessedTax" vs
                # $31.8B net). Quando a variante Excluding existe, é o net revenue —
                # descartar a Including e qualquer tag que seja ≈ net + excise.
                excl = next(
                    (v for t, v in pairs
                     if t == "RevenueFromContractWithCustomerExcludingAssessedTax" and v is not None),
                    None,
                )
                cleaned = []
                if excl is not None:
                    excise_entries = extract_tag_entries(us_gaap, "ExciseAndSalesTaxes")
                    if fp == "FY":
                        epool = [e for e in excise_entries if is_annual_duration(e)]
                    else:
                        epool = [e for e in excise_entries if is_quarterly_duration(e)]
                    excise = best_for_period(epool, expected_end, prefer_annual_form=(fp == "FY"))
                    for t, v in pairs:
                        if v is None:
                            continue
                        if t == "RevenueFromContractWithCustomerIncludingAssessedTax":
                            continue
                        if excise and v > excl and abs(v - (excl + excise)) <= 0.05 * abs(v):
                            continue  # gross de excise via outra tag (ex.: PM SalesRevenueNet)
                        cleaned.append(v)
                else:
                    cleaned = [v for _, v in pairs if v is not None]
                if cleaned:
                    max_abs = max(abs(v) for v in cleaned)
                    for v in cleaned:
                        if abs(v) >= 0.5 * max_abs:
                            dur_map[(fy, fp)][field] = v
                            break

    # IFRS Fallback para SG&A (Sales & Marketing + Administrative)
    for (fy, fp) in periods:
        if "sellingGeneralAndAdmin" not in dur_map[(fy, fp)]:
            expected_end = period_ends.get((fy, fp))
            if expected_end:
                pool_sales = extract_tag_entries(us_gaap, "SalesAndMarketingExpense")
                pool_admin = extract_tag_entries(us_gaap, "AdministrativeExpense")
                
                if fp == "FY":
                    pool_s = [e for e in pool_sales if is_annual_duration(e)]
                    pool_a = [e for e in pool_admin if is_annual_duration(e)]
                else:
                    pool_s = [e for e in pool_sales if is_quarterly_duration(e)]
                    pool_a = [e for e in pool_admin if is_quarterly_duration(e)]
                    
                val_s = best_for_period(pool_s, expected_end, prefer_annual_form=(fp == "FY"))
                val_a = best_for_period(pool_a, expected_end, prefer_annual_form=(fp == "FY"))
                
                if val_s is not None or val_a is not None:
                    dur_map[(fy, fp)]["sellingGeneralAndAdmin"] = (val_s or 0) + (val_a or 0)

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
                val = best_for_period(entries, expected_end, prefer_annual_form=(fp == "FY"))
                if val is not None:
                    inst_map[(fy, fp)][field] = val
                    if field == "cash":
                        # build_row precisa de saber QUAL tag deu o caixa: o
                        # tag largo dos bancos (CashCashEquivalentsRestricted…)
                        # JÁ inclui os depósitos remunerados — somar ibd por
                        # cima duplicaria (JPM: 469B → 915B).
                        inst_map[(fy, fp)]["cash_tag"] = tag
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
    for tag in ["Assets", "NetIncomeLoss", "ProfitLoss", "Revenues", "Revenue", "StockholdersEquity", "Equity"]:
        entries = extract_tag_entries(us_gaap, tag)
        matches = [e for e in entries if e.get("fy") == fy and e.get("fp") == fp]
        if matches:
            if tag in ["NetIncomeLoss", "ProfitLoss", "Revenues", "Revenue"]:
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


# ── Evidência ao nível da empresa (política evidência-de-ausência) ───────────
# Um facto de cash flow serve como PROVA de que a empresa paga dividendos —
# nunca como valor a gravar (lição do auto-healer: não cruzar os três mapas).
import re as _re

_DIVIDEND_EVIDENCE = _re.compile(r"Dividend")
# Excluir: dividendos recebidos/income (investing), NCI/preferred (não são a
# common), e assumptions de option pricing (ExpectedDividend/Rate/Yield).
_DIVIDEND_EXCLUDE = _re.compile(
    r"Received|Income|Restriction|MinorityInterest|Noncontrolling|Preferred|"
    r"ExpectedDividend|DividendRate|Yield"
)
_RND_EVIDENCE = _re.compile(r"ResearchAndDevelopment")
# Excluir IPR&D de aquisições (intangível de balanço, não a linha de despesa).
_RND_EXCLUDE = _re.compile(r"InProcess|Asset|Intangible|Capitali[sz]ed|Arrangement")


# Tags cuja mera presença histórica prova que a empresa carrega dívida de
# longo prazo (guard JPM-class: os grandes bancos deixaram de taggar LT debt
# sem dimensões ~2014 — a API companyfacts descarta factos dimensionados).
_LTD_EVIDENCE_TAGS = (
    "LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations",
)


def compute_company_evidence(facts_json: dict) -> dict:
    """Varre TODO o companyfacts (us-gaap + ifrs-full) e devolve flags binárias:
    - is_dividend_payer: existe qualquer facto de dividendos a common > 0
    - has_rnd_ever: a empresa alguma vez reportou uma linha de R&D
    - has_ltd_ever: a empresa alguma vez taggou dívida de longo prazo
    Errar para o lado do True é seguro: True ⇒ campo em falta fica NULL (N/A),
    nunca um zero/total fabricado."""
    payer = False
    has_rnd = False
    has_ltd = False
    facts = (facts_json or {}).get("facts") or {}
    for ns_name in ("us-gaap", "ifrs-full"):
        ns = facts.get(ns_name) or {}
        for tag, node in ns.items():
            if not payer and _DIVIDEND_EVIDENCE.search(tag) and not _DIVIDEND_EXCLUDE.search(tag):
                for entries in (node.get("units") or {}).values():
                    if isinstance(entries, list) and any(
                        isinstance(e.get("val"), (int, float)) and e["val"] > 0 for e in entries
                    ):
                        payer = True
                        break
            if not has_rnd and _RND_EVIDENCE.search(tag) and not _RND_EXCLUDE.search(tag):
                units = node.get("units") or {}
                if any(isinstance(v, list) and v for v in units.values()):
                    has_rnd = True
            if not has_ltd and tag in _LTD_EVIDENCE_TAGS:
                units = node.get("units") or {}
                if any(isinstance(v, list) and any(
                        isinstance(e.get("val"), (int, float)) and e["val"] > 0 for e in v)
                       for v in units.values()):
                    has_ltd = True
            if payer and has_rnd and has_ltd:
                return {"is_dividend_payer": True, "has_rnd_ever": True, "has_ltd_ever": True}
    return {"is_dividend_payer": payer, "has_rnd_ever": has_rnd, "has_ltd_ever": has_ltd}



def build_row(company_id: str, fy: int, fp: str, period_end: str, filed_at: str | None,
              dur: dict, inst: dict, sector: str | None = None,
              evidence: dict | None = None) -> dict:
    # evidence = compute_company_evidence(facts): flags binárias da empresa
    # inteira que decidem se um DPS/R&D em falta é um verdadeiro zero (empresa
    # nunca pagou/reportou) ou um buraco de extração que DEVE ficar NULL.
    evidence = evidence or {"is_dividend_payer": True, "has_rnd_ever": True,
                            "has_ltd_ever": False}
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

    if eps_g is None and ni_g is not None and shares is not None and shares > 0:
        derived_eps = ni_g / shares
        # Plausibilidade (como na síntese Q4): Decimal(10,4) rebenta acima de
        # 999.999,9999 — um shares em unidades erradas nunca pode matar o insert.
        if shares >= 100_000 and abs(derived_eps) < 100_000:
            eps_g = derived_eps
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

    # Universal Accounting Identities
    if op_income is None and gross_profit is not None and op_expenses is not None:
        op_income = gross_profit - op_expenses
        
    if gross_profit is None and op_income is not None and op_expenses is not None:
        gross_profit = op_income + op_expenses
        if revenue is not None and gross_profit > revenue:
            gross_profit = revenue

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
            # Guard JPM-class: se a empresa JÁ taggou dívida LT nalgum período
            # mas não neste (bancos modernos só a tagham dimensionada, que a
            # API descarta), somar só o curto prazo daria um "total" 8× errado
            # (JPM: $52.9B de ST vs $463B reais). Antes NULL que errado.
            if ltd_nc is None and ltd_c is None and evidence.get("has_ltd_ever"):
                total_debt = None
            else:
                total_debt = (ltd_nc or 0) + (ltd_c or 0) + (st or 0)
    if total_debt is None:
        # Nível 2: valor de face da dívida emitida (empresas sem tags de componentes, ex: META)
        total_debt = inst.get("debtInstrumentCarryingAmount")
    if total_debt is None:
        # Nível 3: dívida secured + unsecured (REITs reportam assim em vez de current/noncurrent)
        secured = inst.get("securedDebt")
        unsecured = inst.get("unsecuredDebt")
        if secured is not None or unsecured is not None:
            total_debt = (secured or 0) + (unsecured or 0)

    cash = inst.get("cash")
    if cash is not None:
        marketable = inst.get("marketableSecuritiesCurrent") or 0
        cash = cash + marketable

    # Bancos: caixa = cash & due from banks + depósitos remunerados detidos
    # noutros bancos (ativo). SÓ quando o caixa veio do tag estreito
    # CashAndDueFromBanks — o tag largo (CashCashEquivalentsRestricted…) já
    # inclui estes depósitos e somar duplicaria (JPM: 469B → 915B).
    if sector == "Financials" and inst.get("cash_tag") == "CashAndDueFromBanks":
        ibd = inst.get("interestBearingDeposits")
        if ibd is not None:
            cash = (cash or 0) + ibd

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
    elif sector == "Financials":
        # EBITDA não tem significado económico para bancos/seguradoras (juros
        # SÃO o negócio, não um custo de financiamento a excluir). Sintetizá-lo
        # produzia um número que nenhum analista usaria → NULL estrutural,
        # whitelisted como SECTOR_NO_EBITDA_BANK; a UI esconde o card.
        ebitda = None
    else:
        da = dur.get("depreciationAndAmortization") or 0
        interest_exp = dur.get("interestExpense")
        if net_income is not None and tax_expense is not None and interest_exp is not None:
            ebitda = net_income + tax_expense + interest_exp + da
        elif op_income is not None:
            ebitda = op_income + da
        else:
            ebitda = None

    # Guard: alguns filings tagham DPS em unidades erradas (ex.: STX "2770000"
    # em vez de 2.77 — milionésimos). Nenhuma empresa do S&P 500 paga >$1000/ação;
    # valores acima disso são bugs de escala (reduzir 1000x até plausível, senão N/A).
    dps = dur.get("dividendPerShare")
    if dps is None:
        # Política evidência-de-ausência (fim do "paradoxo da Apple"):
        #  - não-payer verificado (zero factos de dividendos em TODO o
        #    companyfacts) → 0.0 é a verdade;
        #  - payer com período em falta → NULL (N/A). Forçar 0.0 aqui
        #    mascarava buracos de extração como "não paga dividendos".
        dps = None if evidence["is_dividend_payer"] else 0.0
    else:
        for _ in range(3):
            if abs(dps) <= 1000:
                break
            dps /= 1000
        if abs(dps) > 1000:
            dps = None if evidence["is_dividend_payer"] else 0.0
        # Guard: dividendos são SEMPRE não-negativos. Um valor negativo é sempre
        # um bug de ingestão (ex: subtração errada de acumulado anual). Rejeitar.
        if dps is not None and dps < 0:
            dps = None

    if fp == "FY":
        period_type = "ANNUAL"
        fiscal_quarter = None
    else:
        period_type = "QUARTERLY"
        fiscal_quarter = int(fp[1]) if fp.startswith("Q") else None


    # --- POLÍTICA EVIDÊNCIA-DE-AUSÊNCIA (R&D) ---
    # 0.0 só quando a empresa NUNCA reportou linha de R&D em filing nenhum
    # (mídia, bancos, retalho…). Se já reportou e este período falha → NULL:
    # forçar 0.0 mascarava buracos de extração como "não tem R&D".
    if dur.get("researchAndDevelopment") is None and not evidence["has_rnd_ever"]:
        dur["researchAndDevelopment"] = 0.0

    # --- SECTOR SPECIFIC FALLBACKS ---
    if sector == "Financials":
        if capex is None:
            # Estrutural: bancos/seguradoras não têm capex material; por
            # convenção FCF = OCF (card de FCF é escondido na UI de bancos).
            capex = 0.0
            if op_cf is not None:
                fcf = op_cf
        # NOTA: a antiga fabricação "grossProfit = revenue" foi removida —
        # margem bruta de 100% em bancos era um número inventado. COGS/gross
        # profit ficam NULL estrutural (whitelist SECTOR_NO_COGS, UI esconde).
        if op_income is None:
            if net_income is not None:
                tax = tax_expense or 0.0
                op_income = net_income + tax
            elif revenue is not None and op_expenses is not None:
                op_income = revenue - op_expenses
        if dur.get("sellingGeneralAndAdmin") is None and op_expenses is not None:
            dur["sellingGeneralAndAdmin"] = op_expenses

    if sector == "Real Estate":
        if capex is None:
            capex = 0.0
            if op_cf is not None:
                fcf = op_cf
        if dur.get("operatingExpenses") is None and dur.get("sellingGeneralAndAdmin") is not None:
            op_expenses = dur.get("sellingGeneralAndAdmin")

    if sector == "Utilities":
        if dur.get("sellingGeneralAndAdmin") is None and op_expenses is not None:
            dur["sellingGeneralAndAdmin"] = op_expenses

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
        "epsDiluted": eps_g,
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
        "dividendPerShare": dps,
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

# ── FX: taxas de referência do BCE via Frankfurter (sem key, sem ToS Yahoo) ──
# https://api.frankfurter.dev — diário desde 1999, EUR/GBP/CHF/DKK/SEK/NOK/JPY…
# Pedidos por ano-civil (ranges longos vêm re-amostrados semanalmente) com
# cache em disco; anos passados são imutáveis → cache eterna.
FX_API_BASE = "https://api.frankfurter.dev/v1"
FX_CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache", "fx")
FX_SERIES_START_YEAR = 2014  # HISTORY_YEARS=10 → períodos desde ~2015/16; folga de 1-2 anos
_fx_series_memo: dict[str, tuple[list[str], list[float]]] = {}


def _fetch_fx_year(currency: str, year: int) -> dict:
    """Taxas diárias {iso_date: rate} de 1 ano-civil, com cache em disco."""
    today = datetime.date.today()
    path = os.path.join(FX_CACHE_DIR, f"{currency}USD_{year}.json")
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            is_past_year = year < today.year
            fresh_enough = data and max(data) >= (today - datetime.timedelta(days=7)).isoformat()
            if is_past_year or fresh_enough:
                return data
        except Exception:
            pass
    end = min(datetime.date(year, 12, 31), today).isoformat()
    url = f"{FX_API_BASE}/{year}-01-01..{end}?base={currency}&symbols=USD"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    rates = {d: v["USD"] for d, v in (r.json().get("rates") or {}).items() if v.get("USD")}
    os.makedirs(FX_CACHE_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rates, f)
    return rates


def get_fx_series(currency: str) -> tuple[list[str], list[float]]:
    """Série completa (datas ordenadas, taxas) de FX_SERIES_START_YEAR até hoje."""
    if currency in _fx_series_memo:
        return _fx_series_memo[currency]
    merged: dict = {}
    for year in range(FX_SERIES_START_YEAR, datetime.date.today().year + 1):
        merged.update(_fetch_fx_year(currency, year))
    dates = sorted(merged)
    rates = [merged[d] for d in dates]
    # BCE publica só dias úteis; gaps > ~10 dias indicam série incompleta.
    for a, b in zip(dates, dates[1:]):
        gap = (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days
        if gap > 10:
            print(f"    Aviso FX: gap de {gap} dias na série {currency}USD ({a} → {b})")
    _fx_series_memo[currency] = (dates, rates)
    return dates, rates


def apply_fx_conversion(company_currency: str, periods_data: list[dict]) -> bool:
    """Converte os campos monetários para USD à taxa BCE mais próxima anterior
    ao periodEnd. Devolve True em sucesso; False em falha — e nesse caso o
    caller NÃO PODE gravar as rows (a GSK ficou meses em GBP cru precisamente
    porque a falha era silenciosa e as rows iam para a BD na mesma)."""
    if not company_currency or company_currency == "USD":
        return True
    try:
        dates, rates = get_fx_series(company_currency)
        if not dates:
            print(f"    Erro FX: série vazia para {company_currency}USD")
            return False

        def get_rate(period_end) -> float:
            iso = period_end if isinstance(period_end, str) else period_end.isoformat()
            i = bisect.bisect_right(dates, iso) - 1
            return rates[max(i, 0)]

        monetary_fields = [
            "revenue", "costOfRevenue", "grossProfit", "operatingExpenses",
            "operatingIncome", "interestExpense", "taxExpense", "netIncome",
            "epsDiluted", "operatingCashFlow", "capex", "freeCashFlow",
            "totalAssets", "totalCurrentLiab", "longTermDebt", "totalDebt",
            "cash", "totalEquity", "dividendPerShare", "researchAndDevelopment",
            "sellingGeneralAndAdmin", "ebitda"
        ]

        for p in periods_data:
            if not p.get('periodEnd'):
                continue
            rate = get_rate(p['periodEnd'])
            for field in monetary_fields:
                if p.get(field) is not None:
                    p[field] = float(p[field]) * rate

        return True
    except Exception as e:
        print(f"    Erro FX Frankfurter {company_currency}→USD: {e}")
        return False



def apply_stock_splits(ticker: str, periods_data: list[dict]):
    periods_data.sort(key=lambda x: x['periodEnd'])
    try:
        t = yf.Ticker(ticker)
        splits = t.splits
    except Exception as e:
        print(f"    Erro ao extrair splits do yfinance para {ticker}: {e}")
        return
        
    if splits.empty:
        return
        
    for split_date, ratio in splits.items():
        try:
            # Em versões recentes, split_date pode ser timestamp tz-aware
            split_date_only = split_date.date()
        except:
            split_date_only = split_date
            
        if ratio == 1.0 or ratio == 0.0:
            continue
            
        reference_shares = None
        for p in periods_data:
            p_date = datetime.date.fromisoformat(p['periodEnd']) if isinstance(p['periodEnd'], str) else p['periodEnd']
            if p_date >= split_date_only and p.get('sharesOutstanding'):
                reference_shares = p['sharesOutstanding']
                break
                
        if not reference_shares:
            continue
            
        for p in periods_data:
            p_date = datetime.date.fromisoformat(p['periodEnd']) if isinstance(p['periodEnd'], str) else p['periodEnd']
            if p_date < split_date_only:
                shares = p.get('sharesOutstanding')
                if not shares:
                    continue
                    
                needs_adjustment = False
                if ratio > 1:
                    threshold = reference_shares / (ratio * 0.7)
                    if shares < threshold:
                        needs_adjustment = True
                else:
                    threshold = reference_shares / (ratio * 1.3)
                    if shares > threshold:
                        needs_adjustment = True
                        
                if needs_adjustment:
                    p['sharesOutstanding'] = shares * ratio
                    if p.get('epsDiluted'): p['epsDiluted'] /= ratio
                    if p.get('epsBasic'): p['epsBasic'] /= ratio
                    if p.get('dividendPerShare'): p['dividendPerShare'] /= ratio
                    
def insert_fundamental(cur, row: dict):
    cur.execute(
        """
        INSERT INTO fundamentals (
            id, "companyId", "periodType", "fiscalYear", "fiscalQuarter",
            "periodEnd", "filedAt",
            "revenue", "costOfRevenue", "grossProfit", "operatingExpenses",
            "operatingIncome", "interestExpense", "taxExpense",
            "netIncome", "epsDiluted", "sharesOutstanding",
            "operatingCashFlow", "capex", "freeCashFlow",
            "totalAssets", "totalCurrentLiab", "longTermDebt", "totalDebt",
            "cash", "totalEquity",
            "grossMargin", "operatingMargin", "netMargin", "roic", "returnOnEquity",
            "dividendPerShare", "researchAndDevelopment", "sellingGeneralAndAdmin", "ebitda",
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


def derive_q4_dps(fy_dps: float, q_dps: list[float]) -> float | None:
    """Q4 DPS = FY − ΣQ1..3, com alinhamento de base de split.

    O "paradoxo da Apple": 10-Ks pós-split retaggam o DPS ANUAL histórico já
    ajustado (AAPL FY2019 = 0.75 pós-split 4:1), mas os trimestres só existem
    nos 10-Qs originais pré-split (0.73+0.73+0.77 = 2.23). Subtrair bases
    mistas dava −1.48, que o código antigo mascarava com 0.0 — a origem dos
    "buracos" Q4 de DPS da AAPL/ABBV.

    Testa fatores de split comuns e devolve o Q4 NA BASE DO FY — a mesma base
    das shares/EPS que a row Q4 sintética herda do FY, mantendo a coerência
    per-período de que o apply_stock_splits depende."""
    qsum = sum(q_dps)
    if qsum <= 0:
        return None
    for f in (1, 2, 3, 4, 5, 6, 7, 10, 20, 0.5, 1 / 3, 0.25, 0.1):
        ratio = (fy_dps * f) / qsum
        if 1.05 <= ratio <= 2.5:  # com base alinhada, FY ≈ 4/3 × ΣQ1..3
            q4 = fy_dps - qsum / f
            if q4 >= 0:
                return q4
    return None  # bases irreconciliáveis (ex.: dividendo especial) → N/A


def synthesize_q4(periods: set, period_ends: dict, period_filed: dict,
                  dur_map: dict, inst_map: dict) -> list[int]:
    """Sintetiza Q4 standalone: o EDGAR raramente o tagga (as empresas reportam
    FY, e Q4 = FY − Q1 − Q2 − Q3). Campo a campo: valores já extraídos do EDGAR
    ficam; só os em falta são derivados. Balanço do Q4 = balanço do FY (mesmo
    period end); shares = weighted avg do FY; eps = NI/shares.

    Guard de mismatch de base: em spin-offs (MMM/Solventum, IBM/Kyndryl) o FY
    mais recente é restated para continuing operations mas os quarters antigos
    são os originais → o Q4 derivado seria lixo (revenue ~0 com margens
    absurdas). Detetável porque o revenue Q4 derivado colapsa (<20% do Q3) sem
    o Q3 ter colapsado. Nesses anos não se sintetiza nada.

    Devolve os fiscal years cujo Q4 deve ser APAGADO da BD (anos sem síntese
    válida — remove restos de backfills manuais sobre bases erradas)."""
    SUBTRACTIVE = [
        "revenue", "costOfRevenue", "grossProfit", "operatingExpenses",
        "operatingIncome", "interestExpense", "taxExpense", "netIncome",
        "operatingCashFlow", "capex", "researchAndDevelopment",
        "sellingGeneralAndAdmin", "ebitda", "depreciationAndAmortization",
    ]
    drop_years: list[int] = []
    fy_years = sorted({fy for (fy, fp) in periods if fp == "FY"})
    for fy in fy_years:
        q4_key = (fy, "Q4")
        qs = [(fy, "Q1"), (fy, "Q2"), (fy, "Q3")]
        if not all(q in periods for q in qs):
            if q4_key not in periods:
                drop_years.append(fy)  # sem quarters não há síntese; limpar Q4 órfão
            continue

        fy_dur = dur_map.get((fy, "FY")) or {}
        q_durs = [dur_map.get(q) or {} for q in qs]
        existing = dur_map.get(q4_key) or {}

        derived: dict = {}
        for field in SUBTRACTIVE:
            if existing.get(field) is not None:
                continue  # extração EDGAR é fonte de verdade
            fv = fy_dur.get(field)
            vals = [d.get(field) for d in q_durs]
            if fv is None or any(v is None for v in vals):
                continue
            # Per-share: FY pode vir retaggado pós-split e os quarters não —
            # subtração direta de bases mistas é o bug do "paradoxo da Apple".
            if field == "dividendPerShare":
                q4_dps = derive_q4_dps(fv, vals)
                if q4_dps is not None:
                    derived[field] = q4_dps
                continue
            val = fv - sum(vals)
            # capex é "sempre positivo" por convenção; derivado negativo
            # significa capex FY em falta/tag errada (REITs) — o abs() do
            # build_row transformá-lo-ia em lixo positivo. Fica NULL (N/A).
            if field == "capex" and val < 0:
                continue
            derived[field] = val

        rev_synth = derived.get("revenue")
        rev_q3 = q_durs[2].get("revenue")
        base_mismatch = rev_synth is not None and (
            rev_synth < 0
            or (rev_q3 is not None and rev_q3 > 0 and rev_synth < 0.2 * rev_q3)
        )
        if base_mismatch:
            if q4_key not in periods:
                drop_years.append(fy)
            continue

        if not derived:
            if q4_key not in periods:
                drop_years.append(fy)
            continue

        periods.add(q4_key)
        if not period_ends.get(q4_key):
            period_ends[q4_key] = period_ends.get((fy, "FY"))
        if not period_filed.get(q4_key):
            period_filed[q4_key] = period_filed.get((fy, "FY"))
        dur_map.setdefault(q4_key, {}).update(derived)
        inst_map.setdefault(q4_key, {})

        q4_dur = dur_map[q4_key]
        if q4_dur.get("sharesOutstandingDur") is None:
            sh = fy_dur.get("sharesOutstandingDur")
            # As shares do fy_dur são pré-guard e podem vir na escala errada
            # (MCD tagga em milhões: 732.3). O guard NI/EPS do build_row não
            # salva o Q4: o eps derivado abaixo ficaria auto-consistente com
            # as shares erradas. Validar aqui contra NI/EPS do próprio FY.
            fy_ni = fy_dur.get("netIncome")
            fy_eps = fy_dur.get("epsDiluted")
            if fy_ni is not None and fy_eps and abs(fy_eps) >= 0.5:
                implied = fy_ni / fy_eps
                if implied >= 1_000_000 and (
                    sh is None or sh / implied > 5 or sh / implied < 0.2
                ):
                    sh = implied
            if sh is not None:
                q4_dur["sharesOutstandingDur"] = sh
        if q4_dur.get("epsDiluted") is None:
            ni = q4_dur.get("netIncome")
            sh = q4_dur.get("sharesOutstandingDur")
            # >= 100k ações (plausibilidade, como no build_row) e eps dentro
            # do Decimal(10,4) — nunca deixar um overflow matar o insert.
            if ni is not None and sh and sh >= 100_000 and abs(ni / sh) < 100_000:
                q4_dur["epsDiluted"] = ni / sh

        for k, v in (inst_map.get((fy, "FY")) or {}).items():
            inst_map[q4_key].setdefault(k, v)

    return drop_years


def dei_shares_near(dei: dict, period_end: str | None) -> float | None:
    """Último recurso para shares outstanding: o facto da cover page
    (dei:EntityCommonStockSharesOutstanding), point-in-time datado tipicamente
    semanas após o period end. Aceita o registo mais próximo em
    [period_end, period_end+100d]; recusa se houver valores DISTINTOS na mesma
    data (multi-classe colapsada — somar às cegas seria errado)."""
    if not period_end or not dei:
        return None
    node = dei.get("EntityCommonStockSharesOutstanding")
    if not node:
        return None
    limit = (datetime.date.fromisoformat(period_end) + datetime.timedelta(days=100)).isoformat()
    best_date = None
    best_vals: set = set()
    for entries in (node.get("units") or {}).values():
        if not isinstance(entries, list):
            continue
        for e in entries:
            d, v = e.get("end"), e.get("val")
            if not d or v is None or d < period_end or d > limit:
                continue
            if best_date is None or d < best_date:
                best_date, best_vals = d, {v}
            elif d == best_date:
                best_vals.add(v)
    if best_date is None or len(best_vals) != 1:
        return None
    val = float(next(iter(best_vals)))
    return val if val >= 100_000 else None


def process_company(conn, company: dict, dry_run: bool = False,
                    collector: dict | None = None) -> int:
    company_id = company["id"]
    cik = company["cik"]

    facts_json = fetch_edgar_facts(cik, refresh=REFRESH_CACHE)
    if not facts_json:
        return 0

    facts = facts_json.get("facts") or {}
    namespace = facts.get("us-gaap") or facts.get("ifrs-full") or {}
    if not namespace:
        return 0

    dei_ns = facts.get("dei") or {}
    evidence = compute_company_evidence(facts_json)

    min_fy = datetime.date.today().year - HISTORY_YEARS
    periods: set = set()

    # Descobrir todos os (fy, fp) disponíveis nos últimos 10 anos
    for sample_tags in [["NetIncomeLoss", "ProfitLoss", "Assets", "Revenues", "Revenue"]]:
        for tag in sample_tags:
            for e in extract_tag_entries(namespace, tag):
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
        p_end, p_filed = get_period_info(namespace, fy, fp)
        period_ends[(fy, fp)] = p_end
        period_filed[(fy, fp)] = p_filed

    dur_map, inst_map = extract_all_metrics(namespace, periods_list, period_ends)

    # Q4 sintético (FY − Q1−Q2−Q3) + anos cujo Q4 existente na BD deve ser limpo
    drop_q4_years = synthesize_q4(periods, period_ends, period_filed, dur_map, inst_map)
    periods_list = sorted(periods)

    rows = []
    for (fy, fp) in periods_list:
        period_end = period_ends.get((fy, fp))
        filed_at = period_filed.get((fy, fp))
        if not period_end:
            continue

        dur = dur_map.get((fy, fp)) or {}
        inst = inst_map.get((fy, fp)) or {}
        if not dur and not inst:
            continue

        # Último recurso para shares: cover page (dei). Point-in-time real —
        # para market cap é até MAIS correto que a weighted average em falta.
        if dur.get("sharesOutstandingDur") is None and inst.get("sharesOutstandingInst") is None:
            dei_val = dei_shares_near(dei_ns, period_end)
            if dei_val is not None:
                inst["sharesOutstandingInst"] = dei_val

        rows.append(build_row(company_id, fy, fp, period_end, filed_at, dur, inst,
                              company.get('sector'), evidence))

    ticker = company.get('ticker')
    
    # Inferir a moeda de reporte diretamente do XBRL em vez de confiar no Ticker (que pode ser USD no NYSE)
    reporting_currency = "USD"
    core_tag = namespace.get("NetIncomeLoss") or namespace.get("ProfitLoss") or namespace.get("Assets") or namespace.get("Revenues") or namespace.get("Revenue")
    if core_tag:
        core_units = core_tag.get("units") or {}
        for curr in VALID_CURRENCIES:
            if curr in core_units:
                reporting_currency = curr
                break
                
    fx_applied = False
    if reporting_currency != 'USD':
        if not apply_fx_conversion(reporting_currency, rows):
            # NUNCA gravar rows não convertidas: a GSK ficou em GBP cru porque
            # esta falha era silenciosa e as rows entravam na BD na mesma.
            print(f"FX {reporting_currency}→USD falhou — empresa saltada (nada gravado)", end=" ")
            return 0
        fx_applied = True
        for row in rows:
            row["currency"] = "USD"
        if not dry_run:
            try:
                with conn.cursor() as cur:
                    cur.execute('UPDATE companies SET currency = %s WHERE id = %s', ('USD', company_id))
                conn.commit()
            except Exception:
                conn.rollback()

    if ticker:
        apply_stock_splits(ticker, rows)

    if dry_run:
        if collector is not None:
            collector[ticker] = {
                "cik": cik,
                "sector": company.get("sector"),
                "reporting_currency": reporting_currency,
                "fx_applied": fx_applied,
                "evidence": evidence,
                "drop_q4_years": sorted(drop_q4_years),
                "rows": [{k: v for k, v in row.items() if k != "id"} for row in rows],
            }
        return len(rows)

    # Commit único por empresa (~40 períodos): contra Supabase remoto, o commit
    # por período dominava o tempo de execução (~3 round-trips × ~100ms cada).
    inserted = 0
    try:
        with conn.cursor() as cur:
            for fy in drop_q4_years:
                delete_period(cur, company_id, "QUARTERLY", fy, 4)
            for row in rows:
                delete_period(cur, company_id, row["periodType"], row["fiscalYear"], row["fiscalQuarter"])
                insert_fundamental(cur, row)
        conn.commit()
        inserted = len(rows)
    except Exception as e:
        conn.rollback()
        print(f"    DB error (batch): {e} — fallback período a período")
        try:
            with conn.cursor() as cur:
                for fy in drop_q4_years:
                    delete_period(cur, company_id, "QUARTERLY", fy, 4)
            conn.commit()
        except Exception:
            conn.rollback()
        for row in rows:
            try:
                with conn.cursor() as cur:
                    delete_period(cur, company_id, row["periodType"], row["fiscalYear"], row["fiscalQuarter"])
                    insert_fundamental(cur, row)
                conn.commit()
                inserted += 1
            except Exception as e2:
                conn.rollback()
                print(f"    DB error {row['fiscalYear']}/{row['fiscalQuarter']}: {e2}")

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


# Classes B/C sem CIK próprio na BD (o schema tem cik @unique e a SEC mapeia
# ambos os tickers para o mesmo filer). Os fundamentals são os da empresa —
# copiar do ticker primário após cada ingestão.
DUAL_CLASS_SIBLINGS = {
    "GOOG": "GOOGL",
    "FOX": "FOXA",
    "NWS": "NWSA",
}


def sync_dual_class(conn):
    print("\nSincronizar classes duplas (fundamentals do ticker primário):")
    for sibling, primary in DUAL_CLASS_SIBLINGS.items():
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM companies WHERE ticker = %s", (sibling,))
                s = cur.fetchone()
                cur.execute("SELECT id FROM companies WHERE ticker = %s", (primary,))
                p = cur.fetchone()
                if not s or not p:
                    print(f"  {sibling} ← {primary}: par não encontrado, ignorado")
                    continue
                cur.execute('DELETE FROM fundamentals WHERE "companyId" = %s', (s[0],))
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
                    )
                    SELECT
                        replace(gen_random_uuid()::text, '-', ''), %s, "periodType", "fiscalYear", "fiscalQuarter",
                        "periodEnd", "filedAt",
                        revenue, "costOfRevenue", "grossProfit", "operatingExpenses",
                        "operatingIncome", "interestExpense", "taxExpense",
                        "netIncome", "epsDiluted", "sharesOutstanding",
                        "operatingCashFlow", capex, "freeCashFlow",
                        "totalAssets", "totalCurrentLiab", "longTermDebt", "totalDebt",
                        cash, "totalEquity",
                        "grossMargin", "operatingMargin", "netMargin", roic, "returnOnEquity",
                        "dividendPerShare", "researchAndDevelopment", "sellingGeneralAndAdmin", ebitda,
                        NOW(), NOW()
                    FROM fundamentals WHERE "companyId" = %s
                    """,
                    (s[0], p[0]),
                )
                copied = cur.rowcount
                cur.execute(
                    'UPDATE companies SET "lastFundamentalsUpdate" = NOW(), "updatedAt" = NOW() WHERE id = %s',
                    (s[0],),
                )
            conn.commit()
            print(f"  {sibling} ← {primary}: {copied} períodos copiados")
        except Exception as e:
            conn.rollback()
            print(f"  {sibling} ← {primary}: ERRO {e}")


def main():
    # Uso: python ingest_fundamentals.py [--tickers AAPL,MSFT,...]
    #                                    [--dry-run out.json] [--refresh-cache]
    tickers = None
    if "--tickers" in sys.argv:
        idx = sys.argv.index("--tickers")
        if idx + 1 >= len(sys.argv):
            sys.exit("--tickers requer lista separada por vírgulas (ex: --tickers AAPL,AVB)")
        tickers = [t.strip().upper() for t in sys.argv[idx + 1].split(",") if t.strip()]

    # --dry-run PATH: extração + build_row + Q4 + FX + splits completos, ZERO
    # escritas na BD; as rows vão para um dump JSON que o diff_reingest.py
    # compara com a BD atual antes de qualquer re-ingestão a sério.
    dry_run_path = None
    if "--dry-run" in sys.argv:
        idx = sys.argv.index("--dry-run")
        if idx + 1 >= len(sys.argv):
            sys.exit("--dry-run requer o caminho do JSON de output")
        dry_run_path = sys.argv[idx + 1]

    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        companies = get_companies_with_cik(cur, tickers)

    total = len(companies)
    mode = "DRY-RUN (sem escritas)" if dry_run_path else "live"
    print(f"{total} empresas com CIK a processar [{mode}].")

    total_periods = 0
    errors = 0
    collector: dict = {}

    for i, company in enumerate(companies):
        ticker = company["ticker"]
        print(f"[{i+1}/{total}] {ticker}...", end=" ", flush=True)

        try:
            n = process_company(conn, company, dry_run=bool(dry_run_path), collector=collector)
            print(f"{n} períodos")
            total_periods += n
        except psycopg2.OperationalError:
            try:
                # Supabase drops idle connections after ~10 mins, reconnect and retry
                conn = psycopg2.connect(DIRECT_URL)
                conn.autocommit = False
                n = process_company(conn, company, dry_run=bool(dry_run_path), collector=collector)
                print(f"{n} períodos (reconectado)")
                total_periods += n
            except Exception as e2:
                print(f"ERRO na reconexão: {e2}")
                errors += 1
        except Exception as e:
            print(f"ERRO: {e}")
            errors += 1

        if last_fetch_was_network:
            time.sleep(SLEEP_BETWEEN)

    if dry_run_path:
        dump = {
            "meta": {
                "mode": "dry-run",
                "min_fy": datetime.date.today().year - HISTORY_YEARS,
                "history_years": HISTORY_YEARS,
                "fx_source": "frankfurter/ECB",
                "tickers_filter": tickers,
            },
            "companies": collector,
        }
        os.makedirs(os.path.dirname(os.path.abspath(dry_run_path)), exist_ok=True)
        with open(dry_run_path, "w", encoding="utf-8") as f:
            json.dump(dump, f, ensure_ascii=False, default=str)
        print(f"\nDry-run: {total_periods} períodos de {len(collector)} empresas em {dry_run_path}. "
              f"{errors} erros. Nada foi escrito na BD.")
        conn.close()
        return

    sync_dual_class(conn)

    conn.close()
    print(f"\nConcluído. {total_periods} períodos inseridos. {errors} erros.")


if __name__ == "__main__":
    main()
