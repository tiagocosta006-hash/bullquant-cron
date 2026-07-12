"""
explain_holes.py — Motor de evidência para os buracos (nulls) de fundamentals.

Para cada (empresa, período, campo) em falta na BD, inspeciona o companyfacts
do EDGAR (cache de disco partilhada com o ingest) e classifica o buraco:

  EXTRACTOR_LOGIC          o tag já mapeado TEM valor selecionável para o
                           período — o pipeline de extração deixou-o cair
                           (janela de duração, differencing YTD, etc.)
  UNIT_MISMATCH            o tag mapeado tem valor, mas apenas numa unidade
                           que a seleção de moeda atual não escolheria
  TAG_AVAILABLE_NOT_MAPPED existe um tag NÃO mapeado, com o shape correto
                           (instant vs duration), unidade correta e âmbito de
                           demonstração correto, com valor para o período
  Q4_SYNTHESIZABLE         buraco em Q4 cujos irmãos FY+Q1+Q2+Q3 têm o campo
                           na BD — a síntese Q4 preenche no re-ingest
  DERIVED_INPUT_MISSING    freeCashFlow: falta OCF e/ou capex na própria row
  SYNTH_INPUT_MISSING      ebitda: faltam inputs de síntese (opIncome/D&A)
  SECTOR_STRUCTURAL        campo sem significado no setor (EBITDA de bancos)
  NO_EVIDENCE_IN_FILINGS   nada no filing suporta o campo → estrutural
  PERIOD_METADATA_MISSING  sem periodEnd utilizável

Regras de âmbito (lição do desastre do auto-healer — NUNCA cruzar mapas):
  - campos de BALANÇO só aceitam factos INSTANT (sem "start" no XBRL);
  - campos de CASH FLOW só aceitam durations com prefixo de pagamento/fluxo;
  - campos de INCOME só aceitam durations com janela trimestral/anual;
  - namespace "srt" (schedules suplementares) é ignorado por completo;
  - denylists explícitas: AvailableForSale*, Deposits (passivo), *ProForma*.

Só leitura: NUNCA escreve na BD.

Uso: python scripts/explain_holes.py [--tickers AAPL,JPM] [--limit N]
Outputs em scripts/out/: hole_explanations.json,
                         candidate_tag_frequency.md, zero_row_companies.md
"""

import os
import re
import sys
import json
import time
import collections

import psycopg2

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Importa o pipeline real: partilha cache EDGAR, janelas de duração e a
# evidência de empresa — garante que a análise usa EXATAMENTE a mesma lógica.
sys.path.insert(0, os.path.dirname(__file__))
import ingest_fundamentals as ing  # executa load_dotenv + assert_local_db

OUT_DIR = os.path.join(os.path.dirname(__file__), "out")

AUDIT_FIELDS = [
    "revenue", "netIncome", "epsDiluted", "ebitda", "researchAndDevelopment",
    "sellingGeneralAndAdmin", "operatingCashFlow", "capex", "freeCashFlow",
    "cash", "totalAssets", "totalDebt", "sharesOutstanding", "dividendPerShare",
]

# Réplica da lista inline de extract_tag_entries (ordem de prioridade ATUAL).
# NOTA: DKK/SEK/NOK ausentes de propósito — é essa a lacuna que UNIT_MISMATCH
# deve denunciar (NVO em DKK cru). P3 corrige a lista no ingest.
VALID_CURRENCIES_CURRENT = ["USD", "EUR", "GBP", "CHF", "CAD", "JPY", "AUD"]
ALL_CURRENCIES = {"USD", "EUR", "GBP", "CHF", "CAD", "JPY", "AUD",
                  "DKK", "SEK", "NOK", "ILS", "KRW", "TWD", "INR", "BRL"}


def unit_kind(unit_key: str) -> str:
    if unit_key in ALL_CURRENCIES:
        return "monetary"
    if "/" in unit_key:
        return "per_share"
    if unit_key == "shares":
        return "shares"
    return "other"


# ── Especificação por campo: shape + unidade + tags mapeados + âmbito ────────
# allow/deny aplicam-se à DESCOBERTA de candidatos não mapeados. O shape
# (instant vs duration) é verificado estruturalmente nos próprios factos.
FIELD_SPECS = {
    "revenue": dict(
        kind="duration", unit="monetary",
        mapped=ing.DURATION_TAGS["revenue"],
        allow=r"Revenue|Sales|^InterestAndDividendIncome|^InterestIncome|^PremiumsEarned",
        deny=r"CostOf|Deferred|Unearned|ProForma|Remaining|Expense|Receivable|Segment|TaxEffect|Cost$",
    ),
    "netIncome": dict(
        kind="duration", unit="monetary",
        mapped=ing.DURATION_TAGS["netIncome"],
        allow=r"^NetIncomeLoss|^ProfitLoss",
        deny=r"PerShare|Noncontrolling$",
    ),
    "epsDiluted": dict(
        kind="duration", unit="per_share",
        mapped=ing.DURATION_TAGS["epsDiluted"],
        allow=r"PerShare|PerBasicAndDiluted",
        deny=r"Dividend|Book|Tangible|Par",
    ),
    "ebitda": dict(
        kind="duration", unit="monetary",
        mapped=ing.DURATION_TAGS["ebitda"] + ing.DURATION_TAGS["depreciationAndAmortization"],
        allow=r"Depreciation|Amorti[sz]ation",
        deny=r"^Accumulated|Capitali[sz]ed|RightOfUse|Deferred|PropertyPlantAndEquipment",
    ),
    "researchAndDevelopment": dict(
        kind="duration", unit="monetary",
        mapped=ing.DURATION_TAGS["researchAndDevelopment"],
        allow=r"ResearchAndDevelopment",
        deny=r"InProcess|Asset|Intangible|Capitali[sz]ed|Arrangement",
    ),
    "sellingGeneralAndAdmin": dict(
        kind="duration", unit="monetary",
        mapped=ing.DURATION_TAGS["sellingGeneralAndAdmin"] + ["SalesAndMarketingExpense", "AdministrativeExpense"],
        allow=r"SellingGeneralAndAdministrative|GeneralAndAdministrative|SellingAndMarketing|SalesAndMarketing|^SellingExpense|^MarketingExpense|^AdministrativeExpense",
        deny=r"Share|Depreciation",
    ),
    "operatingCashFlow": dict(
        kind="duration", unit="monetary",
        mapped=ing.DURATION_TAGS["operatingCashFlow"],
        allow=r"^NetCashProvidedByUsedInOperating|^CashFlowsFromUsedInOperating",
        deny=r"Discontinued",
    ),
    "capex": dict(
        kind="duration", unit="monetary",
        mapped=ing.DURATION_TAGS["capex"],
        allow=r"^PaymentsToAcquire|^PaymentsFor|^PurchaseOf|^PaymentsToDevelop",
        # Repurchase/CommonStock/Equity: buybacks são FINANCIAMENTO, nunca capex
        # (falso positivo real: ABNB PaymentsForRepurchaseOfCommonStock $2.25B).
        deny=(r"Business|Investment|Securit|EquityMethod|Marketable|Intangible|"
              r"ProceedsFrom|Dividend|Tax|Interest|Debt|Repurchase|CommonStock|"
              r"PreferredStock|Equity|Minority|Hedge|Derivative|Loan|Advance|"
              r"Deposit|Policyholder|Restructuring|Litigation|Royalt"),
    ),
    "freeCashFlow": dict(kind="derived", unit="monetary", mapped=[], allow=None, deny=None),
    "cash": dict(
        kind="instant", unit="monetary",
        mapped=ing.INSTANT_TAGS["cash"] + ing.INSTANT_TAGS["marketableSecuritiesCurrent"],
        allow=r"^Cash|^InterestBearingDepositsInBanks",
        deny=r"Restricted|Flow|Payments|Proceeds|PerShare|Liabilit",
    ),
    "totalAssets": dict(
        kind="instant", unit="monetary",
        mapped=ing.INSTANT_TAGS["totalAssets"],
        allow=r"^Assets$|^AssetsCurrent$",
        deny=r"Noncurrent|Other",
    ),
    "totalDebt": dict(
        kind="instant", unit="monetary",
        mapped=(ing.INSTANT_TAGS["totalDebt"] + ing.INSTANT_TAGS["longTermDebt"]
                + ing.INSTANT_TAGS["longTermDebtCurrent"] + ing.INSTANT_TAGS["shortTermDebt"]
                + ing.INSTANT_TAGS["commercialPaper"] + ing.INSTANT_TAGS["debtInstrumentCarryingAmount"]
                + ing.INSTANT_TAGS["securedDebt"] + ing.INSTANT_TAGS["unsecuredDebt"]),
        allow=r"Debt|Borrowing|NotesPayable|Debenture|LineOfCredit|LoansPayable|CommercialPaper|Advances",
        deny=(r"AvailableForSale|Securit|Deposit|Repayment|ProceedsFrom|PaymentsOf|Interest|"
              r"Maturit|Issuance|Fee|Cost|Discount|Premium|FairValue|WeightedAverage|"
              r"Percentage|Ratio|Term$|Rate"),
    ),
    "sharesOutstanding": dict(
        kind="both", unit="shares",
        mapped=ing.DURATION_TAGS["sharesOutstandingDur"] + ing.INSTANT_TAGS["sharesOutstandingInst"],
        allow=r"Shares|NumberOfShares",
        deny=r"Authorized|Issued|Treasury|Reserved|Par|Value|Vested|Granted|Award|Option|Unit",
    ),
    "dividendPerShare": dict(
        kind="duration", unit="per_share",
        mapped=ing.DURATION_TAGS["dividendPerShare"],
        allow=r"Dividends?.*PerShare|PerShare.*Dividend",
        deny=r"Preferred|Expected",
    ),
}

# Campos em SUBTRACTIVE da síntese Q4 (espelho de synthesize_q4).
Q4_SUBTRACTIVE = {
    "revenue", "netIncome", "operatingCashFlow", "capex",
    "researchAndDevelopment", "sellingGeneralAndAdmin", "ebitda",
    "dividendPerShare",
}


def duration_window_ok(entry: dict, fp: str, field: str) -> str | None:
    """Devolve o tipo de janela se a duração servir para o período, senão None."""
    if fp == "FY":
        return "annual" if ing.is_annual_duration(entry) else None
    if ing.is_quarterly_duration(entry):
        return "quarterly"
    # OCF/capex aceitam YTD (o extrator faz differencing)
    if field in ("operatingCashFlow", "capex") and ing.is_ytd_duration(entry, fp):
        return "ytd"
    return None


def entry_matches(entry: dict, spec_kind: str, fp: str, field: str, expected_end: str) -> str | None:
    """Shape estrutural: instant não tem 'start'; duration tem. Devolve o tipo
    de match ('instant'/'annual'/'quarterly'/'ytd') ou None."""
    if entry.get("end") != expected_end:
        return None
    if "14A" in (entry.get("form") or ""):
        return None
    is_instant = "start" not in entry
    if spec_kind == "instant":
        return "instant" if is_instant else None
    if spec_kind == "duration":
        return None if is_instant else duration_window_ok(entry, fp, field)
    if spec_kind == "both":
        if is_instant:
            return "instant"
        return duration_window_ok(entry, fp, field)
    return None


def simulate_selected_unit(units: dict) -> str | None:
    """Réplica da seleção de unidade ATUAL de extract_tag_entries."""
    for c in VALID_CURRENCIES_CURRENT:
        if c in units:
            return c
    for k in units.keys():
        return k
    return None


def scan_tag(node: dict, spec: dict, fp: str, field: str, expected_end: str) -> dict:
    """Devolve {unit_key: (val, match_kind)} para todas as unidades com match."""
    found = {}
    for unit_key, entries in (node.get("units") or {}).items():
        if not isinstance(entries, list):
            continue
        if spec["unit"] != "other" and unit_kind(unit_key) != spec["unit"]:
            continue
        best = None
        for e in entries:
            mk = entry_matches(e, spec["kind"], fp, field, expected_end)
            if mk:
                if best is None or (e.get("filed") or "") > (best[0].get("filed") or ""):
                    best = (e, mk)
        if best and best[0].get("val") is not None:
            found[unit_key] = (best[0]["val"], best[1])
    return found


def classify_hole(ns: dict, dei: dict, spec: dict, field: str, fy: int, fp: str,
                  expected_end: str | None, row: dict, siblings: dict,
                  sector: str | None) -> dict:
    out = {"fy": fy, "fp": fp, "field": field}

    if not expected_end:
        out["class"] = "PERIOD_METADATA_MISSING"
        return out

    # Q4 sintetizável? (irmãos FY+Q1..Q3 têm o campo na BD)
    if fp == "Q4" and field in Q4_SUBTRACTIVE:
        sib = [siblings.get((fy, p), {}).get(field) for p in ("FY", "Q1", "Q2", "Q3")]
        if all(v is not None for v in sib):
            out["class"] = "Q4_SYNTHESIZABLE"
            return out

    if field == "freeCashFlow":
        missing = [f for f in ("operatingCashFlow", "capex") if row.get(f) is None]
        out["class"] = "DERIVED_INPUT_MISSING"
        out["missing_inputs"] = missing or ["(inputs presentes — recalcula no re-ingest)"]
        return out

    if field == "ebitda" and sector == "Financials":
        out["class"] = "SECTOR_STRUCTURAL"
        out["reason"] = "SECTOR_NO_EBITDA_BANK"
        return out

    # 1) tags mapeados: o valor existia e o extrator falhou?
    for tag in spec["mapped"]:
        node = ns.get(tag)
        if not node:
            continue
        found = scan_tag(node, spec, fp, field, expected_end)
        if found:
            sel = simulate_selected_unit(node.get("units") or {})
            if sel in found:
                out["class"] = "EXTRACTOR_LOGIC"
                out["tag"] = tag
                out["unit"] = sel
                out["value"] = found[sel][0]
                out["window"] = found[sel][1]
            else:
                out["class"] = "UNIT_MISMATCH"
                out["tag"] = tag
                out["units_with_value"] = {u: v for u, (v, _) in found.items()}
                out["unit_selected"] = sel
            return out

    if field == "ebitda":
        # síntese: precisa de opIncome (ou NI+tax+juros) + D&A
        has_op = row.get("operatingIncome") is not None
        out["class"] = "SYNTH_INPUT_MISSING"
        out["missing_inputs"] = (["operatingIncome"] if not has_op else []) + ["depreciationAndAmortization?"]
        # continua para descoberta de candidatos de D&A abaixo
    elif field == "sharesOutstanding" and dei:
        # fallback dei: cover-page shares (point-in-time)
        node = dei.get("EntityCommonStockSharesOutstanding")
        if node:
            for unit_key, entries in (node.get("units") or {}).items():
                cands = [e for e in entries if isinstance(e.get("val"), (int, float))
                         and (e.get("end") or "") >= expected_end]
                if cands:
                    cands.sort(key=lambda e: e.get("end") or "")
                    out["class"] = "TAG_AVAILABLE_NOT_MAPPED"
                    out["candidates"] = [{"tag": "dei:EntityCommonStockSharesOutstanding",
                                          "unit": unit_key, "value": cands[0]["val"],
                                          "end": cands[0].get("end")}]
                    return out

    # 2) descoberta de candidatos NÃO mapeados, dentro do âmbito
    allow = re.compile(spec["allow"]) if spec["allow"] else None
    deny = re.compile(spec["deny"]) if spec["deny"] else None
    mapped_set = set(spec["mapped"])
    candidates = []
    if allow is not None:
        for tag, node in ns.items():
            if tag in mapped_set or not allow.search(tag) or (deny and deny.search(tag)):
                continue
            found = scan_tag(node, spec, fp, field, expected_end)
            for unit_key, (val, mk) in found.items():
                candidates.append({"tag": tag, "unit": unit_key, "value": val, "window": mk})
    if candidates:
        if out.get("class") != "SYNTH_INPUT_MISSING":
            out["class"] = "TAG_AVAILABLE_NOT_MAPPED"
        out["candidates"] = sorted(candidates, key=lambda c: c["tag"])[:12]
        return out

    if "class" not in out:
        out["class"] = "NO_EVIDENCE_IN_FILINGS"
    return out


def diagnose_zero_rows(ticker: str, cik: str) -> dict:
    facts_json = ing.fetch_edgar_facts(cik)
    if ing.last_fetch_was_network:
        time.sleep(ing.SLEEP_BETWEEN)
    if not facts_json:
        return {"ticker": ticker, "cik": cik, "problem": "companyfacts 404/erro no EDGAR"}
    facts = facts_json.get("facts") or {}
    ns_counts = {k: len(v) for k, v in facts.items()}
    ns_us = facts.get("us-gaap") or {}
    ns_ifrs = facts.get("ifrs-full") or {}
    namespace = ns_us if len(ns_us) >= len(ns_ifrs) else ns_ifrs
    sample = ["NetIncomeLoss", "ProfitLoss", "Assets", "Revenues", "Revenue"]
    min_fy = 2026 - ing.HISTORY_YEARS
    discovered, no_fp, forms = set(), 0, collections.Counter()
    for tag in sample:
        for e in ing.extract_tag_entries(namespace, tag):
            forms[e.get("form")] += 1
            fy, fp = e.get("fy"), e.get("fp")
            if fy and fp and fy >= min_fy and fp in ("FY", "Q1", "Q2", "Q3", "Q4"):
                discovered.add((fy, fp))
            elif not fp:
                no_fp += 1
    return {
        "ticker": ticker, "cik": cik, "namespaces": ns_counts,
        "periods_discovered_by_sample_tags": len(discovered),
        "entries_without_fp_metadata": no_fp,
        "forms_seen": dict(forms.most_common(6)),
        "problem": ("descoberta de períodos vazia — ver forms/fp acima"
                    if not discovered else "períodos existem; falha noutro passo"),
    }


def main():
    tickers_filter = None
    if "--tickers" in sys.argv:
        idx = sys.argv.index("--tickers")
        tickers_filter = [t.strip().upper() for t in sys.argv[idx + 1].split(",") if t.strip()]
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    os.makedirs(OUT_DIR, exist_ok=True)
    conn = psycopg2.connect(ing.DIRECT_URL)

    cols = ", ".join(f'f."{c}"' for c in AUDIT_FIELDS)
    null_pred = " OR ".join(f'f."{c}" IS NULL' for c in AUDIT_FIELDS)
    with conn.cursor() as cur:
        # todas as rows das empresas com >=1 buraco (irmãos incluídos, para
        # deteção de Q4 sintetizável e zeros mascarados)
        cur.execute(f"""
            SELECT c.ticker, c.sector, c.currency, c.cik,
                   f."fiscalYear", f."periodType", f."fiscalQuarter",
                   f."periodEnd"::date::text, f."operatingIncome", {cols}
            FROM fundamentals f
            JOIN companies c ON c.id = f."companyId"
            WHERE c.id IN (
                SELECT DISTINCT f2."companyId" FROM fundamentals f2
                WHERE {null_pred}
            )
            ORDER BY c.ticker, f."fiscalYear", f."fiscalQuarter" NULLS FIRST
        """)
        rows = cur.fetchall()
        cur.execute("""
            SELECT c.ticker, c.cik FROM companies c
            WHERE c.cik IS NOT NULL AND c."isActive"
              AND NOT EXISTS (SELECT 1 FROM fundamentals f WHERE f."companyId" = c.id)
            ORDER BY c.ticker
        """)
        zero_rows = cur.fetchall()
    conn.close()

    # organizar por empresa
    by_company: dict = collections.OrderedDict()
    for r in rows:
        (ticker, sector, currency, cik, fy, ptype, fq, period_end, op_income), vals = r[:9], r[9:]
        fp = "FY" if ptype == "ANNUAL" else f"Q{fq}"
        c = by_company.setdefault(ticker, {"sector": sector, "currency": currency,
                                           "cik": cik, "periods": {}})
        row_map = {f: (float(v) if v is not None else None) for f, v in zip(AUDIT_FIELDS, vals)}
        row_map["operatingIncome"] = float(op_income) if op_income is not None else None
        c["periods"][(fy, fp)] = {"period_end": period_end, **row_map}

    if tickers_filter:
        by_company = {t: v for t, v in by_company.items() if t in tickers_filter}
    if limit:
        by_company = dict(list(by_company.items())[:limit])

    print(f"{len(by_company)} empresas com buracos a analisar; "
          f"{len(zero_rows)} empresas com zero rows.")

    explanations: dict = {}
    class_counter = collections.Counter()
    candidate_freq: dict = collections.defaultdict(collections.Counter)
    candidate_tickers: dict = collections.defaultdict(lambda: collections.defaultdict(set))

    for i, (ticker, info) in enumerate(by_company.items()):
        if not info["cik"]:
            # Irmãs dual-class (GOOG/FOX/NWS): sem CIK próprio; os fundamentais
            # são cópia da primária via sync_dual_class — corrigem-se lá.
            explanations[ticker] = {"sector": info["sector"], "currency": info["currency"],
                                    "class": "DUAL_CLASS_SIBLING"}
            continue
        facts_json = ing.fetch_edgar_facts(info["cik"])
        if ing.last_fetch_was_network:
            time.sleep(ing.SLEEP_BETWEEN)
        if not facts_json:
            explanations[ticker] = {"error": "companyfacts indisponível"}
            continue
        facts = facts_json.get("facts") or {}
        ns_us = facts.get("us-gaap") or {}
        ns_ifrs = facts.get("ifrs-full") or {}
        ns = ns_us if len(ns_us) >= len(ns_ifrs) else ns_ifrs  # BTI/DEO-class
        dei = facts.get("dei") or {}
        evidence = ing.compute_company_evidence(facts_json)

        holes = []
        zero_dps = zero_rnd = 0
        for (fy, fp), row in info["periods"].items():
            if row.get("dividendPerShare") == 0.0:
                zero_dps += 1
            if row.get("researchAndDevelopment") == 0.0:
                zero_rnd += 1
            for field in AUDIT_FIELDS:
                if row.get(field) is not None:
                    continue
                res = classify_hole(ns, dei, FIELD_SPECS[field], field, fy, fp,
                                    row["period_end"], row, info["periods"],
                                    info["sector"])
                holes.append(res)
                class_counter[(field, res["class"])] += 1
                for cand in res.get("candidates", []):
                    candidate_freq[field][cand["tag"]] += 1
                    candidate_tickers[field][cand["tag"]].add(ticker)

        explanations[ticker] = {
            "sector": info["sector"], "currency": info["currency"],
            "evidence": evidence,
            "masked_zero_dps_periods": zero_dps if evidence["is_dividend_payer"] else 0,
            "masked_zero_rnd_periods": zero_rnd if evidence["has_rnd_ever"] else 0,
            "holes": holes,
        }
        if (i + 1) % 25 == 0:
            print(f"  [{i+1}/{len(by_company)}] {ticker}")

    zero_diag = [diagnose_zero_rows(t, c) for t, c in zero_rows]

    with open(os.path.join(OUT_DIR, "hole_explanations.json"), "w", encoding="utf-8") as f:
        json.dump({"companies": explanations, "zero_row_companies": zero_diag}, f,
                  ensure_ascii=False, indent=1, default=str)

    # ── structural_nulls.json: whitelist POR-CÉLULA para a auditoria ──
    # Só classes onde as filings comprovadamente NÃO têm o dado (ou o campo é
    # derivado de um input estrutural). Classes acionáveis (TAG_AVAILABLE,
    # UNIT_MISMATCH, EXTRACTOR_LOGIC) NUNCA entram — essas são trabalho.
    STRUCTURAL_CLASSES = {
        "NO_EVIDENCE_IN_FILINGS", "SECTOR_STRUCTURAL",
        "DERIVED_INPUT_MISSING", "SYNTH_INPUT_MISSING",
        "PERIOD_METADATA_MISSING",
    }
    # Componentes de curto prazo: um "valor existente" aqui com LT ausente é o
    # guard JPM/CVNA-class a funcionar (total só-ST seria 8× errado) → estrutural.
    ST_BUCKET_TAGS = {
        "ShortTermBorrowings", "ShortTermDebt", "ShorttermBorrowings",
        "DebtCurrent", "OtherShortTermBorrowings", "ShortTermBankLoansAndNotesPayable",
        "CurrentDebtInstrumentsIssued", "LineOfCredit", "CommercialPaper",
        "CommercialPaperAtCarryingValue", "NotesPayableCurrent",
        "ConvertibleNotesPayableCurrent", "ConvertibleDebtCurrent",
        "LongTermDebtCurrent", "CurrentBorrowings",
    }
    # Tags REJEITADOS na revisão CFA (documentados no ingest): um buraco cujo
    # único suporte são tags rejeitados É estrutural — aceitar seria repetir o
    # auto-healer.
    REJECTED_EXACT = {
        "OtherSellingGeneralAndAdministrativeExpense", "OtherGeneralAndAdministrativeExpense",
        "SellingExpense", "MarketingExpense", "SellingAndMarketingExpense",
        "SalesAndMarketingExpense", "GeneralAndAdministrativeExpense", "AdministrativeExpense",
        "PurchaseOfTreasuryShares", "PaymentsToAcquireOrRedeemEntitysShares",
        "PaymentsForPostemploymentBenefits", "PaymentsForLegalSettlements",
        "PaymentsToAcquireMortgageNotesReceivable", "PaymentsForNuclearFuel",
        "PaymentsForUnderwritingExpense", "PaymentsForEnvironmentalLiabilities",
        "PaymentsToAcquireNotesReceivable",
        "LiabilitiesOtherThanLongtermDebtNoncurrent", "AdvancesToAffiliate",
        "DebtInstrumentFaceAmount",
        "PreferredStockSharesOutstanding", "InvestmentOwnedBalanceShares",
        "ConversionOfStockSharesConverted1", "WeightedAverageNumberOfSharesRestrictedStock",
        "SharesInEntityHeldByEntityOrByItsSubsidiariesOrAssociates",
        "StockRepurchasedAndRetiredDuringPeriodShares",
        "IncrementalCommonSharesAttributableToShareBasedPaymentArrangements",
        "DividendsPaidOtherSharesPerShare", "TreasuryStockAcquiredAverageCostPerShare",
        "EarningsPerShareBasic",
        "OtherRevenue", "RevenueFromDividends", "RevenueFromInterest",
        "RevenueFromRoyalties", "RevenueAndOperatingIncome",
        "RevenueFromGovernmentGrants", "DeferredRevenueCurrent",
        "AmortizationOfDebtDiscountPremium", "DepreciationRightofuseAssets",
        "CashAndSecuritiesSegregatedUnderFederalAndOtherRegulations",
    }
    REJECTED_PATTERNS = re.compile(
        r"Capacity$|^ProceedsFrom|^LoansAndAdvances|ProForma|Impairment|"
        r"^InterestIncomeOn|^InterestRevenue|TaxEffect|RelatedParty|"
        r"SecuredBorrowingsGross|OtherComprehensiveIncome|DisposalGroup|"
        r"InventoryForLongTermContracts|ResultsOfOperations"
    )

    def _all_candidates_rejected(h: dict) -> bool:
        cands = [c.get("tag", "").split(":")[-1] for c in h.get("candidates", [])]
        return bool(cands) and all(
            c in REJECTED_EXACT or REJECTED_PATTERNS.search(c) for c in cands)

    def _is_structural(h: dict) -> bool:
        cls = h.get("class")
        if cls in STRUCTURAL_CLASSES:
            return True
        tag = (h.get("tag") or "").split(":")[-1]
        if h["field"] == "totalDebt" and cls == "EXTRACTOR_LOGIC" and tag in ST_BUCKET_TAGS:
            return True  # guard has_ltd_ever por design
        if (h["field"] in ("operatingCashFlow", "capex") and cls == "EXTRACTOR_LOGIC"
                and h.get("window") == "ytd" and h["fp"] != "FY"):
            return True  # YTD sem vizinho: standalone underivável (cross-tag/gap)
        if cls == "TAG_AVAILABLE_NOT_MAPPED" and _all_candidates_rejected(h):
            return True
        return False

    structural: dict = {}
    for ticker, info in explanations.items():
        if not isinstance(info, dict):
            continue
        for h in info.get("holes", []):
            if _is_structural(h):
                structural.setdefault(ticker, {}).setdefault(
                    f"{h['fy']}-{h['fp']}", []).append(h["field"])
    with open(os.path.join(OUT_DIR, "structural_nulls.json"), "w", encoding="utf-8") as f:
        json.dump({"_doc": "Gerado por explain_holes.py — cada célula aqui foi "
                           "verificada contra o companyfacts: a filing não tem o dado "
                           "(ou o derivado depende de input estrutural). Consumido "
                           "por audit_null_fundamentals.py.",
                   "cells": structural}, f, ensure_ascii=False, indent=1)
    n_cells = sum(len(fs) for t in structural.values() for fs in t.values())
    print(f"structural_nulls.json: {n_cells} células estruturais por-célula")

    # ── relatório de frequência de candidatos (para revisão CFA) ──
    lines = ["# Candidatos a tags por campo (revisão CFA)\n",
             "Shape verificado estruturalmente (instant vs duration), unidade e",
             "âmbito respeitados. Aceitar um tag = adicioná-lo ao array no ingest.\n"]
    lines.append("\n## Classes de buracos\n")
    lines.append("| campo | classe | n |")
    lines.append("|---|---|---|")
    for (field, cls), n in sorted(class_counter.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {field} | {cls} | {n} |")
    for field, counter in candidate_freq.items():
        lines.append(f"\n## {field}\n")
        lines.append("| tag | buracos que preenche | tickers |")
        lines.append("|---|---|---|")
        for tag, n in counter.most_common(25):
            ts = sorted(candidate_tickers[field][tag])
            sample = ",".join(ts[:6]) + ("…" if len(ts) > 6 else "")
            lines.append(f"| `{tag}` | {n} | {len(ts)} ({sample}) |")
    with open(os.path.join(OUT_DIR, "candidate_tag_frequency.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    with open(os.path.join(OUT_DIR, "zero_row_companies.md"), "w", encoding="utf-8") as f:
        f.write("# Empresas com CIK e zero rows\n\n")
        for d in zero_diag:
            f.write(f"## {d['ticker']} (CIK {d['cik']})\n```json\n"
                    + json.dumps(d, ensure_ascii=False, indent=2) + "\n```\n\n")

    masked_dps = sum(1 for e in explanations.values()
                     if isinstance(e, dict) and e.get("masked_zero_dps_periods", 0) > 0)
    print("\n── resumo ──")
    for (field, cls), n in sorted(class_counter.items(), key=lambda kv: -kv[1])[:20]:
        print(f"  {field:24s} {cls:26s} {n}")
    print(f"\nEmpresas payer com DPS=0 mascarado: {masked_dps}")
    print(f"Outputs em {OUT_DIR}/")


if __name__ == "__main__":
    main()
