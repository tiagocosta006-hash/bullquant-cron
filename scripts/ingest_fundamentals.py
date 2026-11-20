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
import math
import uuid
from collections import Counter, defaultdict
import requests
import psycopg2
from urllib.parse import urlparse
from psycopg2.extras import Json
from dotenv import load_dotenv
from notas_valores import aplicar_correcoes, notas_definicao, notas_reexpressao, gravar_notas
from validar_fundamentais import validar, relatorio as relatorio_validacao
import divida_balanco
import receita_impressa
import aplicacoes_balanco

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
EDGAR_HEADERS = {"User-Agent": os.getenv("SEC_USER_AGENT") or os.getenv("SEC_IDENTITY") or "BullValue admin@bullocracy.com"}  # contacto da SEC vem do ambiente
SLEEP_BETWEEN = 0.2
HISTORY_YEARS = 10
REFRESH_CACHE = "--refresh-cache" in sys.argv

# Moedas de reporte suportadas (ordem = prioridade de seleção de unidade).
# DKK/SEK/NOK: a NVO (DKK) ficou meses gravada em coroas cruas porque a lista
# antiga não as tinha — a inferência caía para "USD" e nada era convertido.
VALID_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "JPY", "AUD", "DKK", "SEK", "NOK"]

# Moeda de reporte da empresa EM PROCESSAMENTO (setada por process_company
# antes da extração). Dual-taggers (BCS: USD e GBP no mesmo node) precisam da
# moeda de reporte PRIMEIRO — USD-first global misturava moedas na mesma série.
_PREFERRED_CURRENCY: str | None = None

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
        # ── Aceites na revisão CFA 2026-07 (explain_holes; ver docs/audit) ──
        "FoodAndBeverageRevenue",             # CMG pré-ASC606 (2016)
        "RevenueFromContractsWithCustomers",  # IFRS 15 (BCS/NOK pré-rebrand)
        "RevenueFromSaleOfGoods",             # IFRS pharma (NVS/SNY pré-2018)
        "OilAndGasRevenue",                   # E&P (EQT/FANG)
        "GasGatheringTransportationMarketingAndProcessingRevenue",  # midstream (TRGP)
        "HealthCareOrganizationPatientServiceRevenueLessProvisionForBadDebts",  # DVA/HCA
        "HealthCareOrganizationPatientServiceRevenue",
        "RevenueMineralSales",                # mineração (NEM)
        # REJEITADOS (nunca adicionar): ProceedsFromSales* (investing inflow),
        # OtherRevenue/RevenueFromDividends/Interest/Royalties (componentes
        # parciais), RevenueAndOperatingIncome (semântica IFRS incerta),
        # *ProForma* (não são resultados reais).
    ],
    # As duas metades do custo de uma seguradora que também vende produtos,
    # extraídas à parte para poderem ser SOMADAS. A CVS tem 221,2 mM de custo
    # de produtos (farmácia) E 125,5 mM de sinistros (seguros): são custos de
    # segmentos diferentes, ambos acima da linha do lucro bruto. Ver o bloco
    # que os junta em build_row.
    #
    # O BenefitsLossesAndExpenses fica de FORA das duas listas de propósito:
    # é um agregado que já contém os sinistros (Humana: 127,0 contra 110,8) e
    # somá-lo duplicaria a mesma despesa.
    "policyholderClaims": [
        "PolicyholderBenefitsAndClaimsIncurredHealthCare",
        "PolicyholderBenefitsAndClaimsIncurredNet",
    ],
    "costOfProducts": [
        "CostOfGoodsAndServicesSold",
        "CostOfGoodsSold",
        "CostOfServices",
        "CostOfSales",
        "CostOfRevenue",
    ],
    "costOfRevenue": [
        # As seguradoras vêm PRIMEIRO, e de propósito. O custo de uma
        # seguradora de saúde são os encargos médicos — à volta de 75-85 % dos
        # prémios — e não uma linha de serviços. A Centene publica
        # PolicyholderBenefitsAndClaimsIncurredHealthCare (30,6 mil milhões em
        # 2016 contra 40,6 de receita, ou seja 25 % de margem bruta), mas a
        # lista só tinha a variante ...IncurredNet, que ela não usa. Caía-se no
        # CostOfGoodsAndServicesSold residual de 367 milhões e a plataforma
        # mostrava 95 % de margem bruta numa seguradora.
        #
        # Quem não é seguradora não publica estas etiquetas, e a procura segue
        # para as seguintes. Quem publica AS DUAS — a CVS, a Cigna, a
        # UnitedHealth — é que ficava mal servido por esta ordem: escolhiam-se
        # os sinistros e ignorava-se o custo dos produtos, que na CVS é o maior
        # dos dois. Esse caso deixou de se resolver pela ordem da lista e
        # passou a somar-se em build_row.
        "PolicyholderBenefitsAndClaimsIncurredHealthCare",
        "PolicyholderBenefitsAndClaimsIncurredNet",
        "BenefitsLossesAndExpenses",
        "CostOfRevenue",
        "CostOfSales",
        "CostOfGoodsAndServicesSold",
        "CostOfGoodsSold",
        "CostOfServices",
        # A Uber (e outras plataformas) apresentam "Cost of revenue, exclusive of
        # depreciation and amortization" como a primeira linha de despesa e NÃO
        # publicam GrossProfit nenhum — daí a margem bruta vazia de 2019 a 2025.
        # É uma tag us-gaap padrão. Fica DEPOIS das mais precisas: quem tagga
        # CostOfRevenue ou CostOfSales continua a usar essas, e esta só entra
        # quando não há outra. A D&A fora do custo torna a margem bruta um pouco
        # mais generosa do que se estivesse dentro, mas é a repartição que o
        # próprio emitente apresenta e a que os provedores de dados usam.
        "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
        "CostOfPurchasedPower",
        "CostOfSalesEnergy",
        "FuelCosts",
        "UtilitiesOperatingExpenseMaintenanceOperationsAndOtherCostsAndExpenses",
        "DirectCostsOfLeasedAndRentedPropertyOrEquipment",
        "PropertyOperatingExpense",
        "RealEstateTaxExpense",
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
        # Alinhado com o bottomLineNetIncome que a plataforma já usa (lib/fmp/mapear.ts),
        # para o EPS bater com lucro/ações; nas empresas sem ações preferenciais é igual ao NetIncomeLoss.
        "NetIncomeLossAvailableToCommonStockholdersBasic",
        "NetIncomeLoss",
        "ProfitLossAttributableToOwnersOfParent",
        "ProfitLoss",
    ],
    # Lucro ANTES dos dividendos preferenciais (atribuível à empresa-mãe). Não
    # vai para a BD: serve para reconstruir o que fica acima do lucro (resultado
    # operacional dos bancos, resultado antes de impostos, EBITDA, taxa de
    # imposto do ROIC). Usar o netIncome "para comuns" nessas contas tirava os
    # preferenciais ao resultado operacional (JPM 2025: −1 367 M; 18/11/2026).
    "netIncomeParent": ["NetIncomeLoss", "ProfitLossAttributableToOwnersOfParent"],
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
        # ÚLTIMO recurso. A Berkshire publica SÓ EarningsPerShareBasic — nem
        # Diluted nem a variante combinada — e ficava com epsDiluted a null em
        # toda a série. Numa empresa sem instrumentos diluidores materiais o
        # básico É o diluído; onde houver diluição real, o diluído aparece
        # antes na lista e este nunca chega a ser usado.
        "EarningsPerShareBasic",
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
        # IFRS (AZN-class): weighted average em nomes ifrs-full
        "WeightedAverageShares",
        "AdjustedWeightedAverageShares",
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
        "PaymentsToDevelopRealEstateAssets",
        "PaymentsToAcquireOilAndGasProperty",
        "PaymentsToAcquireEquityMethodInvestments",
        "PaymentsToExploreAndDevelopOilAndGasProperties",
        "PaymentsToAcquireCommercialRealEstate",  # REITs alternativo
        # Utilities: CIP é o capex COMPLETO de construção e tem de vir ANTES
        # de ProductiveAssets — na AEP este último é um componente lateral de
        # $0.4B vs $7.6B reais de construção (first-hit escolheria o parcial).
        "PaymentsForConstructionInProcess",         # utilities (AEP/ED)
        "PaymentsToAcquireProductiveAssets",
        "PaymentsForProceedsFromProductiveAssets",  # Dominion: $12.4B FY2024
        "PaymentsForCapitalImprovements",
        "PaymentsForLeasingCostsCommissionsAndTenantImprovements",
        # ── Aceites na revisão CFA 2026-07 (explain_holes) ──
        # ⚠️ Ordem importa: estes tags são de ÂMBITO ESTREITO e ficam DEPOIS de
        # toda a cauda legacy — na Dominion, "Projects" é um item lateral de
        # $202M YTD e roubava o lugar aos $12.4B de ProceedsFromProductiveAssets.
        "PaymentsToAcquireOtherProductiveAssets",   # BAX/INCY/VZ
        "PaymentsToAcquireProjects",                # utilities (ED)
        "PaymentsToAcquireRealEstate",              # REITs (REG/TPL)
        "PaymentsToAcquireOilAndGasPropertyAndEquipment",  # VLO
        "PaymentsToAcquireMachineryAndEquipment",   # RL
        "PaymentsToDevelopRealEstateAssets",        # REG
        "PaymentsToDevelopSoftware",                # software capitalizado (ROP)
        "PaymentsForSoftware",                      # VEEV
        # IFRS lato (SHEL: $20.845B FY2017 = capital expenditure do 20-F ✓);
        # último da fila — só dispara sem tags específicas de PP&E.
        "PurchaseOfOtherLongtermAssetsClassifiedAsInvestingActivities",
        # REJEITADOS (nunca adicionar): PurchaseOfTreasuryShares /
        # PaymentsToAcquireOrRedeemEntitysShares (buybacks = financiamento!),
        # PurchaseOfFinancialInstruments*/FinancialAssets* (carteira de
        # investimentos), PaymentsForPostemploymentBenefits, PaymentsFor
        # LegalSettlements, PaymentsToAcquireMortgageNotesReceivable (ativos
        # financeiros), PaymentsForNuclearFuel (parcial; AEP já tem CIP).
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
        # ── IFRS (revisão CFA 2026-07): DPS de ordinárias dos 20-F ──
        "DividendsPaidOrdinarySharesPerShare",              # BP/GSK/HSBC/NOK…
        "DividendsRecognisedAsDistributionsToOwnersPerShare",
        "DividendsProposedOrDeclaredBeforeFinancialStatementsAuthorisedForIssueButNotRecognisedAsDistributionToOwnersPerShare",
        # REJEITADO: DividendsPaidOtherSharesPerShare ("other" ≠ ordinárias).
    ],
    "researchAndDevelopment": [
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
        "ResearchAndDevelopmentExpenseSoftwareExcludingAcquiredInProcessCost"
    ],
    # Só a tag COMBINADA vive aqui. Empresas que reportam S&M e G&A em linhas
    # separadas (DAL/CHTR/ALGN…) são somadas no fallback de extract_all_metrics
    # — ter G&A neste array fazia o first-hit devolver só metade do SG&A.
    "sellingGeneralAndAdmin": [
        "SellingGeneralAndAdministrativeExpense",
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
        # IFRS cash-flow adjustment (SHEL) — D&A pura, SEM impairments; a
        # variante *AndImpairmentLoss* foi rejeitada (inflaria o EBITDA nos
        # anos de imparidade).
        "AdjustmentsForDepreciationAndAmortisationExpense",
        "DepreciationAmortizationAndAccretionNet",  # LEN
    ],
    # Capex alargado (auditoria 19/11): software capitalizado e compras de
    # intangíveis são investimento, e a FMP soma-os (377 dos 1 174 capex
    # diferentes). Só se juntam quando o capex escolhido é a linha pura de
    # imobilizado (capexPPE) — senão podia já os incluir (ProductiveAssets).
    "capexPPE": ["PaymentsToAcquirePropertyPlantAndEquipment"],
    "capexSoftware": ["PaymentsToDevelopSoftware", "PaymentsForSoftware", "PaymentsToAcquireSoftware"],
    "capexIntangiveis": ["PaymentsToAcquireIntangibleAssets"],
    # Componentes da D&A, lidos à parte para escolher o total certo em build_row
    # (melhor_da): a lista acima pára na primeira tag que existe, e muitas
    # empresas taggam como "DepreciationDepletionAndAmortization" SÓ a
    # depreciação, com a amortização dos intangíveis noutra tag (MRSH 2024:
    # 369 + 377 = 746). Diferenças na D&A explicavam 4/5 dos EBITDA diferentes.
    "daDDA": ["DepreciationDepletionAndAmortization"],
    "daDA": ["DepreciationAndAmortization"],
    "daDep": ["Depreciation"],
    "daAmortInt": ["AmortizationOfIntangibleAssets"],
    # Juros líquidos fora da exploração: única tag de juros de algumas empresas
    # (BLDR, KMI). Negativo = encargo líquido. Só alimenta o EBITDA.
    "jurosLiquidosNaoOp": ["InterestIncomeExpenseNonoperatingNet"],
    "incomeBeforeTax": [
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
        "ProfitLossBeforeTax",
        "IncomeBeforeTax",
    ],
    "netInterestIncome": [
        "InterestAndDividendIncomeOperating",
        "InterestIncomeExpenseNet",
        "InterestIncomeExpenseAfterProvisionForLoanLosses",
        "InterestAndFeeIncomeLoansAndLeases",
    ],
    "otherNonOperatingIncome": [
        "OtherNonoperatingIncomeExpense",
        "NonoperatingIncomeExpense",
        "OtherNonoperatingIncomeExpenseNet",
    ],
    "investingCashFlow": [
        "NetCashProvidedByUsedInInvestingActivities",
        "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
        "CashFlowsFromUsedInInvestingActivities",
    ],
    "financingCashFlow": [
        "NetCashProvidedByUsedInFinancingActivities",
        "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
        "CashFlowsFromUsedInFinancingActivities",
    ],
    "stockBasedCompensation": [
        "ShareBasedCompensation",
        "AllocatedShareBasedCompensationExpense",
        "ShareBasedPaymentArrangementExpense",
        "ShareBasedCompensationArrangementByShareBasedPaymentAwardExpense",
    ],
    "shareRepurchases": [
        "PaymentsForRepurchaseOfCommonStock",
        "PaymentsForRepurchaseOfEquity",
        "PaymentsToAcquireOrRedeemEntitysShares",
        "PurchaseOfTreasuryShares",
        "PaymentsForRepurchaseOfPreferredStockAndPreferenceStock",
    ],
    "dividendsPaid": [
        "PaymentsOfDividendsCommonStock",
        "PaymentsOfDividends",
        "PaymentsOfOrdinaryDividends",
        "DividendsPaidToEquityHoldersOfParentClassifiedAsFinancingActivities",
        "DividendsPaid",
        "PaymentsOfDividendsMinorityInterest",
    ],
    "netChangeInCash": [
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
        "CashAndCashEquivalentsPeriodIncreaseDecrease",
        "NetIncreaseDecreaseInCashAndCashEquivalents",
        "CashAndCashEquivalentsPeriodIncreaseDecreaseExcludingExchangeRateEffect",
        "CashPeriodIncreaseDecrease",
    ],
    # Sinais de que a empresa TEM dívida (juros e fluxos de emissão/reembolso).
    # Não vão para a BD: servem só para impedir a regra "debt-free" de gravar 0
    # em empresas cuja dívida está em tags com dimensões ou extensões próprias,
    # que o companyfacts não traz (PCAR, TXT, AES, EA — auditoria Gemini 18/11).
    # Bancos: receita = juros líquidos + receitas sem juros, como os bancos a
    # apresentam ("total revenue"). Sem isto a lista de revenue apanhava, conforme
    # o ano, os juros BRUTOS (FITB 2024: 10.426M em vez de 8.479M — auditoria 19/11).
    "bancoJurosLiquidos": ["InterestIncomeExpenseNet"],
    "bancoReceitaSemJuros": ["NoninterestIncome"],
    "sinalDivida": [
        "InterestExpenseDebt", "InterestExpenseNonoperating", "InterestExpense", "InterestPaidNet", "InterestPaid",
        "RepaymentsOfLongTermDebt", "RepaymentsOfDebt", "RepaymentsOfSeniorDebt", "RepaymentsOfConvertibleDebt",
        "RepaymentsOfNotesPayable", "RepaymentsOfCommercialPaper", "RepaymentsOfShortTermDebt",
        "ProceedsFromIssuanceOfLongTermDebt", "ProceedsFromIssuanceOfDebt", "ProceedsFromIssuanceOfSeniorLongTermDebt",
        "ProceedsFromIssuanceOfUnsecuredDebt", "ProceedsFromConvertibleDebt", "ProceedsFromRepaymentsOfCommercialPaper",
        "ProceedsFromRepaymentsOfShortTermDebt", "ProceedsFromRepaymentsOfLinesOfCredit",
    ],
    # Capex de REITs (decisão 19/11): compras de imóveis já existentes são
    # aquisições, não capex — como na FMP e como se exclui o M&A nas outras
    # empresas. Capex de REIT = desenvolvimento + melhorias.
    "reitAquisicoes": ["PaymentsToAcquireRealEstate", "PaymentsToAcquireCommercialRealEstate"],
    "reitDesenvolvimento": ["PaymentsToDevelopRealEstateAssets"],
    "reitMelhorias": ["PaymentsForCapitalImprovements", "PaymentsForLeasingCostsCommissionsAndTenantImprovements"],
    # Para reconhecer o custo "só imposto sobre imóveis" dos REITs (ver build_row).
    "realEstateTax": ["RealEstateTaxExpense"],
    "propertyOperatingExpense": ["PropertyOperatingExpense", "DirectCostsOfLeasedAndRentedPropertyOrEquipment"],
}

INSTANT_TAGS = {
    "totalAssets": ["Assets"],
    "totalCurrentAssets": [
        "AssetsCurrent",
        "CurrentAssets",
    ],
    "accountsReceivable": [
        "AccountsReceivableNetCurrent",
        "AccountsReceivableCurrent",
        "ReceivablesNetCurrent",
        "TradeAndOtherCurrentReceivables",
        "AccountsAndOtherReceivablesNetCurrent",
    ],
    "inventory": [
        "InventoryNet",
        "Inventories",
        "InventoryGross",
        "InventoryFinishedGoods",
    ],
    "propertyPlantEquipment": [
        "PropertyPlantAndEquipmentNet",
        "PropertyPlantAndEquipmentGross",
        "PropertyPlantAndEquipment",
    ],
    "goodwillAndIntangibles": [
        "GoodwillAndIntangibleAssetsNet",
    ],
    "goodwillOnly": [
        "Goodwill",
    ],
    "intangiblesOnly": [
        "IntangibleAssetsNetExcludingGoodwill",
        "OtherIntangibleAssetsNet",
    ],
    "accountsPayable": [
        "AccountsPayableCurrent",
        "AccountsPayableAndAccruedLiabilitiesCurrent",
        "TradeAndOtherCurrentPayables",
        "AccountsPayable",
    ],
    "retainedEarnings": [
        "RetainedEarningsAccumulatedDeficit",
        "RetainedEarnings",
    ],
    "totalCurrentLiab": ["LiabilitiesCurrent", "CurrentLiabilities"],
    "totalLiabilities": ["Liabilities", "LiabilitiesCurrentAndNoncurrent"],
    "longTermDebt": [
        "LongTermDebtNoncurrent",
        # ⚠️ NUNCA reintroduzir "NoncurrentLiabilities" aqui: em IFRS é o TOTAL
        # dos passivos não correntes (pensões, impostos diferidos, provisões…),
        # não dívida — sobrestimava a dívida das europeias em múltiplos.
        "LongTermDebt",
        "ConvertibleDebtNoncurrent",
        "ConvertibleDebt",
        # IFRS: parcela non-current dos borrowings (SAP/RACE-class filers)
        "NoncurrentPortionOfNoncurrentBorrowings",
        # ── Aceites na revisão CFA 2026-07 ──
        "UnsecuredLongTermDebt",           # ADI/CDNS/CME
        "ConvertibleLongTermNotesPayable", # CRM/DDOG/AKAM
        "LongTermLineOfCredit",            # revolver sacado LT (EME/PTC/TYL)
        "SecuredLongTermDebt",             # IDXX
        "LongtermBorrowings",              # IFRS (SHEL/SPOT/TTE)
        "NoncurrentDebtInstrumentsIssued", # IFRS bancos (UBS: notes emitidas)
    ],
    "longTermDebtCurrent": [
        "LongTermDebtCurrent",
        "CurrentBorrowings",
        # ── Aceites na revisão CFA 2026-07 ──
        "NotesPayableCurrent",             # META/ORCL/PYPL
        "ConvertibleNotesPayableCurrent",  # CIEN/DASH
        "ConvertibleDebtCurrent",          # INCY/PANW/TER
    ],
    # Só para a regra LongTermDebtAndCapitalLeaseObligations + parte corrente (SRE).
    # NÃO pôr em longTermDebtCurrent: na XEL a LTD vem de um total que já a inclui
    # e a parte corrente contava duas vezes (19/11).
    "ltdLeaseCurrent": ["LongTermDebtAndCapitalLeaseObligationsCurrent"],
    "shortTermDebt": [
        "ShortTermBorrowings", "ShortTermDebt", "ShorttermBorrowings",
        # ── Aceites na revisão CFA 2026-07 ──
        "OtherShortTermBorrowings",        # DECK/IBKR
        "ShortTermBankLoansAndNotesPayable",  # EVRG/EXPD
        "CurrentDebtInstrumentsIssued",    # IFRS bancos (UBS)
        # LoC sacada por último: total outstanding sob linhas de crédito —
        # legítimo borrowing (ADSK/ALGN/CRWD sem outras tags de dívida).
        "LineOfCredit",
    ],
    # DebtCurrent = TOTAL da dívida corrente (já inclui a porção corrente da LTD
    # + borrowings de curto prazo). Fica em campo PRÓPRIO — não em shortTermDebt —
    # senão somava-se com longTermDebtCurrent e contava a porção corrente a dobrar
    # (NVDA FY2024: 8.459 + 1.250 LTDcurrent + 1.250 DebtCurrent = 10.959 em vez
    # de 9.709). Ver build_row: current = max(DebtCurrent, LTDcurrent + ST).
    "debtCurrentTotal": ["DebtCurrent"],
    "commercialPaper": ["CommercialPaper", "CommercialPaperAtCarryingValue"],
    "totalDebt": [
        "DebtLongtermAndShorttermCombinedAmount",
        "Borrowings",
        "LongTermDebtAndCapitalLeaseObligations",
        # ── Aceites na revisão CFA 2026-07, PROTEGIDOS pelo guard CVNA-class
        # (um "total" direto < LTD é parcial e é descartado em build_row):
        # sem o guard, AOS (NotesPayable $120M vs LTD $300M) e AEP (=0
        # residual) corrompiam; com ele, JPM recupera $401B que só existe aqui.
        "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
        "DebtAndCapitalLeaseObligations",
        "NotesPayable",
        # REJEITADOS (nunca adicionar): LineOfCreditFacility*BorrowingCapacity
        # (CAPACIDADE, não dívida sacada), LoansAndAdvancesToCustomers/Banks
        # (ATIVOS de bancos!), AdvancesToAffiliate (ativo), DebtInstrument
        # FaceAmount (face ≠ carrying), LiabilitiesOtherThanLongtermDebt* (não
        # é dívida), SecuredBorrowingsGross* (repos: funding, não term debt).
    ],
    # Componentes de dívida de bancos/seguradoras (compostos em build_row SÓ
    # para Financials, e só quando existe pelo menos um componente LT no mix):
    "fhlbAdvances": ["AdvancesFromFederalHomeLoanBanks", "FederalHomeLoanBankAdvancesLongTerm"],
    "subordinatedDebtBank": ["SubordinatedDebt", "JuniorSubordinatedNotes"],
    "otherBorrowingsBank": ["OtherBorrowings"],
    "lineOfCredit": ["LineOfCredit"],
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
        # ── Aceites na revisão CFA 2026-07 ──
        "CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations",  # GE/MDLZ
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations",  # MMM 2019-21
        "CashEquivalentsAtCarryingValue",          # O
        "CashCashEquivalentsAndShortTermInvestments",  # GIS/TGT (já inclui STI)
        # REJEITADO: CashAndSecuritiesSegregatedUnderFederalAndOtherRegulations
        # (fundos segregados de clientes ≠ caixa da empresa).
    ],
    # Ativo de bancos: depósitos remunerados detidos noutros bancos — parte do
    # caixa e equivalentes na convenção bancária. NÃO confundir com "Deposits"
    # (passivo = depósitos de clientes), que nunca pode entrar em cash/dívida.
    "interestBearingDeposits": ["InterestBearingDepositsInBanks"],
    # Caixa restrita: subtraída quando o caixa veio de um tag que a inclui
    # (REG reporta só o total combinado — auditoria Gemini 18/11).
    # PFE guarda as aplicações aqui. Em bancos/seguradoras (TRV, AIG, ELV) é
    # carteira de investimento, não caixa — só se usa fora delas (build_row).
    "outrasAplicacoesCurto": ["OtherShortTermInvestments"],
    "restrictedCash": ["RestrictedCashAndCashEquivalents", "RestrictedCash",
                       "RestrictedCashAndCashEquivalentsAtCarryingValue"],
    "marketableSecuritiesCurrent": [
        "MarketableSecuritiesCurrent",
        "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
        "AvailableForSaleSecuritiesCurrent",
        "AvailableForSaleSecurities",
        "ShortTermInvestments",
        "DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent",  # INTU (auditoria 19/11)
    ],
    "totalEquity": [
        "StockholdersEquity",
        "EquityAttributableToOwnersOfParent",
        "Equity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "sharesOutstandingInst": ["CommonStockSharesOutstanding", "NumberOfSharesOutstanding"],
    # Para derivar o passivo quando a empresa não reporta "Liabilities":
    # ativo − capital próprio TOTAL (com minoritários) − capital temporário.
    # Com o capital só dos acionistas, os minoritários entravam no passivo
    # (SRE +10 mil M, KO — auditoria Gemini 18/11).
    "equityInclNci": ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "Equity"],
    "minorityInterestInst": ["MinorityInterest", "NoncontrollingInterestInSubsidiaries", "NoncontrollingInterests"],
    "temporaryEquity": ["TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests",
                        "RedeemableNoncontrollingInterestEquityCarryingAmount",
                        "TemporaryEquityCarryingAmountAttributableToParent"],
}

# Override manual de capex para casos em que a empresa reporta "purchases of
# property and equipment AND intangible assets" como uma única linha na
# demonstração de cash flow, sem tag XBRL própria (nenhuma das tags de
# DURATION_TAGS["capex"] aparece) — ex.: NVDA FY2016-FY2021, antes de a empresa
# passar a taggar a linha separadamente como PaymentsToAcquireProductiveAssets a
# partir de FY2022. Valores extraídos à mão dos 10-Ks/10-Qs originais na SEC
# EDGAR (Consolidated Statements of Cash Flows, "Investing activities"); os
# trimestres já vêm convertidos de YTD para discreto. Aplicado em dur_map por
# apply_manual_capex_overrides() DEPOIS de extract_all_metrics() e ANTES de
# synthesize_q4(), e SÓ preenche quando a extração automática devolveu None
# (nunca sobrepõe um valor real de tag). Chave: (ticker, fiscalYear, fp).
MANUAL_CAPEX_OVERRIDES: dict[tuple[str, int, str], float] = {
    ("NVDA", 2016, "FY"): 86_000_000,
    ("NVDA", 2016, "Q1"): 30_000_000,
    ("NVDA", 2016, "Q2"): 24_000_000,
    ("NVDA", 2016, "Q3"): 17_000_000,
    ("NVDA", 2017, "FY"): 176_000_000,
    ("NVDA", 2017, "Q1"): 55_000_000,
    ("NVDA", 2017, "Q2"): 32_000_000,
    ("NVDA", 2017, "Q3"): 38_000_000,
    ("NVDA", 2018, "FY"): 593_000_000,
    ("NVDA", 2018, "Q1"): 54_000_000,
    ("NVDA", 2018, "Q2"): 54_000_000,
    ("NVDA", 2018, "Q3"): 69_000_000,
    ("NVDA", 2019, "FY"): 600_000_000,
    ("NVDA", 2019, "Q1"): 118_000_000,
    ("NVDA", 2019, "Q2"): 129_000_000,
    ("NVDA", 2019, "Q3"): 150_000_000,
    ("NVDA", 2020, "FY"): 489_000_000,
    ("NVDA", 2020, "Q1"): 128_000_000,
    ("NVDA", 2020, "Q2"): 113_000_000,
    ("NVDA", 2020, "Q3"): 103_000_000,
    ("NVDA", 2021, "FY"): 1_128_000_000,
    ("NVDA", 2021, "Q1"): 155_000_000,
    ("NVDA", 2021, "Q2"): 217_000_000,
    ("NVDA", 2021, "Q3"): 473_000_000,
    # FY2023: a SEC só tem o capex YTD de 9 meses (1.324B) e anual (1.833B) — sem
    # Q1/Q2 — logo a diferenciação não conseguia derivar os trimestres. Valores
    # discretos dos 10-Qs (YTD: Q1 361, Q2 794, Q3 1324, FY 1833). Q4 (509) vem
    # do synthesize_q4 (FY − Q1 − Q2 − Q3).
    ("NVDA", 2023, "Q1"): 361_000_000,
    ("NVDA", 2023, "Q2"): 433_000_000,
    ("NVDA", 2023, "Q3"): 530_000_000,
}


def apply_manual_capex_overrides(dur_map: dict, ticker: str | None) -> None:
    """Preenche dur_map[(fy, fp)]["capex"] a partir de MANUAL_CAPEX_OVERRIDES
    quando a extração automática de tags não encontrou nada. Corre ANTES de
    synthesize_q4(), para que o Q4 sintetizado (FY − Q1 − Q2 − Q3) beneficie
    também dos trimestres aqui preenchidos. Nunca sobrepõe um valor real."""
    if not ticker:
        return
    for (t, fy, fp), val in MANUAL_CAPEX_OVERRIDES.items():
        if t != ticker:
            continue
        dur = dur_map.get((fy, fp))
        if dur is not None and dur.get("capex") is None:
            dur["capex"] = val


def new_id() -> str:
    return uuid.uuid4().hex


SPLITS_EVENTOS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "splits_eventos.json")
SPLIT_MIN_DATE = "2000-01-01"
_splits_eventos_cache: dict[str, list[dict]] | None = None


def carregar_splits_eventos() -> dict[str, list[dict]]:
    """Lê `scripts/splits_eventos.json` uma única vez por processo.
    Se o ficheiro não existir, avisa e devolve `{}` (sem ajuste de splits)."""
    global _splits_eventos_cache
    if _splits_eventos_cache is not None:
        return _splits_eventos_cache
    if not os.path.exists(SPLITS_EVENTOS_PATH):
        print(f"⚠️ Aviso: {SPLITS_EVENTOS_PATH} não encontrado — ajuste de splits desativado.")
        _splits_eventos_cache = {}
        return _splits_eventos_cache
    try:
        with open(SPLITS_EVENTOS_PATH, encoding="utf-8") as f:
            dados = json.load(f)
        _splits_eventos_cache = dados if isinstance(dados, dict) else {}
    except Exception as e:
        print(f"⚠️ Aviso: erro ao ler {SPLITS_EVENTOS_PATH} ({e}) — ajuste de splits desativado.")
        _splits_eventos_cache = {}
    return _splits_eventos_cache


def fator_split_para_filed(ticker: str | None, filed: str | None, hoje: str | None = None) -> float:
    """Produto dos fatores dos splits de `ticker` com `data >= 2000-01-01`, `data > filed` e já ocorridos."""
    if not ticker or not filed:
        return 1.0
    eventos = carregar_splits_eventos().get(ticker)
    if not eventos:
        return 1.0
    filed_iso = str(filed)[:10]
    # Split anunciado mas ainda por acontecer: os números publicados continuam na base antiga.
    # Quando a data passar, a seleção por eventos (get_companies_with_cik) reprocessa a empresa.
    hoje = (hoje or datetime.date.today().isoformat())[:10]
    f = 1.0
    for ev in eventos:
        d = ev.get("data")
        fac = ev.get("fator")
        if not d or not fac:
            continue
        if d >= SPLIT_MIN_DATE and d > filed_iso and d <= hoje:
            f *= float(fac)
    return f


def split_desmentido(dei_ns: dict, data: str, fator: float, janela: int = 45) -> bool:
    """O número de ações da capa (dei) fica IGUAL dos dois lados do evento?

    O catálogo traz ajustes de preço por spin-off com razões que parecem splits
    (EXC 2022: 1,4 = 7:5 depois da Constellation; HPE 2017, DXC). Um split multiplica
    as ações pelo fator; uma distribuição de outra empresa não lhes toca. Compara a
    última capa ≥45 dias antes com a primeira ≥45 dias depois (perto da data a capa
    pode já vir ajustada), com o valor entregue mais recentemente para cada data (a
    Kroger corrigiu num 10-K/A as ações erradas do 10-K de 2015). Sem dados → não desmente."""
    if abs(fator - 1) <= 0.1:
        return False
    por_data: dict = {}
    for vals in (dei_ns.get("EntityCommonStockSharesOutstanding") or {}).get("units", {}).values():
        for v in vals:
            if v.get("end") and v.get("val") is not None:
                chave = (v.get("filed") or "", v.get("accn") or "")
                por_data.setdefault(v["end"], {}).setdefault(chave, 0)
                por_data[v["end"]][chave] += v["val"]   # várias classes no mesmo filing
    serie = {d: x[max(x)] for d, x in por_data.items()}
    try:
        d0 = datetime.date.fromisoformat(data)
    except ValueError:
        return False
    antes = [d for d in serie if datetime.date.fromisoformat(d) < d0 - datetime.timedelta(days=janela)]
    depois = [d for d in serie if datetime.date.fromisoformat(d) > d0 + datetime.timedelta(days=janela)]
    if not antes or not depois:
        return False
    a, b = serie[max(antes)], serie[min(depois)]
    if not a or not b:
        return False
    return abs(b / a - 1) <= 0.05


def filtrar_splits_desmentidos(ticker: str | None, dei_ns: dict) -> list:
    """Retira do catálogo (só neste processo) os eventos que as ações da capa desmentem."""
    evs = carregar_splits_eventos().get(ticker or "")
    if not evs:
        return []
    fora = [e for e in evs if e.get("data") and e.get("fator") and split_desmentido(dei_ns, e["data"], float(e["fator"]))]
    if fora:
        carregar_splits_eventos()[ticker] = [e for e in evs if e not in fora]
        print(f"    {ticker}: {len(fora)} evento(s) de split desmentidos pelas ações ({', '.join(e['data'] for e in fora)})")
    return fora


def get_companies_with_cik(cur, tickers: list[str] | None = None) -> list[dict]:
    if tickers:
        cur.execute(
            'SELECT id, ticker, cik, sector, currency FROM companies WHERE "isActive" = TRUE AND cik IS NOT NULL '
            "AND ticker = ANY(%s) ORDER BY ticker",
            (tickers,),
        )
    else:
        # Event-driven + Fallback: processar quem reportou resultados recentemente e
        # ainda não publicou o 10-Q correspondente, quem teve um split após o último
        # updatedAt dos seus fundamentais, ou quem não é atualizado há >95 dias.
        splits_eventos = carregar_splits_eventos()
        hoje_iso = datetime.date.today().isoformat()
        split_tickers: list[str] = []
        split_dates: list[str] = []
        for t, evs in splits_eventos.items():
            datas = [ev["data"] for ev in evs if ev.get("data") and SPLIT_MIN_DATE <= ev["data"] <= hoje_iso]
            if datas:
                split_tickers.append(t)
                split_dates.append(max(datas))

        split_clause = ""
        params: tuple = ()
        if split_tickers:
            split_clause = """
                  OR EXISTS (
                      SELECT 1
                      FROM unnest(%s::text[], %s::date[]) AS s(ticker, split_date)
                      WHERE s.ticker = c.ticker
                        AND s.split_date > (
                            SELECT MAX(f."updatedAt")::date
                            FROM fundamentals f
                            WHERE f."companyId" = c.id
                        )
                  )
            """
            params = (split_tickers, split_dates)

        cur.execute(
            f'''
            SELECT c.id, c.ticker, c.cik, c.sector, c.currency
            FROM companies c
            WHERE c."isActive" = TRUE 
              AND c.cik IS NOT NULL
              AND (
                  EXISTS (
                      SELECT 1 FROM earnings_events e 
                      WHERE e."companyId" = c.id 
                        AND e.date >= CURRENT_DATE - INTERVAL '90 days'
                        AND e.date <= CURRENT_DATE
                        AND NOT EXISTS (
                            SELECT 1 FROM fundamentals f 
                            WHERE f."companyId" = c.id AND f."filedAt" >= e.date
                        )
                  )
                  {split_clause}
                  OR
                  NOT EXISTS (
                      SELECT 1 FROM fundamentals f 
                      WHERE f."companyId" = c.id 
                        AND f."filedAt" >= CURRENT_DATE - INTERVAL '95 days'
                  )
              )
            ORDER BY c.ticker
            ''',
            params,
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


def extract_tag_entries(us_gaap: dict, tag: str, prefer_per_share: bool = False) -> list[dict]:
    node = us_gaap.get(tag)
    if not node:
        return []

    units = node.get("units") or {}

    # Campos per-share: alguns filers tagham o MESMO facto em "USD" e em
    # "USD/shares" — e há PERÍODOS que só existem numa das unidades (ABBV Q4
    # só em USD; outros só em USD/shares). CONCATENAR as unidades per-share
    # com as monetárias dá visibilidade total; escolher só uma perdia 1.480
    # células (exclusivo /shares) ou 95 (exclusivo USD).
    if prefer_per_share:
        merged: list[dict] = []
        for unit_key, unit_entries in units.items():
            if "/" in unit_key and isinstance(unit_entries, list):
                merged.extend(e for e in unit_entries if "14A" not in (e.get("form") or ""))
        for unit_key, unit_entries in units.items():
            if "/" not in unit_key and isinstance(unit_entries, list):
                merged.extend(e for e in unit_entries if "14A" not in (e.get("form") or ""))
        if merged:
            return merged

    # Priorizar extração de valores monetários (fiat) corretos — começando
    # pela moeda de REPORTE da empresa (dual-taggers como a BCS têm USD e GBP
    # no mesmo node; USD-primeiro global misturava moedas e perdia períodos
    # GBP-only).
    for currency in ([_PREFERRED_CURRENCY] if _PREFERRED_CURRENCY else []) + VALID_CURRENCIES:
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
    # Limites inferiores acomodam calendários fiscais 4-4-5 (COST/AES):
    # Q2 YTD = 24 semanas = 168 dias; Q3 YTD = 36 semanas = 252 dias — as
    # janelas antigas (170/260) rejeitavam-nos e o capex/OCF ficava null.
    if fp == "Q1": return 80 <= days <= 110
    if fp == "Q2": return 160 <= days <= 200
    if fp == "Q3": return 245 <= days <= 290
    if fp in ("Q4", "FY"): return 350 <= days <= 380
    return False


def _best_entry_for_period(entries: list[dict], expected_end: str, prefer_annual_form: bool = False,
                           prefer_max_scale: bool = True) -> dict | None:
    """Devolve o entry XBRL vencedor para expected_end (valor e metadados como accn)."""
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
    best = matches[0]
    val = best.get("val")
    # Guard de unidades: alguns filings tagham o mesmo facto em milhares/milhões
    # (ex.: ANET NetIncomeLoss "841" vs "841000000" com o mesmo period end).
    # Restatements legítimos nunca divergem 100x; bugs de escala são 1000x+.
    # Nesses casos, preferir o match de maior magnitude em vez do mais recente.
    # SÓ para campos monetários (prefer_max_scale=True): em campos per-share o
    # maior é quase sempre o errado (ICE 2016: EPS taggado "120000000" no 10-Q
    # original vs 0.62 nos filings seguintes) — aí fica o mais recente.
    if prefer_max_scale:
        vals = [e for e in matches if e.get("val") is not None]
        if val is not None and val != 0 and vals:
            vmax_entry = max(vals, key=lambda e: abs(e["val"]))
            if abs(vmax_entry["val"]) > 100 * abs(val):
                return vmax_entry
    return best


def best_for_period(entries: list[dict], expected_end: str, prefer_annual_form: bool = False,
                    prefer_max_scale: bool = True) -> float | None:
    entry = _best_entry_for_period(entries, expected_end, prefer_annual_form=prefer_annual_form,
                                   prefer_max_scale=prefer_max_scale)
    return entry.get("val") if entry else None


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
            per_share_field = field in ("epsDiluted", "dividendPerShare")
            for tag in tags:
                entries = extract_tag_entries(us_gaap, tag, prefer_per_share=per_share_field)
                if not entries:
                    candidates.append(None)
                    continue

                if fp == "FY":
                    pool = [e for e in entries if is_annual_duration(e)]
                elif field in ("operatingCashFlow", "capex"):
                    pool = [e for e in entries if is_ytd_duration(e, fp)]
                else:
                    pool = [e for e in entries if is_quarterly_duration(e)]

                entry = _best_entry_for_period(
                    pool, expected_end,
                    prefer_annual_form=(fp == "FY"),
                    prefer_max_scale=(field not in ("epsDiluted", "dividendPerShare")),
                )
                val = entry.get("val") if entry else None
                candidates.append(val)
                if val is not None and field != "revenue":
                    dur_map[(fy, fp)][field] = val
                    if field in ("epsDiluted", "dividendPerShare", "sharesOutstandingDur"):
                        dur_map[(fy, fp)][f"{field}_filed"] = entry.get("filed")
                    # Um ZERO numa tag de pagamentos não prova que não houve pagamentos:
                    # a Leidos tagga 0 em ações ordinárias e 542 M no total de equity;
                    # o Huntington 0 em ordinárias e 82 M em preferenciais. Fica o zero
                    # só se nenhuma tag seguinte tiver valor.
                    if field == "shareRepurchases" and val == 0:
                        continue
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
    # SG&A por soma de componentes: quando a tag combinada não existe, somar a
    # melhor linha de selling/marketing com a melhor de G&A/admin. Cobre tanto
    # IFRS (SalesAndMarketing + Administrative) como US filers que reportam
    # S&M e G&A separados (DAL/CHTR/ALGN) — antes o first-hit em G&A devolvia
    # só METADE do SG&A.
    SGA_SELLING_TAGS = ["SellingAndMarketingExpense", "SalesAndMarketingExpense",
                        "SellingExpense", "MarketingExpense"]
    SGA_ADMIN_TAGS = ["GeneralAndAdministrativeExpense", "AdministrativeExpense"]

    def _best_of(tag_list, fp, expected_end):
        for t in tag_list:
            entries = extract_tag_entries(us_gaap, t)
            if not entries:
                continue
            if fp == "FY":
                pool = [e for e in entries if is_annual_duration(e)]
            else:
                pool = [e for e in entries if is_quarterly_duration(e)]
            val = best_for_period(pool, expected_end, prefer_annual_form=(fp == "FY"))
            if val is not None:
                return val
        return None

    for (fy, fp) in periods:
        if "sellingGeneralAndAdmin" not in dur_map[(fy, fp)]:
            expected_end = period_ends.get((fy, fp))
            if expected_end:
                val_s = _best_of(SGA_SELLING_TAGS, fp, expected_end)
                val_a = _best_of(SGA_ADMIN_TAGS, fp, expected_end)
                if val_s is not None or val_a is not None:
                    dur_map[(fy, fp)]["sellingGeneralAndAdmin"] = (val_s or 0) + (val_a or 0)

    # DPS declarado como facto INSTANT na data da DECLARAÇÃO (ABBV mudou de
    # estilo em 2020; AME etc.): sem duration para o trimestre, mapear cada
    # declaração ao trimestre fiscal que a contém — datas dentro de
    # (fim do trimestre anterior, fim deste] e a menos de 95 dias do fim.
    # Duas declarações no mesmo trimestre (regular + especial) somam-se.
    dps_missing = [(fy, fp) for (fy, fp) in periods
                   if fp.startswith("Q")
                   and dur_map[(fy, fp)].get("dividendPerShare") is None
                   and period_ends.get((fy, fp))]
    if dps_missing:
        declared: dict[tuple[str, float], str | None] = {}
        for tag in DURATION_TAGS["dividendPerShare"]:
            node = us_gaap.get(tag) or {}
            for unit_key, unit_entries in (node.get("units") or {}).items():
                if "/" not in unit_key or not isinstance(unit_entries, list):
                    continue
                for e in unit_entries:
                    if "start" in e or not e.get("end") or e.get("val") is None:
                        continue
                    if "14A" in (e.get("form") or ""):
                        continue
                    k_decl = (e["end"], float(e["val"]))
                    f_decl = e.get("filed")
                    if k_decl not in declared or (f_decl or "") > (declared[k_decl] or ""):
                        declared[k_decl] = f_decl
        if declared:
            q_ends = sorted({period_ends[p] for p in periods
                             if p[1].startswith("Q") and period_ends.get(p)})
            for (fy, fp) in dps_missing:
                p_end = period_ends[(fy, fp)]
                idx = q_ends.index(p_end) if p_end in q_ends else -1
                prev_end = q_ends[idx - 1] if idx > 0 else None
                floor = (datetime.date.fromisoformat(p_end)
                         - datetime.timedelta(days=95)).isoformat()
                lower = max(prev_end, floor) if prev_end else floor
                parts = [(v, f_decl) for (d, v), f_decl in declared.items() if lower < d <= p_end]
                if parts:
                    dur_map[(fy, fp)]["dividendPerShare"] = sum(v for v, _ in parts)
                    dur_map[(fy, fp)]["dividendPerShare_parts"] = parts
                    dur_map[(fy, fp)]["dividendPerShare_filed"] = max(
                        (f_decl for _, f_decl in parts if f_decl), default=None
                    )

    # 18/11: amortizações, SBC, recompras, dividendos pagos e os fluxos de
    # investimento/financiamento vêm muitas vezes SÓ no cash flow, que nos 10-Q
    # é acumulado desde o início do ano. Só se aceitavam valores de 3 meses, e
    # o Q2/Q3 ficavam vazios (19% dos trimestres sem D&A → EBITDA N/A). Quando
    # falta o trimestre de 3 meses: YTD deste trimestre − YTD do anterior,
    # como no OCF/capex. O Q4 continua a vir da síntese FY − 9M.
    _anterior = {"Q2": "Q1", "Q3": "Q2"}
    for field in ("depreciationAndAmortization", "stockBasedCompensation", "shareRepurchases",
                  "dividendsPaid", "investingCashFlow", "financingCashFlow",
                  "daDDA", "daDA", "daDep", "daAmortInt",
                  "capexPPE", "capexSoftware", "capexIntangiveis"):
        tags_f = DURATION_TAGS.get(field) or []
        trimestral = {p: dur_map[p].get(field) for p in periods}  # valores de 3 meses originais
        ytd: dict = {}
        for (fy, fp) in periods:
            if fp not in ("Q1", "Q2", "Q3"):
                continue
            if trimestral[(fy, fp)] is not None and fp == "Q1":
                ytd[(fy, fp)] = trimestral[(fy, fp)]  # no Q1, 3 meses = acumulado
                continue
            expected_end = period_ends.get((fy, fp))
            if not expected_end:
                continue
            for tag in tags_f:
                pool = [e for e in extract_tag_entries(us_gaap, tag) if is_ytd_duration(e, fp)]
                entry = _best_entry_for_period(pool, expected_end, prefer_annual_form=False,
                                               prefer_max_scale=True)
                if entry and entry.get("val") is not None:
                    ytd[(fy, fp)] = entry["val"]
                    break
        for (fy, fp) in periods:
            if fp not in ("Q1", "Q2", "Q3") or trimestral[(fy, fp)] is not None:
                continue
            atual = ytd.get((fy, fp))
            if atual is None:
                continue
            if fp == "Q1":
                dur_map[(fy, fp)][field] = atual
                continue
            ant = ytd.get((fy, _anterior[fp]))
            if ant is None and fp == "Q3":
                # YTD do Q2 = Q1 + Q2 de 3 meses, se os dois existirem
                q1, q2 = trimestral.get((fy, "Q1")), trimestral.get((fy, "Q2"))
                ant = (q1 + q2) if q1 is not None and q2 is not None else None
            if ant is not None:
                dur_map[(fy, fp)][field] = atual - ant

    # Apply differencing for cash flow metrics
    original_ytd = {}
    for (fy, fp) in periods:
        original_ytd[(fy, fp)] = {
            "operatingCashFlow": dur_map[(fy, fp)].get("operatingCashFlow"),
            "capex": dur_map[(fy, fp)].get("capex")
        }
    
    _PRIOR_Q = {"Q2": "Q1", "Q3": "Q2", "Q4": "Q3"}
    for (fy, fp) in periods:
        if fp in ("Q1", "FY"): continue
        dur = dur_map[(fy, fp)]
        prior = original_ytd.get((fy, _PRIOR_Q[fp]), {})
        for metric in ("operatingCashFlow", "capex"):
            ytd = original_ytd[(fy, fp)].get(metric)
            if ytd is None:
                dur[metric] = None
                continue
            prior_ytd = prior.get(metric)
            # O valor trimestral discreto só se obtém subtraindo o YTD do trimestre
            # anterior. Sem esse YTD, deixar o YTD cru seria ERRADO — ex.: NVDA
            # FY2023 Q3 ficava com o capex YTD de 9 meses (1.32B) e dava um FCF
            # negativo falso. Preferir NULL honesto; o override manual ou o
            # synthesize_q4 preenchem depois.
            dur[metric] = (ytd - prior_ytd) if prior_ytd is not None else None

    for field, tags in INSTANT_TAGS.items():
        for (fy, fp) in periods:
            expected_end = period_ends.get((fy, fp))
            if not expected_end:
                continue
            for tag in tags:
                entries = extract_tag_entries(us_gaap, tag)
                if not entries:
                    continue
                entry = _best_entry_for_period(entries, expected_end, prefer_annual_form=(fp == "FY"))
                val = entry.get("val") if entry else None
                if val is not None:
                    inst_map[(fy, fp)][field] = val
                    if field == "cash":
                        # build_row precisa de saber QUAL tag deu o caixa: o
                        # tag largo dos bancos (CashCashEquivalentsRestricted…)
                        # JÁ inclui os depósitos remunerados — somar ibd por
                        # cima duplicaria (JPM: 469B → 915B).
                        inst_map[(fy, fp)]["cash_tag"] = tag
                    elif field == "totalDebt":
                        inst_map[(fy, fp)]["totalDebt_tag"] = tag
                    elif field in ("totalAssets", "totalEquity"):
                        inst_map[(fy, fp)][f"{field}_accn"] = entry.get("accn")
                        inst_map[(fy, fp)][f"{field}_tag"] = tag
                    elif field == "sharesOutstandingInst":
                        inst_map[(fy, fp)]["sharesOutstandingInst_filed"] = entry.get("filed")
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


def plausivel(v, lo, hi):
    """Fora da banda devolve None (→ N/A), em vez de truncar para o limite.

    O safe_clamp(-99, 99) que aqui estava é uma banda de ±9900%: não filtra
    nada na prática, e um ROIC de 300% chegava intacto ao gráfico. Truncar
    também não serve — um ROIC truncado em 200% continua a ser um número
    inventado a ocupar o lugar de "não sabemos".

    Estes rácios saem quase sempre de um denominador residual (capital
    investido ou capital próprio perto de zero, típico de quem fez recompras
    agressivas). Nesses casos o quociente não tem significado económico
    nenhum, e a regra da casa é clara: quando não se sabe, mostra-se N/A,
    nunca um número.
    """
    if v is None:
        return None
    return v if lo <= v <= hi else None


# ── Identidade de período fiscal derivada da DATA (não dos campos fy/fp) ──────
# Os campos fy/fp do XBRL da SEC são frequentemente ERRADOS em factos
# comparativos de filings posteriores (a mesma data reportada com fy diferente),
# e confiar neles fazia linhas "FY2020 Q1" ganharem uma periodEnd de 2020-04-26
# (que é fiscal-2021 Q1). A data de fecho, essa, nunca mente — por isso o ano e
# o trimestre fiscais são DERIVADOS da periodEnd + o calendário fiscal real da
# empresa (as datas de fecho anuais observadas).
_CORE_PERIOD_TAGS = ("NetIncomeLoss", "ProfitLoss", "Revenues", "Revenue")
_INSTANT_PERIOD_TAGS = ("Assets", "StockholdersEquity", "Equity")


_GRACE = datetime.timedelta(days=7)
_YEAR_DAYS = 365.25
_QUARTER_DAYS = 91.3125


def build_fiscal_calendar(us_gaap: dict) -> dict | None:
    """Deriva o calendário fiscal da empresa das DATAS dos factos anuais (imunes
    ao bug de fy/fp: a data está certa mesmo com o rótulo errado).

    Estratégia robusta a calendários 52/53 semanas (fecho oscila jan/fev,
    ago/set) e a anos fiscais em falta: em vez de um modelo mês+offset (que parte
    em empresas cujo fecho cruza a fronteira do mês, ex. COST), ancora-se num
    ÚNICO facto anual FIÁVEL — aquele cujo 10-K foi arquivado <120 dias após o
    fecho (o original, não um comparativo, logo com `fy` verdadeiro) — e
    numeram-se todos os outros fechos por DISTÂNCIA EM ANOS a essa âncora
    (round(dias/365,25)), o que tolera lacunas.

    Devolve {annual_ends: [date], anchor_end: date, anchor_fy: int} ou None se
    não houver factos anuais ou âncora fiável (aí o chamador cai para o antigo)."""
    ann_ends: list[datetime.date] = []
    reliable: dict[datetime.date, tuple[int, int]] = {}  # end -> (gap, fy) do original
    for tag in _CORE_PERIOD_TAGS:
        for e in extract_tag_entries(us_gaap, tag):
            if not is_annual_duration(e):
                continue
            # Uma duração de 12 meses dentro de um 10-Q são DOZE MESES MÓVEIS,
            # não um fecho de exercício. A Amazon publica-os em cada trimestre
            # (NetIncomeLoss de 2024-04-01 a 2025-03-31, form=10-Q), e sem este
            # filtro o calendário fiscal dela ficava com QUATRO "fechos anuais"
            # por ano. A âncora caía em março, e a partir daí todos os rótulos
            # saíam desfasados de um trimestre: junho de 2025 ficava Q1 de 2026.
            # Pior, a chave (fy,"Q4") passava a existir — era o período de março
            # — e a síntese de Q4 via-a preenchida, nunca derivando o trimestre
            # de dezembro que falta mesmo.
            forma = (e.get("form") or "").upper()
            periodo = (e.get("fp") or "").upper()
            if forma.startswith("10-Q") or (periodo and periodo != "FY"):
                continue
            try:
                d = datetime.date.fromisoformat(e["end"])
            except (ValueError, KeyError, TypeError):
                continue
            ann_ends.append(d)
            fy_label, filed = e.get("fy"), e.get("filed")
            if fy_label and filed:
                try:
                    gap = (datetime.date.fromisoformat(filed) - d).days
                except (ValueError, TypeError):
                    continue
                # Original (não comparativo): 10-K arquivado pouco depois do fecho.
                if 0 <= gap < 120 and (d not in reliable or gap < reliable[d][0]):
                    reliable[d] = (gap, fy_label)
    if not ann_ends or not reliable:
        return None

    # Calibração da âncora por MODA (robusta a um facto com fy anómalo): cada
    # fecho anual fiável dá um voto para "que fy teria o fecho REF", contando a
    # distância em anos. A moda vence — um único rótulo mau não desalinha tudo.
    ref = max(reliable)
    base_votes = [fy + round((ref - end).days / _YEAR_DAYS) for end, (_g, fy) in reliable.items()]
    anchor_fy = Counter(base_votes).most_common(1)[0][0]

    # Dedup/cluster (52/53 semanas fazem as datas oscilar): uma por ano fiscal,
    # a mais recente de cada cluster de ~25 dias.
    clustered: list[datetime.date] = []
    for d in sorted(set(ann_ends)):
        if clustered and (d - clustered[-1]).days <= 25:
            clustered[-1] = d
        else:
            clustered.append(d)
    return {"annual_ends": clustered, "anchor_end": ref, "anchor_fy": anchor_fy}


def map_end_to_fiscal(d: datetime.date, is_annual: bool, cal: dict) -> tuple[int, str]:
    """Mapeia uma data de fecho para (fiscalYear, fp), tudo por datas. k = nº de
    anos fiscais entre a âncora e o ano fiscal a que `d` pertence (o primeiro
    fecho âncora+k·365,25 que fica >= d). Extrapola por passos de ~1 ano, por
    isso lacunas nos anos anuais não puxam o resultado (ao contrário de "primeiro
    anual observado >= d"). O trimestre vem da distância ao fecho estimado."""
    anchor_end = cal["anchor_end"]
    k = math.ceil(((d - _GRACE) - anchor_end).days / _YEAR_DAYS)
    fy = cal["anchor_fy"] + k
    if is_annual:
        return fy, "FY"
    fye_est = anchor_end + datetime.timedelta(days=round(_YEAR_DAYS * k))
    # Ajustar a um fecho anual observado próximo (±25d) para a distância em
    # trimestres ser exata mesmo com drift 52/53 semanas.
    nearest = min(cal["annual_ends"], key=lambda a: abs((a - fye_est).days))
    fye = nearest if abs((nearest - fye_est).days) <= 25 else fye_est
    qi = round((fye - d).days / _QUARTER_DAYS)
    q = 4 - max(0, min(qi, 3))
    return fy, f"Q{q}"


def discover_periods(us_gaap: dict, cal: dict, min_fy: int) -> tuple[set, dict, dict]:
    """Descobre os períodos (fy, fp) e resolve periodEnd/filed por período,
    tudo a partir das DATAS (não de fy/fp). Devolve (periods, period_ends,
    period_filed). period_ends guarda sempre uma string `end` REALMENTE
    observada (o best_for_period casa por igualdade exata de `end`)."""
    cand: dict = defaultdict(list)  # (fy, fp) -> [(end_str, filed_str)]
    for tag in _CORE_PERIOD_TAGS + _INSTANT_PERIOD_TAGS:
        for e in extract_tag_entries(us_gaap, tag):
            end = e.get("end")
            if not end:
                continue
            try:
                d = datetime.date.fromisoformat(end)
            except (ValueError, TypeError):
                continue
            if "start" in e:
                if is_annual_duration(e):
                    # Mesma armadilha do build_fiscal_calendar: 12 meses dentro
                    # de um 10-Q são móveis, não um exercício. Deixá-los passar
                    # criava um (fy,"FY") fantasma — a Amazon ficava com uma
                    # linha anual de 2026 fechada a 31 de março e sem receita
                    # nenhuma, porque nenhum facto anual a sério casa com essa
                    # data. Não é trimestre nem ano: ignora-se de todo.
                    forma = (e.get("form") or "").upper()
                    periodo = (e.get("fp") or "").upper()
                    if forma.startswith("10-Q") or (periodo and periodo != "FY"):
                        continue
                    is_ann = True
                else:
                    days = (d - datetime.date.fromisoformat(e["start"])).days
                    if not (80 <= days <= 300):
                        continue  # nem trimestre/YTD nem anual — ignorar
                    is_ann = False
            else:
                # Instante (balanço): a data é um fim de período. Anual se coincide
                # (±25d) com um fecho fiscal; senão é o fecho de um trimestre.
                is_ann = any(abs((d - a).days) <= 25 for a in cal["annual_ends"])
            fy, fp = map_end_to_fiscal(d, is_ann, cal)
            if fy < min_fy:
                continue
            cand[(fy, fp)].append((end, e.get("filed")))

    period_ends: dict = {}
    period_filed: dict = {}
    for key, lst in cand.items():
        best_end = Counter(x[0] for x in lst).most_common(1)[0][0]
        fileds = [x[1] for x in lst if x[0] == best_end and x[1]]
        period_ends[key] = best_end
        # min e NÃO max: um período aparece nas companyfacts uma vez na filing
        # que o reporta e OUTRA VEZ em cada filing posterior que o traz como
        # comparativo. O max ficava sempre com a mais recente dessas, ou seja
        # com uma data que nada tem que ver com a disponibilidade do dado — o
        # FY2025Q1 da AAPL (fechado em Dez/2024) estava gravado como filed em
        # Maio/2026, e os quatro trimestres de 2016 todos em Nov/2017. A
        # primeira filing a reportar o período é, por definição, aquela em que
        # ele é o período de reporte, e é quando o mercado soube. Se vier de um
        # 8-K de resultados anterior ao 10-Q, melhor ainda: foi mesmo aí que a
        # informação passou a ser pública.
        period_filed[key] = min(fileds) if fileds else None
    return set(cand.keys()), period_ends, period_filed


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
# Tags inequivocamente de dividendos a COMMON — só estas contam para os ANOS.
# Tags genéricas (Dividends, PaymentsOfDividends, DividendsPayable) incluem
# preferenciais (ACGL paga preferred desde 2011 sem nunca pagar common até ao
# especial de 2024) e por isso só sustentam o booleano conservador.
_DIVIDEND_COMMON_EVIDENCE = _re.compile(
    r"CommonStockDividend|DividendsCommonStock|DividendsPerShare|OrdinaryShares|"
    r"DividendsPaidToEquityHoldersOfParentClassifiedAsFinancingActivities"
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
    """Varre TODO o companyfacts (us-gaap + ifrs-full) e devolve evidência:
    - is_dividend_payer: existe qualquer facto de dividendos a common > 0
    - dividend_fact_years: ANOS (do "end" do facto) com dividendos > 0 — a
      granularidade que decide se um DPS em falta é 0.0 (ano sem qualquer
      facto de dividendo: META pré-2024, ACGL fora do especial de 2024,
      empresas que cortaram) ou NULL (gap num ano comprovadamente pagador)
    - has_rnd_ever: a empresa alguma vez reportou uma linha de R&D
    - has_ltd_ever: a empresa alguma vez taggou dívida de longo prazo
    Errar para o lado de "pagador" é seguro: ⇒ campo em falta fica NULL (N/A),
    nunca um zero/total fabricado."""
    common_years: set = set()
    generic_payer = False
    has_rnd = False
    has_ltd = False
    facts = (facts_json or {}).get("facts") or {}
    for ns_name in ("us-gaap", "ifrs-full"):
        ns = facts.get(ns_name) or {}
        for tag, node in ns.items():
            if _DIVIDEND_EVIDENCE.search(tag) and not _DIVIDEND_EXCLUDE.search(tag):
                is_common_tag = bool(_DIVIDEND_COMMON_EVIDENCE.search(tag))
                for entries in (node.get("units") or {}).values():
                    if not isinstance(entries, list):
                        continue
                    for e in entries:
                        v = e.get("val")
                        end = e.get("end") or ""
                        if isinstance(v, (int, float)) and v > 0 and len(end) >= 4:
                            generic_payer = True
                            if is_common_tag:
                                common_years.add(int(end[:4]))
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
    # anos: precisos quando há evidência common; None (= "assumir pagador em
    # todos os anos" → NULL) quando só há evidência genérica/ambígua; [] = nunca.
    if common_years:
        div_years = sorted(common_years)
    elif generic_payer:
        div_years = None
    else:
        div_years = []
    return {
        "is_dividend_payer": generic_payer or bool(common_years),
        "dividend_fact_years": div_years,
        "has_rnd_ever": has_rnd,
        "has_ltd_ever": has_ltd,
    }



def ebit_de_baixo(dur, ni_pre=None, tax_expense=None):
    """EBIT reconstruído de baixo: lucro antes de impostos + juros − outros proveitos
    não operacionais. None sem lucro antes de impostos."""
    ibt = dur.get("incomeBeforeTax")
    if ibt is None and ni_pre is not None and tax_expense is not None:
        ibt = ni_pre + tax_expense
    if ibt is None:
        return None
    juros = dur.get("interestExpense")
    if juros is None and (dur.get("jurosLiquidosNaoOp") or 0) < 0:
        juros = -dur["jurosLiquidosNaoOp"]
    return ibt + (juros or 0) - (dur.get("otherNonOperatingIncome") or 0)


def melhor_da(dur: dict) -> float | None:
    """D&A total: o maior entre o total reportado e depreciação + amortização de intangíveis.

    Nunca soma duas tags que possam conter a mesma coisa: a soma só se faz com a
    tag "Depreciation" (só depreciação) e a dos intangíveis. O máximo protege dos
    totais parciais (MRSH, NTAP) sem inventar: cada candidato é um valor
    reportado pela empresa ou a soma de duas linhas disjuntas.
    """
    cands = [dur.get("depreciationAndAmortization"), dur.get("daDDA"), dur.get("daDA")]
    dep, amort = dur.get("daDep"), dur.get("daAmortInt")
    if dep is not None and amort is not None and dep > 0 and amort > 0:
        cands.append(dep + amort)
    cands = [c for c in cands if c is not None and c >= 0]
    return max(cands) if cands else None


def build_row(company_id: str, fy: int, fp: str, period_end: str, filed_at: str | None,
              dur: dict, inst: dict, sector: str | None = None,
              evidence: dict | None = None) -> dict:
    # evidence = compute_company_evidence(facts): evidência da empresa inteira
    # que decide se um DPS/R&D em falta é um verdadeiro zero (empresa não
    # pagava/não reporta) ou um buraco de extração que DEVE ficar NULL.
    # Default (sem evidência): assumir pagador/reporta → NULL, nunca 0 fabricado.
    evidence = evidence or {"is_dividend_payer": True, "dividend_fact_years": None,
                            "has_rnd_ever": True, "has_ltd_ever": False}
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
    eps_raw_abs = abs(eps_g * (dur.get("_eps_split_fator") or 1.0)) if eps_g is not None else 0.0
    expected_shares = None
    if ni_g is not None and eps_g is not None and eps_raw_abs >= 0.5:
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

    # Identidade EPS×shares≈NI vence EPS extraído incoerente. Apanha:
    #  - escala errada (HAL 2020: eps taggado em milionésimos → ×10⁶ off);
    #  - EPS de continuing-ops com sinal/magnitude incompatível com o NI TOTAL
    #    que a plataforma mostra (LYV: eps −0.02 vs NI +$60M). O EPS coerente
    #    com o NI apresentado é NI/shares diluídas — a própria definição.
    if (eps_g is not None and ni_g is not None and shares is not None
            and shares >= 100_000 and abs(ni_g) > 10_000_000):
        implied_ni = eps_g * shares
        sign_flip = (implied_ni > 0) != (ni_g > 0)
        off_ratio = abs(implied_ni - ni_g) / abs(ni_g)
        if sign_flip or off_ratio > 0.5:
            derived_eps = ni_g / shares
            if abs(derived_eps) < 100_000:
                eps_g = derived_eps

    # A verificação acima só entra com lucro acima de 10 milhões — e bem, que
    # abaixo disso o arredondamento do EPS domina. Só que é exactamente aí que
    # se escondiam os piores: a DELL no 4T de 2022 tinha EPS de -40 000 com 2
    # milhões de lucro, e a VTRS -9 071 com menos de um milhão.
    #
    # Estes não precisam de comparação de rácios: -40 000 dólares por acção com
    # 791 milhões de acções implica um prejuízo de 31 BILIÕES, mais do que o PIB
    # de qualquer país. Um valor destes não é uma empresa a ter um mau
    # trimestre, é uma etiqueta com a escala trocada.
    if eps_g is not None and abs(eps_g) > 5_000:
        substituto = None
        if ni_g is not None and shares is not None and shares >= 100_000:
            candidato = ni_g / shares
            if abs(candidato) < 5_000:
                substituto = candidato
        # Sem forma de corroborar fica N/A. O maior EPS real do índice é o da
        # NVR, à volta de 500 dólares — nada legítimo se aproxima dos 5 000.
        eps_g = substituto

    capex_raw = dur.get("capex")
    capex = abs(capex_raw) if capex_raw is not None else None
    nota_capex = None
    aq = dur.get("reitAquisicoes")
    if sector == "Real Estate" and capex is not None and aq is not None and abs(abs(aq) - capex) < 1:
        dev = [abs(v) for v in (dur.get("reitDesenvolvimento"), dur.get("reitMelhorias")) if v is not None]
        if dev and sum(dev) > 0:
            capex = sum(dev)
        else:
            # sem tags de desenvolvimento/melhorias (vêm em tags próprias da
            # empresa): fica o valor das aquisições, com aviso no site
            nota_capex = "inclui_aquisicoes"
    ppe = dur.get("capexPPE")
    if (capex is not None and sector != "Real Estate" and ppe is not None
            and abs(abs(ppe) - capex) < 1):
        sw = dur.get("capexSoftware")
        if sw and sw > 0:
            capex += abs(sw)
        # Intangíveis só quando são rotina: uma compra de espectro ou de uma
        # licença grande (dezenas de vezes o capex normal) é uma aquisição,
        # como as de empresas, e não entra no FCF recorrente.
        it = dur.get("capexIntangiveis")
        if it and 0 < abs(it) <= 0.5 * capex:
            capex += abs(it)
    op_cf = dur.get("operatingCashFlow")
    fcf = (op_cf - capex) if (op_cf is not None and capex is not None) else None

    revenue = dur.get("revenue")
    nii, nonii = dur.get("bancoJurosLiquidos"), dur.get("bancoReceitaSemJuros")
    if sector == "Financials" and nii is not None and nonii is not None and nii + nonii > 0:
        revenue = nii + nonii
    gross_profit = dur.get("grossProfit")
    # Guardar se o lucro bruto veio TAGGADO pelo emitente ou se foi derivado
    # abaixo: se for derivado de um custo que se venha a descobrir incoerente,
    # tem de cair com ele.
    gp_reportado = gross_profit is not None
    gp_derivado_de_custo = False

    # Fallback: muitas empresas reportam Revenue e CostOfRevenue mas NÃO a tag
    # explícita GrossProfit. Calcular grossProfit = revenue − costOfRevenue
    # recupera a gross margin sem depender dessa única tag XBRL.
    # (Bancos/seguradoras não têm COGS → continua None, que é o correto.)
    cost_of_rev = dur.get("costOfRevenue")
    # Não existe custo das vendas negativo. Vem de tags trocadas ou de um Q4
    # derivado por subtração com bases diferentes; deixá-lo passar arrastava o
    # lucro bruto para cima da receita e partia a identidade GP.
    if cost_of_rev is not None and cost_of_rev < 0:
        cost_of_rev = None

    # Seguradoras que também vendem produtos: o custo é a SOMA das duas linhas.
    #
    # A lista de tags escolhe UMA, com os sinistros no topo por causa da
    # Centene, que é seguradora pura. Mas a CVS e a Cigna reportam as duas
    # coisas, e ficar-se pela primeira dava 69% e 88% de margem bruta em
    # empresas cujo setor inteiro trabalha abaixo dos 20%.
    #
    # Os dois guardas tornam a soma verificável: não pode passar a receita, e
    # o lucro bruto que dela resulta não pode ficar abaixo do resultado
    # operacional — isso significaria despesas operacionais negativas.
    sinistros = dur.get("policyholderClaims")
    custo_produtos = dur.get("costOfProducts")
    if (sinistros and custo_produtos and sinistros > 0 and custo_produtos > 0
            and revenue is not None and revenue > 0
            # AS DUAS metades têm de ser materiais. Sem esta condição a regra
            # apanhava bancos: o Citigroup tagga 87 M de sinistros (0,1% de 72,4
            # mil milhões de receita) ao lado de um custo de serviços residual, e
            # a soma das duas migalhas dava um custo grande que chegue para
            # escapar ao guarda dos 95% — 90% de margem bruta num banco, que é
            # precisamente o que esse guarda existe para apagar.
            #
            # Também protege a seguradora pura: na Centene o custo de produtos é
            # 1,5% da receita, a soma não se aplica, e ficam os sinistros
            # sozinhos, que é o custo dela.
            and sinistros >= 0.05 * revenue
            and custo_produtos >= 0.05 * revenue):
        soma = sinistros + custo_produtos
        op_prov = dur.get("operatingIncome")
        if soma < revenue and (op_prov is None or revenue - soma >= op_prov):
            cost_of_rev = soma
    # REIT cujo "custo" é só o imposto sobre imóveis (REG): não é custo das
    # vendas, e receita − imposto dava margens brutas de ~87% sem significado.
    if (cost_of_rev is not None and dur.get("realEstateTax") is not None
            and abs(cost_of_rev - dur["realEstateTax"]) < 1
            and dur.get("propertyOperatingExpense") is None):
        cost_of_rev = None
    if gross_profit is None and revenue is not None and cost_of_rev is not None:
        gross_profit = revenue - cost_of_rev
        gp_derivado_de_custo = True

    # Correção de revenue bruto-de-excise (IFRS sem tag de excise mapeável):
    # quando gp, cogs e revenue estão TODOS taggados e rev−cogs diverge do gp
    # em >5%, o net revenue verdadeiro é gp+cogs por definição (DEO: "sales"
    # $27.9B incl. excise vs net sales $20.3B = 12.2+8.1). Só encolhe, nunca
    # cresce, e exige coerência (gp+cogs entre 50% e 98% do bruto).
    #
    # SÓ em filers IFRS: em us-gaap os impostos especiais já saem na escolha das
    # tags (ExciseAndSalesTaxes), e aqui a identidade só apanhava custos PARCIAIS —
    # a Caterpillar tagga como custo só o dos produtos (sem serviços financeiros) e
    # a receita do 3T2020 descia de 9.881 para 9.228 M; a TMO e a MO idem.
    if (dur.get("_ifrs") and revenue is not None and cost_of_rev is not None
            and gross_profit is not None and revenue > 0):
        net_rev = gross_profit + cost_of_rev
        if (abs(gross_profit - (revenue - cost_of_rev)) > 0.05 * revenue
                and 0.5 * revenue < net_rev < 0.98 * revenue):
            revenue = net_rev

    # Custo das vendas ACIMA da receita: as duas grandezas não são do mesmo
    # âmbito. A correção de excise acima só sabe ENCOLHER a receita
    # (net_rev < 0.98·revenue), por isso o caso inverso — receita parcial
    # (um segmento) contra custo consolidado — passava incólume. A DLTR de 2023
    # ficava com receita 3.932M contra custo 5.089M, ou seja margem bruta
    # negativa numa retalhista, e daí saíam gráficos de margem a mentir.
    # Não há como saber qual dos dois é o certo, e inventar é pior do que
    # admitir: o custo cai, e com ele o lucro bruto se tiver sido derivado dele.
    # O lucro bruto taggado pelo emitente sobrevive — esse é fonte primária.
    if (revenue is not None and cost_of_rev is not None
            and revenue > 0 and cost_of_rev > revenue):
        cost_of_rev = None
        if not gp_reportado:
            gross_profit = None
            gp_derivado_de_custo = False

    # Custo que CONTRADIZ o lucro bruto reportado pelo emitente: a tag de custo
    # escolhida não é a contraparte daquele lucro bruto. Diferenças de definição
    # (pharma que deixa a amortização de intangíveis fora do custo) ficam abaixo
    # dos 15% da receita; acima de 25% é outra coisa. A Centene, seguradora de
    # saúde, apanhava um CostOfServices residual de 702M contra uma receita de
    # 44.655M — o custo a sério de uma seguradora são os encargos médicos, ~85%
    # dos prémios. O lucro bruto reportado (5.650M, 12,6% de margem) está certo
    # para o setor; o custo é que não é aquele.
    #
    # O lucro bruto taggado é fonte primária e fica. O custo cai para N/A, que
    # é a verdade: não sabemos qual é o custo da receita desta empresa.
    if (gp_reportado and revenue is not None and cost_of_rev is not None
            and gross_profit is not None and revenue > 0
            and abs(gross_profit - (revenue - cost_of_rev)) > 0.25 * revenue):
        cost_of_rev = None

    # ── Level 1 Accounting Integrity ──
    if revenue is not None and gross_profit is not None and gross_profit > revenue:
        # Forçar gp = revenue FABRICAVA um valor: a NiSource ficava com lucro
        # bruto igual à receita (5.053 M) tendo custo das vendas taggado de
        # 1.534 M — margem bruta de 100% numa utility, e a identidade
        # gp = revenue − cogs partida em 13 linhas. Com o custo disponível, o
        # lucro bruto DERIVA-SE; sem ele, fica NULL, que é honesto.
        if cost_of_rev is not None and 0 <= cost_of_rev <= revenue:
            gross_profit = revenue - cost_of_rev
            gp_derivado_de_custo = True
        else:
            gross_profit = None
            gp_derivado_de_custo = False

    if sector == "Financials":
        # Bancos/seguradoras não têm lucro bruto (COGS/GP ficam NULL estrutural).
        gross_profit = None
        gp_derivado_de_custo = False

    op_income = dur.get("operatingIncome")
    op_income_reportado = op_income is not None
    op_income_derivado_de_gp = False

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
        op_income_derivado_de_gp = True
        
    # Não sintetizar grossProfit = op_income + op_expenses quando costOfRevenue
    # não existe (nem em Financials): inventaria margem bruta sem COGS real.
    if (gross_profit is None and cost_of_rev is not None and sector != "Financials"
            and op_income is not None and op_expenses is not None):
        gross_profit = op_income + op_expenses
        gp_derivado_de_custo = True
        # Se a soma ultrapassa a receita, a derivação está errada — normalmente
        # porque as "despesas operacionais" do emitente já incluem o custo da
        # receita. Fixá-la na receita era FABRICAR um número: o lucro bruto
        # passava a ser exactamente a receita e a plataforma anunciava 100 % de
        # margem bruta em gestoras de activos, seguradoras e hospitais — a BEN,
        # a PYPL, a UHS e a ERIE estavam todas assim.
        #
        # Sem custo da receita fiável não há margem bruta para mostrar. N/A é a
        # resposta honesta, e é a regra da casa ("N/A vs 0" no CLAUDE.md).
        # Atenção ao caso DEGENERADO, que era o mais comum: numa empresa sem
        # linha de custo da receita, o emitente reporta
        # `receita − despesas operacionais = resultado operacional`. Somar as
        # duas parcelas reconstrói a receita EXACTAMENTE, e o "lucro bruto"
        # resultante não é informação nenhuma — é a receita outra vez, com
        # outro nome. Daí os 100 % de margem na BEN, PYPL, UHS e ERIE.
        #
        # Por isso o limiar é 99,9 % da receita e não "maior que": o caso que
        # interessa apanhar cai em cima do valor, não acima dele.
        if revenue is not None and revenue > 0 and gross_profit >= 0.999 * revenue:
            gross_profit = None
            gp_derivado_de_custo = False

    # Despesas operacionais que JÁ INCLUEM o custo da receita.
    #
    # A identidade é `lucro bruto − despesas operacionais = resultado
    # operacional`. Quando não fecha, mas fecha com a RECEITA no lugar do lucro
    # bruto, está provado que as despesas do emitente já trazem o custo lá
    # dentro — e o custo da receita extraído é então um subconjunto que não
    # serve para nada.
    #
    # A Exelon é o caso limpo: receita 35 978, despesas 32 143, resultado
    # operacional 3 891. Receita menos despesas dá 3 835, que bate. Mas o lucro
    # bruto (30 987, derivado de um custo de 4 991) menos despesas dá -1 156,
    # que não bate por 5 mil milhões. Resultado: 86 % de margem bruta numa
    # eléctrica, onde o combustível é o maior custo que existe.
    #
    # A Apple passa no teste e fica intacta: 180 683 de lucro bruto menos
    # 57 467 de despesas dá exactamente os 123 216 de resultado operacional.
    #
    # Eram 17 utilities, 13 industriais e 14 imobiliárias com margens acima de
    # 85 %.
    # Margem bruta de 95%+ que NINGUÉM reportou.
    #
    # A UPS aparecia com 96%, a Southern com 96%, o Citigroup com 100%. Nenhuma
    # das três taggou lucro bruto: o valor foi derivado de um custo residual que
    # a tag XBRL apanhou por acaso — 87 M de "custo" contra 85.225 M de receita
    # no caso do Citigroup. Uma transportadora não tem margem bruta de 96%, e um
    # banco não tem margem bruta nenhuma: o conceito não se aplica.
    #
    # A regra é deliberadamente cega ao setor, porque o setor não é o problema —
    # o problema é derivar uma grandeza a partir de um custo que não é o custo.
    # Quem reporta a rubrica sobrevive: o emitente que taggou GrossProfit está a
    # afirmá-lo, e aí 97% é uma afirmação dele e não uma inferência nossa.
    #
    # Custa algumas margens verdadeiras (há REITs triple-net genuinamente nos
    # 99%), e é um preço que se paga: um N/A é honesto, 96% na UPS é falso.
    if (not gp_reportado and gross_profit is not None
            and revenue is not None and revenue > 0
            and gross_profit >= 0.95 * revenue):
        gross_profit = None
        gp_derivado_de_custo = False

    if (gross_profit is not None and op_expenses is not None
            and op_income is not None and revenue is not None and revenue > 0):
        tol = 0.02 * revenue
        fecha_com_lucro_bruto = abs(gross_profit - op_expenses - op_income) <= tol
        fecha_com_receita = abs(revenue - op_expenses - op_income) <= tol
        if fecha_com_receita and not fecha_com_lucro_bruto:
            gross_profit = None
            gp_derivado_de_custo = False

    if gross_profit is None and op_income_derivado_de_gp and not op_income_reportado:
        op_income = None
        op_income_derivado_de_gp = False

    net_income = dur.get("netIncome")
    # Para reconstruções acima do lucro (ver DURATION_TAGS["netIncomeParent"]).
    ni_pre = dur.get("netIncomeParent")
    if ni_pre is None:
        ni_pre = net_income
    tax_expense = dur.get("taxExpense")
    total_assets = inst.get("totalAssets")
    curr_liab = inst.get("totalCurrentLiab")
    
    total_debt = inst.get("totalDebt")
    # Guard CVNA-class: um "total" direto MENOR que a própria LTD só pode ser
    # uma linha parcial (ex.: LongTermDebtAndCapitalLeaseObligations a cobrir
    # apenas leases, $96M vs LTD $342M) — descartar e deixar a cascata somar.
    if total_debt is not None:
        ltd_probe = inst.get("longTermDebt")
        if ltd_probe is not None and total_debt < ltd_probe - 1e6:
            total_debt = None
    # LongTermDebtAndCapitalLeaseObligations é só o NÃO corrente (SRE: 28 979 M
    # na linha "Long-term debt and finance leases", com o curto prazo à parte).
    # Usado como total, perdia a dívida corrente: soma-se a parte corrente.
    if total_debt is not None and inst.get("totalDebt_tag") == "LongTermDebtAndCapitalLeaseObligations":
        cur = max((inst.get("debtCurrentTotal") or 0),
                  (inst.get("longTermDebtCurrent") or inst.get("ltdLeaseCurrent") or 0)
                  + (inst.get("shortTermDebt") or inst.get("commercialPaper") or 0))
        total_debt = total_debt + cur
    # REIT com dívida em duas linhas: notes (NotesPayable) + hipotecas
    # (SecuredDebt). O NotesPayable sozinho deixava as hipotecas de fora
    # (KIM: 7 965 M + 496 M de "Mortgages payable" — auditoria Gemini 18/11).
    # "LTD incluindo maturidades correntes" não inclui os empréstimos de curto
    # prazo (ShortTermBorrowings/papel comercial): USB 2024 58.002M + 15.518M
    # = 73.520M, como no balanço (auditoria Gemini 19/11).
    if (total_debt is not None
            and inst.get("totalDebt_tag") == "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"):
        st_extra = inst.get("shortTermDebt") or inst.get("commercialPaper")
        if st_extra and 0 < st_extra < total_debt:
            total_debt = total_debt + st_extra
    if (total_debt is not None and sector == "Real Estate" and inst.get("totalDebt_tag") == "NotesPayable"
            and (inst.get("securedDebt") or 0) > 0 and inst["securedDebt"] < total_debt
            # CPT/MAA: aí NotesPayable = garantida + não garantida; só se soma
            # quando as notes são só a parte não garantida (ou não há essa tag).
            and (inst.get("unsecuredDebt") is None
                 or abs(total_debt - inst["unsecuredDebt"]) <= 0.01 * total_debt)):
        total_debt = total_debt + inst["securedDebt"]
    ltd_missing_guard = False
    if total_debt is None:
        # Nível 1: somar current + noncurrent (longTermDebt + longTermDebtCurrent + shortTermDebt/commercialPaper)
        # Bug fix: distinguir "tag ausente" (None) de "tag presente com valor 0" — CMG tem LongTermDebt=0.0
        ltd_nc = inst.get("longTermDebt")
        ltd_c = inst.get("longTermDebtCurrent")
        st = inst.get("shortTermDebt") or inst.get("commercialPaper")
        dc_total = inst.get("debtCurrentTotal")  # DebtCurrent = total corrente reportado
        # Dívida corrente sem dupla contagem: DebtCurrent JÁ inclui a porção
        # corrente da LTD + ST, por isso NUNCA se soma com os componentes — usa-se
        # o MAIOR entre o total reportado e a soma dos componentes (o max protege
        # contra sub-contagem se o DebtCurrent do emissor for parcial).
        current_debt = max((dc_total or 0), (ltd_c or 0) + (st or 0))
        if ltd_nc is not None or ltd_c is not None or st is not None or dc_total is not None:
            # Guard JPM/DE-class: se a empresa JÁ taggou dívida LT nalgum período
            # mas não neste (bancos ou industriais cuja LTD só vem dimensionada/custom),
            # gravar só a dívida corrente (DebtCurrent/ST/LTDcurrent) daria um total parcial.
            if ltd_nc is None and evidence.get("has_ltd_ever"):
                total_debt = None
                ltd_missing_guard = True
            else:
                total_debt = (ltd_nc or 0) + current_debt
    if total_debt is None:
        # Nível 2: valor de face da dívida emitida (empresas sem tags de componentes, ex: META)
        total_debt = inst.get("debtInstrumentCarryingAmount")
    if total_debt is None and not (ltd_missing_guard and sector != "Real Estate"):
        # Nível 3: dívida secured + unsecured (REITs reportam assim em vez de current/noncurrent)
        secured = inst.get("securedDebt")
        unsecured = inst.get("unsecuredDebt")
        if secured is not None or unsecured is not None:
            total_debt = (secured or 0) + (unsecured or 0)
    sinal = dur.get("sinalDivida")
    tem_sinal_divida = sinal is not None and abs(sinal) > 5e6
    if (total_debt is None and sector != "Financials" and not evidence.get("has_ltd_ever")
            and not tem_sinal_divida):
        # Debt-free comprovado (MPWR-class): a empresa NUNCA taggou dívida LT
        # em filing nenhum E não há qualquer componente de borrowing neste
        # período → 0.0 é a verdade, não um buraco. (Financials excluídos:
        # bancos têm dívida dimensionada invisível; has_ltd_ever=True idem.)
        if all(inst.get(k) is None for k in
               ("longTermDebt", "longTermDebtCurrent", "shortTermDebt",
                "debtCurrentTotal", "commercialPaper", "debtInstrumentCarryingAmount",
                "securedDebt", "unsecuredDebt")):
            total_debt = 0.0
    # A empresa já reportou dívida de longo prazo noutros anos mas não neste
    # (passou a vir só com dimensões): os componentes bancários (FHLB, linha de
    # crédito…) seriam só uma fatia — AMP ficava com 200 M de 5,9 mil M. N/A.
    if total_debt is None and sector == "Financials" and not ltd_missing_guard:
        # Nível 4 (bancos/seguradoras): borrowed funds por componentes — FHLB
        # advances, subordinated debt, other borrowings, linha de crédito
        # sacada + curto prazo/CP/porção corrente. Exige pelo menos um
        # componente estrutural (core) para não recriar o total-só-ST que o
        # guard JPM-class anula. Deposits de clientes NUNCA entram aqui.
        core = [inst.get("fhlbAdvances"), inst.get("subordinatedDebtBank"),
                inst.get("otherBorrowingsBank"), inst.get("lineOfCredit")]
        if any(c is not None for c in core):
            # Corrente sem dupla contagem (idem build_row nível 1): max entre o
            # DebtCurrent reportado e a soma dos componentes correntes.
            cur_part = max(
                (inst.get("debtCurrentTotal") or 0),
                sum(c for c in (inst.get("shortTermDebt"), inst.get("commercialPaper"),
                                inst.get("longTermDebtCurrent")) if c is not None),
            )
            composite = sum(c for c in core if c is not None) + cur_part
            # Compósito 0 (ex.: ACGL com LoC=0 mas senior notes só
            # dimensionadas) seria um zero fabricado — fica NULL honesto.
            total_debt = composite if composite > 0 else None

    cash = inst.get("cash")
    restrita = inst.get("restrictedCash")
    if (cash is not None and restrita and 0 < restrita < cash and sector != "Financials"
            and "RestrictedCash" in (inst.get("cash_tag") or "")):
        cash = cash - restrita
    # Seguradora pela ATIVIDADE, não pelo setor: a Humana, a Elevance, a Cigna e a
    # Centene estão em Health Care, mas os sinistros são a maior parte da receita e
    # os "investimentos" do balanço são a carteira que os cobre (HUM 2025: 15,7 mM
    # somados a 4,2 mM de caixa). Material = sinistros ≥30% da receita.
    claims = dur.get("policyholderClaims")
    seguradora = bool(claims and revenue and revenue > 0 and claims >= 0.3 * revenue)
    caixa_base = cash
    if cash is not None:
        # Bancos/seguradoras: "AvailableForSaleSecurities" é a carteira de
        # investimento (PNC 2018: 63 mil M somados a 5,6 mil M de caixa), não caixa.
        # Mas a Visa/Mastercard (também "Financials") têm aplicações de tesouraria
        # normais: nas financeiras só entram quando são menores do que a caixa.
        marketable = inst.get("marketableSecuritiesCurrent") or 0
        if sector == "Financials" and marketable >= cash:
            marketable = 0
        if seguradora:
            marketable = 0
        if (not marketable and sector != "Financials" and claims is None
                and inst.get("outrasAplicacoesCurto")):
            marketable = inst["outrasAplicacoesCurto"]
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
    # Só existe o total COM minoritários (HAS): o capital próprio da BullValue é
    # o dos acionistas da empresa, por isso tiram-se os minoritários (19/11).
    if (total_equity is not None and inst.get("totalEquity_tag") in
            ("StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "Equity")):
        mi = inst.get("minorityInterestInst")
        if mi and 0 < mi < abs(total_equity):
            total_equity = total_equity - mi

    # Resultado operacional DERIVADO (a empresa não o publica) que não bate com o
    # EBIT reconstruído de baixo — lucro antes de impostos + juros − outros proveitos
    # não operacionais: as "despesas" encontradas não eram as operacionais. A ADP
    # não tem linha de resultado operacional e o total de despesas dela leva juros:
    # o 1T FY25 dava −87 M com 1.236 M de lucro antes de impostos; o EBIT é 1.272 M.
    if (not op_income_reportado and op_income is not None and revenue and revenue > 0
            and sector not in ("Financials", "Real Estate")):
        _ebit = ebit_de_baixo(dur, ni_pre, tax_expense)
        if _ebit is not None and abs(op_income - _ebit) > 0.10 * revenue:
            op_income = _ebit

    gross_margin = plausivel(safe_div(gross_profit, revenue), -1.0, 1.0)
    op_margin = plausivel(safe_div(op_income, revenue), -10.0, 2.0)
    net_margin = plausivel(safe_div(net_income, revenue), -10.0, 2.0)

    roic = None
    if op_income is not None and total_assets is not None:
        if net_income is not None and tax_expense is not None:
            pre_tax = ni_pre + tax_expense
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
        roic = plausivel(safe_div(nopat, inv_cap) if inv_cap > 0 else None, -2.0, 2.0)

    roe = plausivel(safe_div(net_income, total_equity) if total_equity and total_equity > 0 else None, -5.0, 5.0)

    # Só bancos e seguradoras: corretoras de seguros (MRSH), bolsas (CME),
    # gestoras (BX) e redes de pagamento (V, MA) também são "Financials", mas
    # têm EBITDA com o significado de sempre (auditoria 19/11).
    banco_ou_seguradora = sector == "Financials" and (
        dur.get("bancoJurosLiquidos") is not None or dur.get("policyholderClaims") is not None)
    if banco_ou_seguradora:
        # EBITDA não tem significado económico para bancos/seguradoras (juros
        # SÃO o negócio, não um custo de financiamento a excluir). Sintetizá-lo
        # produzia um número que nenhum analista usaria → NULL estrutural,
        # whitelisted como SECTOR_NO_EBITDA_BANK; a UI esconde o card.
        ebitda = None
    else:
        # Fórmula única alinhada com a FMP (EBT + juros + D&A); a tag ebitda
        # reportada pela empresa é non-GAAP e não comparável. Sem D&A explícito
        # fica None (não somar zero às escondidas).
        da = melhor_da(dur)
        interest_exp = dur.get("interestExpense")
        if interest_exp is None and (dur.get("jurosLiquidosNaoOp") or 0) < 0:
            interest_exp = -dur["jurosLiquidosNaoOp"]
        ibt = dur.get("incomeBeforeTax")
        if da is None:
            ebitda = None
        elif ibt is not None:
            ebitda = ibt + (interest_exp or 0) + da
        elif net_income is not None and tax_expense is not None and interest_exp is not None:
            ebitda = ni_pre + tax_expense + interest_exp + da
        elif op_income is not None:
            ebitda = op_income + da
        else:
            ebitda = None

    # Política evidência-de-ausência ao ANO (v2, fim do "paradoxo da Apple"):
    # o período cai num ano com QUALQUER facto de dividendo >0 no XBRL?
    #  - não → 0.0 é a verdade (META pré-2024, cortes, especiais fora do ano);
    #  - sim → um DPS em falta é gap de extração e fica NULL (N/A). Forçar
    #    0.0 nesses anos mascarava buracos como "não paga dividendos".
    div_years = evidence.get("dividend_fact_years")
    if div_years is None:
        in_paying_year = True  # sem evidência calculada: nunca fabricar zeros
    else:
        try:
            in_paying_year = int(str(period_end)[:4]) in set(div_years)
        except (ValueError, TypeError):
            in_paying_year = bool(div_years)

    # Guard: alguns filings tagham DPS em unidades erradas (ex.: STX "2770000"
    # em vez de 2.77 — milionésimos). Nenhuma empresa do S&P 500 paga >$1000/ação;
    # valores acima disso são bugs de escala (reduzir 1000x até plausível, senão N/A).
    dps = dur.get("dividendPerShare")
    if dps is None:
        dps = None if in_paying_year else 0.0
    else:
        for _ in range(3):
            if abs(dps) <= 1000:
                break
            dps /= 1000
        if abs(dps) > 1000:
            dps = None if in_paying_year else 0.0
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
            if ni_pre is not None:
                tax = tax_expense or 0.0
                op_income = ni_pre + tax
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

    # --- 3-STATEMENT DETAILED FINANCIAL LINE ITEMS ---
    # Income Statement details
    income_before_tax = dur.get("incomeBeforeTax")
    if income_before_tax is None and ni_pre is not None and tax_expense is not None:
        income_before_tax = ni_pre + tax_expense

    net_interest_income = dur.get("netInterestIncome")
    other_non_operating = dur.get("otherNonOperatingIncome")
    da_val = melhor_da(dur)

    # Balance Sheet details
    total_curr_assets = inst.get("totalCurrentAssets")
    accts_receivable = inst.get("accountsReceivable")
    inv = inst.get("inventory")
    ppe = inst.get("propertyPlantEquipment")
    
    gw_int = inst.get("goodwillAndIntangibles")
    if gw_int is None:
        gw = inst.get("goodwillOnly")
        intang = inst.get("intangiblesOnly")
        if gw is not None or intang is not None:
            gw_int = (gw or 0) + (intang or 0)

    accts_payable = inst.get("accountsPayable")
    st_debt = inst.get("shortTermDebt") or inst.get("longTermDebtCurrent") or inst.get("commercialPaper")
    
    tot_liab = inst.get("totalLiabilities")
    if tot_liab is None and total_assets is not None and total_equity is not None:
        # 18/11: exigir o mesmo filing (accession) para os dois corrigia a STLA
        # 2019 (fusão reversa FCA/PSA) mas deixava ~2 900 períodos sem passivo:
        # na maioria o ativo e o capital vêm de filings diferentes por razões
        # normais (o 10-K seguinte repete o ano anterior). Deriva-se sempre; os
        # casos de entidade trocada vão para scripts/correcoes.json.
        eq_total = inst.get("equityInclNci")
        if eq_total is None or eq_total < total_equity - 1e6:
            eq_total = total_equity + max(inst.get("minorityInterestInst") or 0, 0)
        tot_liab = total_assets - eq_total - max(inst.get("temporaryEquity") or 0, 0)

    ret_earnings = inst.get("retainedEarnings")

    # Cash Flow details
    inv_cf = dur.get("investingCashFlow")
    fin_cf = dur.get("financingCashFlow")
    sbc = dur.get("stockBasedCompensation")
    
    share_repurchases_raw = dur.get("shareRepurchases")
    share_repurchases = abs(share_repurchases_raw) if share_repurchases_raw is not None else None
    
    divs_paid_raw = dur.get("dividendsPaid")
    divs_paid = abs(divs_paid_raw) if divs_paid_raw is not None else None
    
    net_change_cash = dur.get("netChangeInCash")
    if net_change_cash is None and op_cf is not None and inv_cf is not None and fin_cf is not None:
        net_change_cash = op_cf + inv_cf + fin_cf

    return {
        "id": new_id(),
        "companyId": company_id,
        "periodType": period_type,
        "fiscalYear": fy,
        "fiscalQuarter": fiscal_quarter,
        "periodEnd": period_end,
        "filedAt": filed_at,
        "revenue": revenue,
        # cost_of_rev e NÃO dur.get("costOfRevenue"): o valor cru ignorava toda a
        # limpeza feita acima. O guard de custo negativo estava escrito desde
        # sempre mas só afectava o lucro bruto derivado — o custo em si era
        # gravado cru, e a BD tinha 2 linhas com custo negativo e 90 com custo
        # acima da receita a provar isso mesmo.
        "costOfRevenue": cost_of_rev,
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
        "_notaCapex": nota_capex,
        # Só para o validador (não vão para a BD): o balanço fecha com eles.
        "_minoritarios": inst.get("minorityInterestInst"),
        "_capitalTotal": inst.get("equityInclNci"),
        "_capitalTemporario": inst.get("temporaryEquity"),
        # Para a caixa lida do balanço impresso (process_company → aplicacoes_balanco).
        "_caixaBase": caixa_base,
        "_aplicacoesBloqueadas": seguradora or sector == "Financials",
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
        "depreciationAndAmortization": da_val,
        "incomeBeforeTax": income_before_tax,
        "netInterestIncome": net_interest_income,
        "otherNonOperatingIncome": other_non_operating,
        "totalCurrentAssets": total_curr_assets,
        "accountsReceivable": accts_receivable,
        "inventory": inv,
        "propertyPlantEquipment": ppe,
        "goodwillAndIntangibles": gw_int,
        "accountsPayable": accts_payable,
        "shortTermDebt": st_debt,
        "totalLiabilities": tot_liab,
        "retainedEarnings": ret_earnings,
        "investingCashFlow": inv_cf,
        "financingCashFlow": fin_cf,
        "stockBasedCompensation": sbc,
        "shareRepurchases": share_repurchases,
        "dividendsPaid": divs_paid,
        "netChangeInCash": net_change_cash,
        "_gp_derivado_custo": gp_derivado_de_custo and gross_profit is not None,
        "_op_inc_derivado_custo": op_income_derivado_de_gp and gp_derivado_de_custo and op_income is not None,
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
            "sellingGeneralAndAdmin", "ebitda",
            "depreciationAndAmortization", "incomeBeforeTax", "netInterestIncome",
            "otherNonOperatingIncome", "totalCurrentAssets", "accountsReceivable",
            "inventory", "propertyPlantEquipment", "goodwillAndIntangibles",
            "accountsPayable", "shortTermDebt", "totalLiabilities", "retainedEarnings",
            "investingCashFlow", "financingCashFlow", "stockBasedCompensation",
            "shareRepurchases", "dividendsPaid", "netChangeInCash"
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



def realinhar_rotulos_de_calendario(periods_data: list[dict]) -> int:
    """
    Ano e trimestre fiscais de quem fecha o ano em dezembro.

    Os campos `fy`/`fp` das companyfacts descrevem a FILING, não o período que
    a filing reporta. Na Amazon esse desencontro valia um trimestre inteiro de
    desfasamento: o período que acaba a 30 de junho de 2025 ficava etiquetado
    Q1 de 2026, e o ano fechado a 31 de dezembro de 2025 ficava FY2026.

    Quando o ano fiscal coincide com o civil, o rótulo não precisa de ser
    inferido — lê-se da data. Recuar 15 dias antes de ler o ano e o trimestre
    absorve os calendários de 52/53 semanas, em que o trimestre fecha uns dias
    dentro do mês seguinte: a J&J fechou o Q1 de 2016 a 3 de abril, e ler o mês
    diretamente far-lhe-ia Q2.

    Empresas com fecho fora de dezembro (Apple em setembro, Walmart em janeiro)
    ficam de fora: aí o ano fiscal e o civil divergem de propósito, e a data
    sozinha não diz qual é qual.
    """
    anuais = [p for p in periods_data
              if p.get("periodType") == "ANNUAL" and p.get("periodEnd")]
    if len(anuais) < 3:
        return 0

    meses = [int(str(p["periodEnd"])[5:7]) for p in anuais]
    if max(set(meses), key=meses.count) != 12:
        return 0

    novos = []
    for p in periods_data:
        pe = p.get("periodEnd")
        if not pe:
            # Sem data não há rótulo a derivar, e deixar esta linha com o
            # rótulo antigo ao lado das realinhadas convidava a uma colisão.
            return 0
        d = (datetime.date.fromisoformat(str(pe)[:10])
             - datetime.timedelta(days=15))
        q = ((d.month - 1) // 3 + 1) if p.get("periodType") == "QUARTERLY" else None
        novos.append((p, d.year, q))

    # Duas linhas a cair na mesma chave única violariam
    # @@unique([companyId, periodType, fiscalYear, fiscalQuarter]). Abortar em
    # bloco é melhor do que realinhar metade e deixar a empresa incoerente.
    chaves = [(p["periodType"], fy, q) for p, fy, q in novos]
    if len(set(chaves)) != len(chaves):
        return 0

    mudadas = 0
    for p, fy, q in novos:
        if p.get("fiscalYear") != fy or p.get("fiscalQuarter") != q:
            p["fiscalYear"] = fy
            p["fiscalQuarter"] = q
            mudadas += 1
    return mudadas


def corrigir_escala_de_dividendos(periods_data: list[dict]) -> int:
    """
    Dividendo por ação numa unidade que não é a das outras linhas da empresa.

    Dois erros com a mesma aparência. A Rockwell aparecia com 835 $/ação em dois
    trimestres de 2018, quando o dividendo real era 0,835 — a tag vinha 1000×
    acima. A BAT e a GSK, ADRs britânicas, reportavam em PENCE nas filings até
    2019: 243,20 é 243,20p, ou seja 2,43 £, e a conversão GBP→USD multiplicava
    o erro em vez de o apanhar (a unidade dizia "GBP", só o valor é que estava
    em centésimos).

    O que distingue um erro de unidade de um dividendo extraordinário a sério é
    a REPETIÇÃO. Uma convenção de tagging errada persiste de filing para filing;
    um extraordinário acontece uma vez. A Keurig Dr Pepper distribuiu 103,75 $
    por ação num único trimestre de 2018 como contrapartida da fusão — valor
    verdadeiro, 700× a norma dela, e que tem de sobreviver a esta função.

    Por isso: só corrige quando há DOIS OU MAIS períodos fora de escala, e só
    pelo fator exato (100 ou 1000) que traz o valor para junto da norma.
    """
    from collections import defaultdict

    por_tipo = defaultdict(list)
    for p in periods_data:
        v = p.get("dividendPerShare")
        if v and v > 0:
            por_tipo[p.get("periodType")].append(p)

    def mediana_de(tipo):
        periodos = por_tipo.get(tipo) or []
        if len(periodos) < 6:
            return None
        valores = sorted(p["dividendPerShare"] for p in periodos)
        m = valores[len(valores) // 2]
        return m if m > 0 else None

    # Trimestres e anos têm normas diferentes (um ano são quatro trimestres);
    # comparar entre eles alargaria a banda até ela não discriminar nada.
    med_anual = mediana_de("ANNUAL")
    med_trim = mediana_de("QUARTERLY")

    # Quando um dos grupos não tem períodos suficientes para formar norma
    # própria, empresta-se a do outro com o fator de escala entre eles. A BAT
    # tem exatamente DUAS linhas trimestrais com dividendo — e ambas em pence,
    # portanto a norma que saísse delas seria a do próprio erro.
    if med_trim is None and med_anual is not None:
        med_trim = med_anual / 4
    if med_anual is None and med_trim is not None:
        med_anual = med_trim * 4

    referencia = {"ANNUAL": med_anual, "QUARTERLY": med_trim}

    corrigidos = 0
    for tipo, periodos in por_tipo.items():
        mediana = referencia.get(tipo)
        if mediana is None:
            continue

        fora = [p for p in periodos if p["dividendPerShare"] >= 50 * mediana]
        if len(fora) < 2:
            continue

        for p in fora:
            v = p["dividendPerShare"]
            for fator in (1000, 100):
                candidato = v / fator
                if 0.4 * mediana <= candidato <= 2.5 * mediana:
                    p["dividendPerShare"] = candidato
                    corrigidos += 1
                    break

    return corrigidos


def descartar_custo_incoerente(periods_data: list[dict]) -> int:
    """
    Custo das vendas que contradiz a própria empresa.

    A Deere reporta custo a ~75% da receita em quase todos os períodos e a 0,6%
    em oito — não mudou de negócio, mudou de tag XBRL. O mesmo acontece à UPS,
    à Southern, à Regeneron e a mais uma dúzia, e daí saíam margens brutas de
    99% em empresas industriais.

    Um limiar global não serve de discriminador: a Booking tem custo a 2% da
    receita em TODOS os períodos, e aí os 2% são verdade. O que distingue um
    caso do outro não é o valor, é a incoerência — por isso a referência é a
    mediana da própria empresa.

    Só se pronuncia sobre empresas que TÊM um custo com expressão (mediana
    acima de 10% da receita). Abaixo disso não há norma contra a qual comparar,
    e calar-se é melhor do que adivinhar.
    """
    racios = []
    for p in periods_data:
        rev, cogs = p.get("revenue"), p.get("costOfRevenue")
        if rev and cogs and rev > 0 and cogs > 0:
            racios.append(cogs / rev)

    # Menos de seis períodos não fazem uma norma — uma mediana de três valores
    # muda de sítio com uma linha errada.
    if len(racios) < 6:
        return 0

    racios.sort()
    mediana = racios[len(racios) // 2]
    if mediana < 0.10:
        return 0

    limite = mediana / 5
    descartados = 0
    for p in periods_data:
        rev, cogs = p.get("revenue"), p.get("costOfRevenue")
        if not (rev and cogs and rev > 0 and cogs > 0):
            continue
        if cogs / rev >= limite:
            continue

        gp = p.get("grossProfit")
        # O lucro bruto e o operatingIncome só caem se tiverem SIDO DERIVADOS
        # deste custo. Um valor reportado pelo emitente sobrevive ao custo.
        derivado = p.get("_gp_derivado_custo")
        if derivado is None:
            derivado = gp is not None and abs(gp - (rev - cogs)) <= 0.01 * rev
        op_inc_derivado = p.get("_op_inc_derivado_custo")
        if op_inc_derivado is None:
            opinc = p.get("operatingIncome")
            opex = p.get("operatingExpenses")
            op_inc_derivado = (
                derivado
                and opinc is not None
                and opex is not None
                and gp is not None
                and abs(opinc - (gp - opex)) <= 0.01 * rev
            )
        p["costOfRevenue"] = None
        if derivado:
            p["grossProfit"] = None
            p["grossMargin"] = None
        if op_inc_derivado:
            p["operatingIncome"] = None
            p["operatingMargin"] = None
            p["roic"] = None
        descartados += 1

    return descartados


def corrigir_escala_de_acoes(periods_data: list[dict]) -> int:
    """Repõe linhas soltas com o nº de ações em MILHARES em vez de unidades.

    O guard do build_row usa netIncome/epsDiluted como referência, mas quando a
    filing não reporta EPS não há referência nenhuma — e 1,25 milhões de acções
    passa no piso de 100 mil. O EPS é depois derivado a partir desse valor e sai
    um número absurdo: a COP no 1T de 2017 ficava com EPS de 469 dólares, a ROL
    com 97, a DLR com 257.

    Aqui a referência é a PRÓPRIA série da empresa, que só existe depois de
    todos os períodos estarem carregados. Uma linha mil vezes abaixo da mediana
    das outras não é uma empresa diferente — é a mesma empresa com a escala
    trocada.

    Conservador de propósito: só corrige quando multiplicar por mil aterra
    perto da mediana (dentro de 30 %). Uma empresa que fez um agrupamento de
    acções a sério não encaixa nesse teste e fica intacta. A NVR, que tem
    mesmo 3,3 milhões de acções e EPS de 500 dólares, também não é tocada —
    porque a série dela é consistente e a mediana acompanha.
    """
    # A referência são os períodos VIZINHOS, não a mediana de toda a série: uma
    # empresa que emitiu acções muda de patamar, e a mediana global fica presa
    # ao patamar antigo. A ECHO passou de 84 para 270 milhões de acções — a
    # linha estragada encaixava nos vizinhos (272 M) e falhava contra a mediana.
    ordenados = sorted(
        [p for p in periods_data if p.get("periodEnd")],
        key=lambda p: str(p["periodEnd"]),
    )
    if len(ordenados) < 4:
        return 0

    corrigidas = 0
    for i, p in enumerate(ordenados):
        s = p.get("sharesOutstanding")
        if not s or s <= 0:
            continue

        # Até quatro vizinhos de cada lado, saltando os que não têm valor.
        perto = [
            v["sharesOutstanding"]
            for v in ordenados[max(0, i - 4): i + 5]
            if v is not p and v.get("sharesOutstanding") and v["sharesOutstanding"] > 0
        ]
        if len(perto) < 3:
            continue
        perto.sort()
        ref = perto[len(perto) // 2]

        if s >= ref / 100:
            continue
        candidato = s * 1000
        if 0.7 * ref <= candidato <= 1.3 * ref:
            p["sharesOutstanding"] = candidato
            # O EPS que tenha sido derivado deste nº de acções vem mil vezes
            # inflacionado e tem de acompanhar.
            if p.get("epsDiluted") is not None:
                p["epsDiluted"] = p["epsDiluted"] / 1000
            corrigidas += 1

    return corrigidas


def aplicar_splits_por_evento(ticker: str | None, dur_map: dict, inst_map: dict) -> None:
    """Ajusta ações (× F), EPS (÷ F) e DPS (÷ F) por eventos em `splits_eventos.json`.

    Usa a data `filed` do facto XBRL escolhido para cada campo (um 10-K entregue
    depois do split já vem reexpresso pela empresa, logo F só acumula splits
    desde 2000 com `data > filed`). Corre ANTES de `synthesize_q4` e `build_row`
    para que valores derivados (ex.: EPS/ações/DPS de Q4) partam já da base
    atual ajustada.
    """
    if not ticker:
        return
    if not carregar_splits_eventos().get(ticker):
        return

    for dur in dur_map.values():
        if dur.get("sharesOutstandingDur") is not None:
            f_sh = fator_split_para_filed(ticker, dur.get("sharesOutstandingDur_filed"))
            if f_sh != 1.0:
                dur["sharesOutstandingDur"] = dur["sharesOutstandingDur"] * f_sh

        if dur.get("epsDiluted") is not None:
            f_eps = fator_split_para_filed(ticker, dur.get("epsDiluted_filed"))
            dur["_eps_split_fator"] = f_eps
            if f_eps != 1.0:
                dur["epsDiluted"] = dur["epsDiluted"] / f_eps

        parts = dur.get("dividendPerShare_parts")
        if parts:
            dur["dividendPerShare"] = sum(
                (v / fator_split_para_filed(ticker, pf) if fator_split_para_filed(ticker, pf) != 1.0 else v)
                for v, pf in parts
            )
        elif dur.get("dividendPerShare") is not None:
            f_dps = fator_split_para_filed(ticker, dur.get("dividendPerShare_filed"))
            if f_dps != 1.0:
                dur["dividendPerShare"] = dur["dividendPerShare"] / f_dps

    for inst in inst_map.values():
        if inst.get("sharesOutstandingInst") is not None:
            f_inst = fator_split_para_filed(ticker, inst.get("sharesOutstandingInst_filed"))
            if f_inst != 1.0:
                inst["sharesOutstandingInst"] = inst["sharesOutstandingInst"] * f_inst


ADS_RACIOS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ads_racios.json")
_ADS_CACHE: dict | None = None


def racio_ads(ticker: str | None) -> float:
    """Ações ordinárias por 1 ADS cotado nos EUA (1.0 se não for ADS ou não estiver na tabela).

    O XBRL dos 20-F dá EPS e DPS por AÇÃO ORDINÁRIA; o preço que a plataforma
    mostra é o do ADS. Sem converter, o P/E da HSBC (1 ADS = 5 ordinárias) saía
    5× errado. Tabela em scripts/ads_racios.json, com a frase da capa do 20-F
    como fonte de cada rácio (recolhida a 2026-11-18).
    """
    global _ADS_CACHE
    if _ADS_CACHE is None:
        try:
            with open(ADS_RACIOS_PATH, encoding="utf-8") as f:
                _ADS_CACHE = json.load(f).get("empresas", {})
        except (OSError, ValueError):
            _ADS_CACHE = {}
    info = _ADS_CACHE.get(ticker or "") or {}
    if info.get("tipo") != "ADS":
        return 1.0
    try:
        r = float(info.get("racio") or 1)
    except (TypeError, ValueError):
        return 1.0
    return r if r > 0 else 1.0


def aplicar_racio_ads(ticker: str | None, dur_map: dict, inst_map: dict) -> None:
    """Passa EPS, DPS e ações para a base do ADS: EPS × r, DPS × r, ações ÷ r.

    Basta o rácio ATUAL para todo o histórico: a SEC reporta sempre por ação
    ordinária, e a base que interessa é a do ADS de hoje (a do preço). As
    mudanças históricas de rácio (Ryanair 5→2 em 2024) só afetariam preços
    antigos do ADS, não estes números. Corre depois dos splits e antes de
    synthesize_q4/build_row, para os derivados (EPS do Q4 = lucro/ações) já
    nascerem na base do ADS.
    """
    r = racio_ads(ticker)
    if r == 1.0:
        return
    for dur in dur_map.values():
        if dur.get("sharesOutstandingDur") is not None:
            dur["sharesOutstandingDur"] = dur["sharesOutstandingDur"] / r
        if dur.get("epsDiluted") is not None:
            dur["epsDiluted"] = dur["epsDiluted"] * r
        if dur.get("dividendPerShare") is not None:
            dur["dividendPerShare"] = dur["dividendPerShare"] * r
    for inst in inst_map.values():
        if inst.get("sharesOutstandingInst") is not None:
            inst["sharesOutstandingInst"] = inst["sharesOutstandingInst"] / r


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
            "depreciationAndAmortization", "incomeBeforeTax", "netInterestIncome", "otherNonOperatingIncome",
            "totalCurrentAssets", "accountsReceivable", "inventory", "propertyPlantEquipment",
            "goodwillAndIntangibles", "accountsPayable", "shortTermDebt", "totalLiabilities", "retainedEarnings",
            "investingCashFlow", "financingCashFlow", "stockBasedCompensation", "shareRepurchases", "dividendsPaid", "netChangeInCash",
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
            %(depreciationAndAmortization)s, %(incomeBeforeTax)s, %(netInterestIncome)s, %(otherNonOperatingIncome)s,
            %(totalCurrentAssets)s, %(accountsReceivable)s, %(inventory)s, %(propertyPlantEquipment)s,
            %(goodwillAndIntangibles)s, %(accountsPayable)s, %(shortTermDebt)s, %(totalLiabilities)s, %(retainedEarnings)s,
            %(investingCashFlow)s, %(financingCashFlow)s, %(stockBasedCompensation)s, %(shareRepurchases)s, %(dividendsPaid)s, %(netChangeInCash)s,
            NOW(), NOW()
        )
        """,
        row,
    )


def derive_q4_dps(fy_dps: float, q_dps: list[float]) -> float | None:
    """Q4 DPS = FY − ΣQ1..3, com alinhamento de base de split."""
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
    SUBTRACTIVE = [
        "revenue", "costOfRevenue", "grossProfit", "operatingExpenses",
        "policyholderClaims", "costOfProducts",
        "operatingIncome", "interestExpense", "taxExpense", "netIncome", "netIncomeParent",
        "operatingCashFlow", "capex", "researchAndDevelopment",
        # "ebitda" retirado de SUBTRACTIVE: passou a ser calculado em build_row a partir dos componentes (já sintetizados).
        "sellingGeneralAndAdmin", "depreciationAndAmortization",
        "incomeBeforeTax", "netInterestIncome", "otherNonOperatingIncome",
        "investingCashFlow", "financingCashFlow", "stockBasedCompensation",
        "shareRepurchases", "dividendsPaid", "netChangeInCash",
        "daDDA", "daDA", "daDep", "daAmortInt", "jurosLiquidosNaoOp",
        "capexPPE", "capexSoftware", "capexIntangiveis",
        # ⚠️ NÃO REMOVER: sem isto o Q4 de DPS nunca é derivado e os payers
        # ficam com buraco no Q4 (paradoxo da Apple). O ramo per-share abaixo
        # depende desta entrada.
        "dividendPerShare",
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
            fv = fy_dur.get(field)
            ja_extraido = existing.get(field)
            # Um "Q4" idêntico ao exercício inteiro não é um trimestre: é o
            # valor anual a vazar pela data de fecho, que é a MESMA nos dois
            # períodos (a Oracle fecha o ano e o Q4 a 31 de maio). A receita do
            # Q4 de 2022 ficava em 42.440 M — o ano completo — e o gráfico
            # trimestral dava um pico de 4× em todos os anos afetados.
            #
            # Nestes casos a extração não é fonte de verdade nenhuma: não há
            # facto trimestral, há um facto anual mal atribuído. Trata-se como
            # ausente para que a subtração FY − Q1 − Q2 − Q3 o substitua.
            if (ja_extraido is not None and fv is not None and fv != 0
                    and abs(ja_extraido - fv) <= abs(fv) * 1e-6):
                ja_extraido = None
            if ja_extraido is not None:
                continue  # extração EDGAR é fonte de verdade
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
            # Mesma lógica para o custo das vendas: não existe custo negativo.
            # Um Q4 derivado por subtração (FY − Q1 − Q2 − Q3) fica negativo
            # quando o anual e os trimestres usam tags diferentes — e depois
            # arrasta o lucro bruto, que passava a exceder a receita (17 dos 22
            # casos na BD eram exatamente Q4 assim). Melhor NULL.
            if field == "costOfRevenue" and val < 0:
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
            fy_eps_raw_abs = abs(fy_eps * (fy_dur.get("_eps_split_fator") or 1.0)) if fy_eps is not None else 0.0
            if fy_ni is not None and fy_eps and fy_eps_raw_abs >= 0.5:
                implied = fy_ni / fy_eps
                if implied >= 1_000_000 and (
                    sh is None or sh / implied > 5 or sh / implied < 0.2
                ):
                    sh = implied
            if sh is not None:
                # A média anual é a média dos 4 trimestres, por isso o Q4 = 4×ano − Q1 − Q2 − Q3;
                # usar a média anual dava EPS do Q4 errado em empresas com recompras.
                q_sh = [d.get("sharesOutstandingDur") for d in q_durs]
                if all(v is not None for v in q_sh) and q_sh[2] > 0:
                    q4_sh = 4 * sh - sum(q_sh)
                    if 0.85 * q_sh[2] <= q4_sh <= 1.15 * q_sh[2]:
                        sh = q4_sh
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


def _dei_shares_near_with_filed(dei: dict, period_end: str | None) -> tuple[float | None, str | None]:
    """Último recurso para shares outstanding: o facto da cover page
    (dei:EntityCommonStockSharesOutstanding), point-in-time datado tipicamente
    semanas após o period end. Aceita o registo mais próximo em
    [period_end, period_end+100d].

    Multi-classe (GDDY A/B, WBD/Discovery A/B/C, BKR pré-2023): a cover page
    tem UM valor por classe na mesma data — o total em circulação é a SOMA
    (é isso que o market cap precisa). Distinção classes vs restatement do
    mesmo facto: classes diferem materialmente (razão máx/mín ≥ 1.3); um
    restatement de cover count difere < 1.3 → usar o maior, nunca somar."""
    if not period_end or not dei:
        return None, None
    node = dei.get("EntityCommonStockSharesOutstanding")
    if not node:
        return None, None
    limit = (datetime.date.fromisoformat(period_end) + datetime.timedelta(days=100)).isoformat()
    best_date = None
    best_by_val: dict[float, str | None] = {}
    for entries in (node.get("units") or {}).values():
        if not isinstance(entries, list):
            continue
        for e in entries:
            d, v = e.get("end"), e.get("val")
            if not d or v is None or d < period_end or d > limit:
                continue
            vf = float(v)
            if best_date is None or d < best_date:
                best_date = d
                best_by_val = {vf: e.get("filed")}
            elif d == best_date:
                prev_f = best_by_val.get(vf)
                if (e.get("filed") or "") >= (prev_f or ""):
                    best_by_val[vf] = e.get("filed")
    vals = sorted(v for v in best_by_val if v and v >= 100_000)
    if not vals:
        return None, None
    if len(vals) == 1:
        return vals[0], best_by_val[vals[0]]
    if len(vals) <= 4 and vals[0] > 0 and vals[-1] / vals[0] >= 1.3:
        fileds = [best_by_val[v] for v in vals if best_by_val.get(v)]
        return sum(vals), (max(fileds) if fileds else None)  # classes distintas → total em circulação
    return vals[-1], best_by_val[vals[-1]]  # valores próximos = restatement → o mais alto/recente


def dei_shares_near(dei: dict, period_end: str | None) -> float | None:
    val, _ = _dei_shares_near_with_filed(dei, period_end)
    return val


def aplicar_receita_impressa(cik, dur_map, period_ends, namespace) -> int:
    """Receita = a linha que a empresa IMPRIME na demonstração de resultados, quando é
    maior do que a escolhida pelas tags (ver receita_impressa.py: COP, SRE, BRK.B
    ficavam com o subtotal ASC 606). Só sobe, nunca desce: uma receita impressa menor
    seria outro conceito (excise, segmento) e a escolha por tags já a tratou.
    Corre ANTES do Q4 sintético para que Q4 = ano − 9 meses use a receita certa."""
    try:
        impressas = receita_impressa.para_cik(cik)
    except Exception as e:  # sem DERA o motor segue só com as tags
        print(f"    ⚠️ receita impressa indisponível ({e})")
        return 0
    if not impressas:
        return 0
    n = 0
    for (fy, fp), dur in dur_map.items():
        fim = period_ends.get((fy, fp))
        if not fim or fp == "Q4":
            continue
        q = 4 if fp == "FY" else 1
        try:
            f0 = datetime.date.fromisoformat(str(fim)[:10])
        except ValueError:
            continue
        hit = next((vf for (d, qq), vf in impressas.items() if qq == q
                    and abs((datetime.date.fromisoformat(d) - f0).days) <= 5), None)
        if not hit:
            continue
        v, filed = hit
        atual = dur.get("revenue")
        if atual is not None and v <= atual * 1.01:
            continue
        # A nossa receita é uma REEXPRESSÃO posterior à linha impressa (operações
        # descontinuadas, spin-off: RVTY 2021, HON 3T 2025)? Então fica a nossa.
        if atual is not None and _receita_reexpressa_depois(namespace, f0, fp, atual, filed):
            continue
        # A diferença é exatamente os proveitos que não são receita (associadas, outros
        # proveitos, derivados)? Então a linha impressa é "receita + outros proveitos" —
        # a ExxonMobil, desde 2023, só deixa ver essa linha no DERA (82,914 = 80,795 de
        # receita + 2,119 de associadas e outros proveitos).
        if atual is not None:
            outros = _outros_proveitos(namespace, f0, fp)
            if outros and abs((v - atual) - outros) <= 0.02 * abs(v - atual):
                continue
        dur["revenue"] = v
        n += 1
    return n


_TAGS_OUTROS_PROVEITOS = ("IncomeLossFromEquityMethodInvestments", "OtherNonoperatingIncomeExpense",
                          "NonoperatingIncomeExpense", "OtherNonoperatingIncome",
                          "InvestmentIncomeInterestAndDividend", "DerivativeGainLossOnDerivativeNet",
                          "GainLossOnDerivativeInstrumentsNetPretax", "GainLossOnSaleOfPropertyPlantEquipment")


def _outros_proveitos(namespace, fim, fp) -> float:
    """Soma dos proveitos que não são receita publicados para o período (o facto mais
    recente de cada tag)."""
    total = 0.0
    for tag in _TAGS_OUTROS_PROVEITOS:
        melhor = None
        for e in extract_tag_entries(namespace, tag):
            if not e.get("end") or not (is_annual_duration(e) if fp == "FY" else is_quarterly_duration(e)):
                continue
            try:
                if abs((datetime.date.fromisoformat(e["end"]) - fim).days) > 5:
                    continue
            except ValueError:
                continue
            if melhor is None or (e.get("filed") or "") > (melhor.get("filed") or ""):
                melhor = e
        if melhor and melhor.get("val") is not None:
            total += melhor["val"]
    return total


def _receita_reexpressa_depois(namespace, fim, fp, valor, filed_impresso) -> bool:
    """Há um facto de receita = `valor` (±0,5%) para este período entregue DEPOIS do
    filing que imprimiu a linha?"""
    limite = f"{filed_impresso[:4]}-{filed_impresso[4:6]}-{filed_impresso[6:]}"
    for tag in DURATION_TAGS["revenue"]:
        for e in extract_tag_entries(namespace, tag):
            if (e.get("filed") or "") <= limite or not e.get("end"):
                continue
            if not (is_annual_duration(e) if fp == "FY" else is_quarterly_duration(e)):
                continue
            try:
                if abs((datetime.date.fromisoformat(e["end"]) - fim).days) > 5:
                    continue
            except ValueError:
                continue
            val = e.get("val")
            if val and abs(val - valor) <= 0.005 * abs(valor):
                return True
    return False


def process_company(conn, company: dict, dry_run: bool = False,
                    collector: dict | None = None) -> int:
    company_id = company["id"]
    cik = company["cik"]

    facts_json = fetch_edgar_facts(cik, refresh=REFRESH_CACHE)
    if not facts_json:
        return 0

    facts = facts_json.get("facts") or {}
    ns_us = facts.get("us-gaap") or {}
    ns_ifrs = facts.get("ifrs-full") or {}
    # BTI/DEO-class: 20-F com us-gaap residual de 1 tag e o filing inteiro em
    # ifrs-full — o "or" cego escolhia o namespace errado e a empresa ficava
    # com ZERO períodos na BD. Escolher o namespace com mais tags.
    namespace = ns_us if len(ns_us) >= len(ns_ifrs) else ns_ifrs
    if not namespace:
        return 0

    dei_ns = facts.get("dei") or {}
    filtrar_splits_desmentidos(company.get("ticker"), dei_ns)
    evidence = compute_company_evidence(facts_json)

    min_fy = datetime.date.today().year - HISTORY_YEARS
    periods: set = set()

    # Inferir a moeda de reporte ANTES da extração (a seleção de unidades
    # usa-a): dual-taggers (BCS: USD e GBP no mesmo node) precisam da moeda
    # NATIVA primeiro — a nativa tem o histórico completo; a dual só alguns
    # períodos. Critério: a moeda com MAIS entradas no core tag.
    global _PREFERRED_CURRENCY
    reporting_currency = "USD"
    core_tag = (namespace.get("NetIncomeLoss") or namespace.get("ProfitLoss")
                or namespace.get("Assets") or namespace.get("Revenues")
                or namespace.get("Revenue"))
    if core_tag:
        core_units = core_tag.get("units") or {}
        best_count = -1
        for curr in VALID_CURRENCIES:
            entries = core_units.get(curr)
            n = len(entries) if isinstance(entries, list) else 0
            if n > best_count and n > 0:
                best_count = n
                reporting_currency = curr
    _PREFERRED_CURRENCY = reporting_currency

    # Descobrir períodos DERIVANDO (fy, fp) da DATA de fecho (não dos campos
    # fy/fp da SEC, que são frequentemente errados em comparativos). O calendário
    # fiscal vem das datas de fecho anuais observadas. Sem factos anuais (raro:
    # alguns 20-F/6-K), cai para o comportamento antigo baseado em fy/fp.
    cal = build_fiscal_calendar(namespace)
    if cal is not None:
        periods, period_ends, period_filed = discover_periods(namespace, cal, min_fy)
    else:
        for tag in ("NetIncomeLoss", "ProfitLoss", "Assets", "Revenues", "Revenue"):
            for e in extract_tag_entries(namespace, tag):
                fy = e.get("fy")
                fp = e.get("fp")
                if fy and fp and fy >= min_fy and fp in ("FY", "Q1", "Q2", "Q3", "Q4"):
                    periods.add((fy, fp))
        period_ends, period_filed = {}, {}
        for (fy, fp) in sorted(periods):
            for tag in ["Assets", "NetIncomeLoss", "ProfitLoss", "Revenues", "Revenue",
                        "StockholdersEquity", "Equity"]:
                entries = extract_tag_entries(namespace, tag)
                matches = [e for e in entries if e.get("fy") == fy and e.get("fp") == fp]
                if tag in ("NetIncomeLoss", "ProfitLoss", "Revenues", "Revenue"):
                    matches = [e for e in matches
                               if (is_annual_duration(e) if fp == "FY" else is_quarterly_duration(e))]
                if matches:
                    matches.sort(key=lambda e: e.get("end") or "", reverse=True)
                    pe = matches[0].get("end")
                    fe = [e for e in matches if e.get("end") == pe]
                    fe.sort(key=lambda e: e.get("filed") or "", reverse=True)
                    period_ends[(fy, fp)] = pe
                    period_filed[(fy, fp)] = fe[0].get("filed")
                    break

    if not periods:
        return 0

    periods_list = sorted(periods)

    ticker = company.get('ticker')
    dur_map, inst_map = extract_all_metrics(namespace, periods_list, period_ends)
    apply_manual_capex_overrides(dur_map, ticker)
    aplicar_splits_por_evento(ticker, dur_map, inst_map)
    aplicar_racio_ads(ticker, dur_map, inst_map)
    if reporting_currency == "USD":
        aplicar_receita_impressa(cik, dur_map, period_ends, namespace)

    # Q4 sintético (FY − Q1−Q2−Q3) + anos cujo Q4 existente na BD deve ser limpo
    drop_q4_years = synthesize_q4(periods, period_ends, period_filed, dur_map, inst_map)
    if namespace is ns_ifrs:   # marca para build_row (correção de excise só em IFRS)
        for _d in dur_map.values():
            _d["_ifrs"] = True
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
            dei_val, dei_filed = _dei_shares_near_with_filed(dei_ns, period_end)
            if dei_val is not None:
                f_dei = fator_split_para_filed(ticker, dei_filed)
                inst["sharesOutstandingInst"] = dei_val * f_dei if f_dei != 1.0 else dei_val
                inst["sharesOutstandingInst_filed"] = dei_filed

        rows.append(build_row(company_id, fy, fp, period_end, filed_at, dur, inst,
                              company.get('sector'), evidence))

    # (moeda de reporte inferida no topo de process_company — ver
    # _PREFERRED_CURRENCY; aqui só se aplica a conversão)
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

    n_rot = realinhar_rotulos_de_calendario(rows)
    if n_rot:
        print(f"    {n_rot} rótulo(s) de período realinhados pelo calendário civil")

    n_div = corrigir_escala_de_dividendos(rows)
    if n_div:
        print(f"    {n_div} dividendo(s) por ação fora de escala — unidade reposta")

    n_custo = descartar_custo_incoerente(rows)
    for r in rows:
        r.pop("_gp_derivado_custo", None)
        r.pop("_op_inc_derivado_custo", None)
    if n_custo:
        print(f"    {n_custo} linha(s) com custo das vendas fora da norma da empresa — descartado")

    # Os splits já foram aplicados antes de synthesize_q4/build_row; esta limpeza
    # só corrige eventuais linhas remanescentes em milhares vs vizinhos.
    n_escala = corrigir_escala_de_acoes(rows)
    if n_escala:
        print(f"    {n_escala} linha(s) com nº de ações em milhares — escala reposta")

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

    # Wipe-then-reinsert por empresa (num único commit): agora que (fy, fp) é
    # DERIVADO da data, uma re-ingestão pode dar rótulos DIFERENTES aos de antes
    # — um delete-por-chave deixaria as linhas antigas mis-rotuladas como órfãs
    # (e não apanha os duplicados ANNUAL de quarter NULL). Apagar tudo da empresa
    # e reinserir garante convergência. GUARD: nunca apagar sem ter linhas novas
    # para pôr (fetch falhado/vazio já retornou antes, mas defende-se na mesma).
    if not rows:
        return 0

    # Preservar enriquecimentos escritos por pipelines SEPARADOS (revenueSegments
    # via ingest_segments; businessKpis via pipeline Gemini) que insert_fundamental
    # NÃO reescreve — senão o wipe apagava-os. Ancorados na identidade FÍSICA do
    # período (periodType, periodEnd), não no rótulo (fy, fq) que pode mudar com a
    # relabelagem. Reaplicados por (periodType, periodEnd::date) após reinserir.
    # QUATRO colunas, não duas. revenueSegmentsByAxis (gráficos por
    # produto/geografia) e minorityInterest (identidade do balanço) são
    # escritos por pipelines separados tal como revenueSegments — deixá-los de
    # fora do preserve fazia o wipe apagá-los em cada ingestão. Em 2026-08-16
    # isto destruiu o eixo de 6 empresas (BP, BRK.B, BUD, CVNA, ERIE, V) e o
    # minorityInterest da CVNA numa única passagem.
    preserved: dict[tuple, tuple] = {}

    def _read_preserved() -> dict:
        out: dict[tuple, tuple] = {}
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "periodType", "periodEnd"::date, "revenueSegments", '
                '"revenueSegmentsByAxis", "businessKpis", "minorityInterest" '
                'FROM fundamentals WHERE "companyId" = %s '
                'AND ("revenueSegments" IS NOT NULL OR "revenueSegmentsByAxis" IS NOT NULL '
                '     OR "businessKpis" IS NOT NULL OR "minorityInterest" IS NOT NULL)',
                (company_id,),
            )
            for pt, pe, seg, axis, kpi, nci in cur.fetchall():
                out[(pt, pe.isoformat())] = (seg, axis, kpi, nci)
        return out

    try:
        preserved = _read_preserved()
    except Exception as e1:
        conn.rollback()
        time.sleep(1)
        try:
            preserved = _read_preserved()
        except Exception as e2:
            conn.rollback()
            # NUNCA seguir com preserved={} em silêncio: um SELECT falhado não
            # significa "sem enriquecimentos", e o wipe a seguir apagaria
            # segmentos/eixos reais sem aviso. Abortar esta empresa.
            print(f"    ⚠️ ERRO ao ler preserved para {ticker or company_id}: "
                  f"{e1!r} / {e2!r} — empresa SALTADA (nada apagado)")
            return 0

    def _reattach(cur):
        if not preserved:
            return
        matched = 0
        for row in rows:
            key = (row["periodType"], str(row["periodEnd"])[:10])
            enr = preserved.get(key)
            if not enr:
                continue
            matched += 1
            seg, axis, kpi, nci = enr
            cur.execute(
                'UPDATE fundamentals SET "revenueSegments" = %s, '
                '"revenueSegmentsByAxis" = %s, "businessKpis" = %s, '
                # A extração fresca ganha se trouxer valor; o preservado só
                # entra onde ela não tem nada.
                '"minorityInterest" = COALESCE("minorityInterest", %s) '
                'WHERE "companyId" = %s AND "periodType" = %s::"period_type" '
                'AND "periodEnd"::date = %s::date',
                (Json(seg) if seg is not None else None,
                 Json(axis) if axis is not None else None,
                 Json(kpi) if kpi is not None else None,
                 nci,
                 company_id, row["periodType"], str(row["periodEnd"])[:10]),
            )
        # Um periodEnd reafirmado pela EDGAR faz o payload preservado não casar
        # com nenhuma linha nova — sem contador, esses segmentos desapareciam
        # sem deixar rasto.
        dropped = len(preserved) - matched
        if dropped > 0:
            print(f"    ⚠️ {ticker or company_id}: {dropped} períodos preservados SEM "
                  f"correspondência nas linhas novas (enriquecimentos perdidos)")

    # Notas por valor (mini aviso no site): correções revistas aplicam-se às
    # linhas ANTES de gravar; reexpressões detetam-se no XBRL. Ver notas_valores.py.
    # Dívida lida das LINHAS IMPRESSAS do balanço (DERA, ver divida_balanco.py):
    # apanha as linhas com tags próprias da empresa, que o companyfacts não traz
    # (EXR, WRB, CAT…). Com a leitura COMPLETA (tem dívida de longo prazo) manda nos
    # dois sentidos; parcial, só sobe. Revisto a 20/11 com a fila do Codex: na
    # simulação +1 072/−132 nas empresas de afinação e +367/−72 no controlo.
    # Bancos ficam de fora.
    if company.get("sector") != "Financials":
        dividas = divida_balanco.para_cik(cik)
        if dividas:
            for row in rows:
                fim = str(row.get("periodEnd"))[:10]
                try:
                    f0 = datetime.date.fromisoformat(fim)
                except ValueError:
                    continue
                hit = next(((v, comp) for d, v, comp in dividas
                            if abs((datetime.date.fromisoformat(d) - f0).days) <= 5), None)
                if not hit:
                    continue
                v, comp = hit
                td = row.get("totalDebt")
                # Leitura COMPLETA (apanhou a dívida de longo prazo): o balanço impresso
                # manda nos dois sentidos — a cascata de tags somava a mesma dívida duas
                # vezes (DVN, HPE, IBM: maturidades dentro de ShortTermBorrowings; UPS:
                # total combinado + parcela corrente; ARE/PLD: LineOfCredit já incluída).
                # Leitura parcial: só pode subir, como antes.
                if v > 0 and (comp or td is None or v > td * 1.001):
                    row["totalDebt"] = v

    # Caixa = caixa e equivalentes + as aplicações que o balanço IMPRIME no ativo
    # corrente (DERA, ver aplicacoes_balanco.py): as tags de aplicações misturam o
    # total do balanço com parcelas das notas (BA 2020: 0,6 mM em vez de 17,8 mM).
    # Bancos e seguradoras ficam com a regra deles (build_row).
    if reporting_currency == "USD":
        aplic = aplicacoes_balanco.para_cik(cik)
        if aplic:
            for row in rows:
                base = row.get("_caixaBase")
                if base is None or row.get("_aplicacoesBloqueadas"):
                    continue
                fim = str(row.get("periodEnd"))[:10]
                hit = aplic.get(fim)
                if hit is None:
                    try:
                        f0 = datetime.date.fromisoformat(fim)
                        hit = next((v for d, v in aplic.items()
                                    if abs((datetime.date.fromisoformat(d) - f0).days) <= 5), None)
                    except ValueError:
                        hit = None
                if hit is not None:
                    row["cash"] = base + hit[0]

    # Rede de segurança: anula o impossível e sinaliza incoerências ANTES das
    # correções revistas (essas têm prova e passam por cima). Ver validar_fundamentais.py.
    validar(ticker, rows, company.get("sector"))
    notas = notas_definicao(rows) + aplicar_correcoes(ticker, rows)
    try:
        notas += notas_reexpressao(facts_json, cik, rows, {**DURATION_TAGS, **INSTANT_TAGS},
                                   company.get("currency"))
    except Exception as e:  # uma nota nunca pode impedir a gravação dos números
        print(f"    ⚠️ {ticker}: notas de reexpressão falharam ({e}) — sigo sem elas")

    inserted = 0
    try:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM fundamentals WHERE "companyId" = %s', (company_id,))
            for row in rows:
                insert_fundamental(cur, row)
            _reattach(cur)
            gravar_notas(cur, company_id, notas)
        conn.commit()
        inserted = len(rows)
    except Exception as e:
        conn.rollback()
        print(f"    DB error (batch): {e} — fallback período a período")
        try:
            with conn.cursor() as cur:
                cur.execute('DELETE FROM fundamentals WHERE "companyId" = %s', (company_id,))
            conn.commit()
        except Exception:
            conn.rollback()
        for row in rows:
            try:
                with conn.cursor() as cur:
                    insert_fundamental(cur, row)
                conn.commit()
                inserted += 1
            except Exception as e2:
                conn.rollback()
                print(f"    DB error {row['fiscalYear']}/{row['fiscalQuarter']}: {e2}")
        try:
            with conn.cursor() as cur:
                _reattach(cur)
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            with conn.cursor() as cur:
                gravar_notas(cur, company_id, notas)
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"    ⚠️ {ticker}: notas não gravadas ({e})")

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
                        "depreciationAndAmortization", "incomeBeforeTax", "netInterestIncome", "otherNonOperatingIncome",
                        "totalCurrentAssets", "accountsReceivable", "inventory", "propertyPlantEquipment",
                        "goodwillAndIntangibles", "accountsPayable", "shortTermDebt", "totalLiabilities", "retainedEarnings",
                        "investingCashFlow", "financingCashFlow", "stockBasedCompensation", "shareRepurchases", "dividendsPaid", "netChangeInCash",
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
                        "depreciationAndAmortization", "incomeBeforeTax", "netInterestIncome", "otherNonOperatingIncome",
                        "totalCurrentAssets", "accountsReceivable", "inventory", "propertyPlantEquipment",
                        "goodwillAndIntangibles", "accountsPayable", "shortTermDebt", "totalLiabilities", "retainedEarnings",
                        "investingCashFlow", "financingCashFlow", "stockBasedCompensation", "shareRepurchases", "dividendsPaid", "netChangeInCash",
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

    carregar_splits_eventos()

    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        companies = get_companies_with_cik(cur, tickers)

    total = len(companies)
    mode = "DRY-RUN (sem escritas)" if dry_run_path else "live"
    print(f"{total} empresas com CIK a processar [{mode}].")

    total_periods = 0
    errors = 0
    failed: list[str] = []
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
                failed.append(ticker or company.get("id", "?"))
        except Exception as e:
            print(f"ERRO: {e}")
            errors += 1
            failed.append(ticker or company.get("id", "?"))

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
    val = relatorio_validacao(gravar=not dry_run_path)
    print(f"Validação: {val['por_nivel'].get('anular', 0)} valores anulados, "
          f"{val['por_nivel'].get('sinalizar', 0)} sinalizados para revisão")
    for m in val["por_motivo"][:8]:
        print(f"   {m['nivel']:9} {m['casos']:6}  {m['motivo']}")

    # Terminar com 0 mesmo havendo erros é o que deixou a BRK.B e a BF.B falharem
    # todos os dias durante semanas com o workflow verde: a contagem de erros ia
    # para o log, e um log que ninguém lê não é um alarme. Enquanto um erro de
    # dados não pintar o CI de vermelho, ninguém o vê. Sair != 0 aqui é
    # deliberadamente barulhento — uma falha transitória da SEC vai chumbar a
    # corrida, e é isso que se pretende: a alternativa é não saber.
    if errors:
        print(f"FALHA: {errors} empresa(s) sem ingestão — {', '.join(sorted(failed)[:20])}"
              + (" ..." if len(failed) > 20 else ""))
        sys.exit(1)


if __name__ == "__main__":
    main()
