"""
Testes das regras do motor acrescentadas a 19/11 (casos reais como exemplos).

  DIRECT_URL=postgresql://localhost:5432/bullquant_sec python3 scripts/test_regras_motor.py

Sem dependências de testes: cada `check` imprime ✓/✗ e o fim sai com 1 se algum falhou.
Não toca na base (os módulos só a pedem ao importar).
"""
import os
import sys

os.environ.setdefault("DIRECT_URL", "postgresql://localhost:5432/bullquant_sec")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from construir_splits import fator_limpo  # noqa: E402
from divida_balanco import divida_do_balanco  # noqa: E402
import ingest_fundamentals as IF  # noqa: E402
from ingest_fundamentals import melhor_da  # noqa: E402
import validar_fundamentais as V  # noqa: E402

falhas = 0


def check(nome, cond):
    global falhas
    print(("✓ " if cond else "✗ ") + nome)
    falhas += 0 if cond else 1


# ── D&A: o maior entre o total e depreciação + amortização de intangíveis ──
check("D&A MRSH 2024: 369 + 377 = 746",
      melhor_da({"daDDA": 369, "daDep": 369, "daAmortInt": 377}) == 746)
check("D&A NTAP: total 'DepreciationAndAmortization' ganha ao DDA parcial",
      melhor_da({"daDDA": 198, "daDA": 255, "daAmortInt": 57}) == 255)
check("D&A sem nada → None", melhor_da({}) is None)

# ── Splits: só razões simples; spin-offs ficam de fora ──
check("split 2:1", fator_limpo(2.0) == 2.0)
check("GOOGL 1,998 → 2", fator_limpo(1.998) == 2.0)
check("reversa 1:8 (GE)", abs(fator_limpo(0.125) - 0.125) < 1e-12)
check("reversa 1:200 (EXE)", abs(fator_limpo(0.005) - 0.005) < 1e-12)
check("3:2", fator_limpo(1.5) == 1.5)
check("spin-off FTV 1,195 rejeitado", fator_limpo(1.195) is None)
check("spin-off DHR 1,319 rejeitado", fator_limpo(1.319) is None)
check("spin-off DHR 1,128 rejeitado", fator_limpo(1.128) is None)

IF._splits_eventos_cache = {"SNDK": [{"data": "2026-11-20", "fator": 8.0}]}
check("split anunciado (SNDK 8:1 a 20/11/2026) não se aplica antes da data",
      IF.fator_split_para_filed("SNDK", "2026-08-01", hoje="2026-11-19") == 1.0)
check("… e aplica-se depois da data",
      IF.fator_split_para_filed("SNDK", "2026-08-01", hoje="2026-11-21") == 8.0)
IF._splits_eventos_cache = None


# ── Dívida lida do balanço ──
def linha(r, l, tag, rot, v, st="BS"):
    return {"st": st, "r": r, "l": l, "tag": tag, "rot": rot, "v": v, "data": "20241231", "q": 0,
            "un": "USD", "propria": False, "neg": False}


exr = [linha(2, 1, "Assets", "Total assets", 28_847_926_000),
       linha(2, 2, "OtherNotesPayable", "Secured notes payable, net", 1_010_541_000),
       linha(2, 3, "UnsecuredDebt", "Unsecured term loans, net", 2_192_507_000),
       linha(2, 4, "SeniorNotes", "Unsecured senior notes, net", 7_756_968_000),
       linha(2, 5, "LineOfCredit", "Revolving lines of credit and commercial paper", 1_362_000_000),
       linha(2, 6, "OperatingLeaseLiability", "Operating lease liabilities", 705_845_000),
       linha(2, 7, "LiabilitiesOtherThanLongtermDebtNoncurrent", "Other liabilities", 538_865_000),
       linha(2, 8, "StockholdersEquity", "Total stockholders' equity", 13_947_535_000)]
v, usadas = divida_do_balanco(exr, "20241231")
check("EXR 2024: quatro linhas de dívida = 12 322 016 mil (sem leasings nem outros passivos)",
      abs(v - 12_322_016_000) < 1)
sub = exr + [linha(9, 1, "Assets", "Total assets", 1), linha(9, 2, "LongTermDebtNoncurrent", "Long-term debt", 999)]
check("só o PRIMEIRO balanço (10-K combinado com subsidiárias)",
      abs(divida_do_balanco(sub, "20241231")[0] - 12_322_016_000) < 1)

# ── Validador ──
V._alertas.clear()
rows = [{"fiscalYear": 2023, "fiscalQuarter": q, "periodType": "QUARTERLY", "dividendPerShare": 0.025}
        for q in (1, 2, 3, 4)]
rows.append({"fiscalYear": 2023, "fiscalQuarter": None, "periodType": "ANNUAL", "dividendPerShare": 0.025})
V.validar("IBKR", rows)
check("IBKR 2023: dividendo anual < 3 trimestres → anual e Q4 anulados",
      rows[-1]["dividendPerShare"] is None and rows[3]["dividendPerShare"] is None
      and rows[0]["dividendPerShare"] == 0.025)
r = {"fiscalYear": 2024, "fiscalQuarter": None, "periodType": "ANNUAL", "revenue": 100.0, "grossProfit": 150.0,
     "sharesOutstanding": -5, "grossMargin": 1.5}
V.validar("X", [r])
check("lucro bruto > receita e ações negativas → anulados",
      r["grossProfit"] is None and r["sharesOutstanding"] is None and r["grossMargin"] is None)
V._alertas.clear()
b = {"fiscalYear": 2024, "fiscalQuarter": None, "periodType": "ANNUAL", "totalAssets": 100.0,
     "totalLiabilities": 60.0, "totalEquity": 30.0, "_minoritarios": 7.0, "_capitalTemporario": 3.0}
V.validar("Y", [b])
check("balanço fecha com minoritários + capital temporário → sem alerta",
      not any(a["motivo"].startswith("ativo") for a in V._alertas))

# ── Segmentos: só eixos que fecham com a receita gravada ──
from ingest_segments_xbrl import eixos_coerentes  # noqa: E402
rsg = {"segment": {"Group 1": 8.6, "Group 2": 8.2, "Group 3": 1.8, "Corporate": 0.4},
       "product": {"Landfill": 4.0, "Collection": 12.6}}
ok = eixos_coerentes(rsg, 16.6)
check("RSG: segmentos antes de eliminações (+15%) rejeitados; produto que fecha fica",
      "segment" not in ok and "product" in ok)
trgp = {"segment": {"Other": 0.0, "Reconciling items": 22.0, "Corporate and Eliminations": -4.9}}
check("TRGP: partição feita de linhas de reconciliação rejeitada", eixos_coerentes(trgp, 17.0) == {})
check("sem receita gravada → eixos passam", eixos_coerentes(rsg, None) == rsg)

# ── Receita: a linha impressa na demonstração de resultados ──
import receita_impressa as RI  # noqa: E402


def li(l, tag, rot, v, r=3, data="20251231", q=4):
    return {"st": "IS", "r": r, "l": l, "tag": tag, "rot": rot, "v": v, "data": data, "q": q, "un": "USD"}


cop = [li(2, "Revenues", "Sales and other operating revenues", 58.94e9),
       li(3, "IncomeLossFromEquityMethodInvestments", "Equity in earnings of affiliates", 1.33e9),
       li(6, "RevenuesAndOtherIncome", "Total revenues and other income", 61.55e9)]
check("COP 2025: 'Sales and other operating revenues' 58,94 mM (não o subtotal ASC 606)",
      RI.receita_da_demonstracao(cop, "20251231", 4) == (58.94e9, "Revenues"))
rej = set()
cvx = [li(2, "RevenueFromContractWithCustomerExcludingAssessedTax", "Sales and other operating revenues", 193.41e9),
       li(3, "EquityMethodInvestmentIncome", "Income (loss) from equity affiliates", 4.60e9),
       li(5, "Revenues", "Total", 202.79e9)]
check("CVX: total com associadas (mesmo só 'Total') fica de fora e é vetado",
      RI.receita_da_demonstracao(cvx, "20251231", 4, rej)[0] == 193.41e9 and ("Revenues", 202.79e9) in rej)
mo = [li(1, "RevenueFromContractWithCustomerExcludingAssessedTax", "Net revenues", 23.28e9),
      li(3, "OtherCostOfOperatingRevenue", "Excise taxes on products", 3.14e9)]
check("MO: receita impressa com impostos especiais → não se usa", RI.receita_da_demonstracao(mo, "20251231", 4) is None)
rjf = [li(1, "Revenues", "Total revenues", 15.91e9), li(3, "RevenuesNetOfInterestExpense", "Net revenues", 14.07e9)]
check("RJF: corretora usa a receita líquida de juros",
      RI.receita_da_demonstracao(rjf, "20251231", 4)[0] == 14.07e9)

# ── Dívida do balanço: leitura das linhas (casos do Codex, auditados) ──
hca = [linha(2, 1, "Assets", "Total assets", 59e9),
       linha(2, 27, "LongTermDebtCurrent", "Long-term debt due within one year", 4.698e9),
       linha(2, 29, "LongTermDebtNoncurrent", "Long-term debt, less debt issuance costs and discounts of $3", 38.333e9)]
check("HCA: 'less debt issuance costs' é a dívida líquida, não o custo",
      abs(divida_do_balanco(hca, "20241231")[0] - 43.031e9) < 1)
aep = [linha(2, 1, "Assets", "Total assets", 100e9),
       linha(2, 10, "ShortTermBankLoansAndNotesPayable", "Other Short-term Debt", 0.7817e9),
       linha(2, 11, "ShortTermBorrowings", "Total Short-term Debt", 1.6817e9),
       linha(2, 12, "LongTermDebtCurrent", "Long-term Debt Due Within One Year", 2.0719e9),
       linha(2, 20, "LongTermDebtNoncurrent", "Long-term Debt", 39.9904e9)]
check("AEP: 'Total Short-term Debt' cobre a linha logo acima (sem dupla contagem)",
      abs(divida_do_balanco(aep, "20241231")[0] - (1.6817e9 + 2.0719e9 + 39.9904e9)) < 1e3)
mos = [linha(2, 1, "Assets", "Total assets", 23e9),
       linha(2, 5, "ShortTermBankLoansAndNotesPayable", "Structured accounts payable arrangements", 0.2658e9),
       linha(2, 6, "LongTermDebtNoncurrent", "Long-term debt, less current maturities", 3.1944e9)]
check("MOS: financiamento de fornecedores não é dívida", abs(divida_do_balanco(mos, "20241231")[0] - 3.1944e9) < 1)
cms = [linha(2, 1, "Assets", "Total assets", 37e9),
       linha(2, 37, "LongTermDebtAndLeaseObligationCurrentExcludingNotesPayable",
             "Current portion of long-term debt and finance leases", 1.195e9),
       linha(2, 38, "NotesPayableCurrent", "Notes payable", 0.065e9),
       linha(2, 47, "LongTermDebtNoncurrent", "Long-term debt", 15.194e9),
       linha(2, 48, "OperatingLeaseLiabilityNoncurrent", "Operating lease liabilities", 0.3e9)]
v_cms, u_cms = divida_do_balanco(cms, "20241231")
check("CMS: dívida + leasings financeiros conta; leasings operacionais não", abs(v_cms - 16.454e9) < 1e3)
import divida_balanco as DB  # noqa: E402
check("leitura sem dívida de longo prazo é incompleta (não pode baixar o valor das tags)",
      not DB.completa([("ShortTermBorrowings", "Short-term borrowings", 0)]) and DB.completa(u_cms))

# ── Caixa: aplicações impressas no ativo corrente ──
import aplicacoes_balanco as AB  # noqa: E402
ba = [linha(4, 1, "Assets", "Total assets", 152e9),
      linha(4, 2, "CashAndCashEquivalentsAtCarryingValue", "Cash and cash equivalents", 7.752e9),
      linha(4, 6, "ShortTermInvestments", "Short-term and other investments", 17.838e9),
      linha(4, 9, "AssetsCurrent", "Total current assets", 121e9),
      linha(4, 12, "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "Investments", 1e9)]
check("BA 2020: aplicações = 'Short-term and other investments' 17,8 mM (só o ativo corrente)",
      AB.aplicacoes_do_balanco(ba, "20241231")[0] == 17.838e9)

# ── Splits desmentidos pelas ações da capa ──
dei = {"EntityCommonStockSharesOutstanding": {"units": {"shares": [
    {"end": "2021-09-30", "val": 979e6, "filed": "2021-11-01", "accn": "a"},
    {"end": "2022-03-31", "val": 980e6, "filed": "2022-04-29", "accn": "b"}]}}}
check("EXC 2022: fator 1,4 com ações iguais = spin-off, não split", IF.split_desmentido(dei, "2022-02-02", 1.4))
dei2 = {"EntityCommonStockSharesOutstanding": {"units": {"shares": [
    {"end": "2024-05-24", "val": 2.46e9, "filed": "2024-05-29", "accn": "a"},
    {"end": "2024-08-23", "val": 24.5e9, "filed": "2024-08-28", "accn": "b"}]}}}
check("NVDA 2024: 10:1 confirmado pelas ações", not IF.split_desmentido(dei2, "2024-06-10", 10.0))

# ── EBIT reconstruído de baixo (ADP 1T FY25, sem linha de resultado operacional) ──
check("ADP: 1.236 antes de impostos + 138 juros − 102 não operacionais = 1.272 M",
      abs(IF.ebit_de_baixo({"incomeBeforeTax": 1236e6, "interestExpense": 138e6,
                            "otherNonOperatingIncome": 102e6}) - 1272e6) < 1)

# ── Alertas dos filings novos: padrão (≥3 empresas) vs isolado ──
import alertas_novos as AN  # noqa: E402
al = [{"ticker": t, "periodo": "2026Q3", "campo": "totalDebt", "nivel": "sinalizar", "motivo": "m1",
       "filed": "2026-11-05"} for t in ("A", "B", "C")]
al.append({"ticker": "D", "periodo": "2026Q3", "campo": "cash", "nivel": "sinalizar", "motivo": "m2", "filed": "2026-11-05"})
g = {x["motivo"]: x["tipo"] for x in AN.triar(al)}
check("mesmo motivo em 3 empresas = padrão; numa só = isolado", g == {"m1": "padrão", "m2": "isolado"})

# ── Recompras lidas do cash flow impresso (fluxos_impressos.py) ──
import fluxos_impressos as FI  # noqa: E402


def cf(l, tag, rot, v, seg=None, data="20260930", q=3):
    x = {"st": "CF", "r": 6, "l": l, "tag": tag, "rot": rot, "data": data, "q": q, "un": "USD", "v": v}
    if seg:
        x["seg"] = seg
    return x


base = [cf(1, "NetIncomeLoss", "Net income", 5e9), cf(2, "NetCashProvidedByUsedInOperatingActivities", "OCF", 7e9),
        cf(3, "PaymentsToAcquirePropertyPlantAndEquipment", "Capex", 1e9),
        cf(9, "PaymentsOfDividends", "Dividends paid", 1e9)]
check("KEY: recompras em bolsa (tag própria); a linha do plano de empregados sai",
      FI.recompras_do_cf(base + [cf(5, "PaymentsForRepurchaseOfCommonStockOpenMarket", "Common Share repurchases", 1047e6),
                                 cf(6, "PaymentsForRepurchaseOfOtherEquity",
                                    "Employee equity compensation program Common Share repurchases", 47e6)],
                         "20260930", 3) == 1047e6)
check("IBM: só retenções para impostos → não há recompra (0)",
      FI.recompras_do_cf(base + [cf(5, "PaymentsRelatedToTaxWithholdingForShareBasedCompensation",
                                    "Common stock repurchases for tax withholdings", 817e6)], "20260930", 3) == 0)
check("FDX: total e parcelas dos programas com a mesma tag → o total",
      FI.recompras_do_cf(base + [cf(5, "PaymentsForRepurchaseOfCommonStock", "Purchases of common stock", 900e6),
                                 cf(6, "PaymentsForRepurchaseOfCommonStock", "2024 program", 200e6),
                                 cf(7, "PaymentsForRepurchaseOfCommonStock", "2026 program", 700e6)],
                         "20260930", 3) == 900e6)
check("TSN: linha impressa só com o membro da classe A conta",
      FI.recompras_do_cf(base + [cf(5, "PaymentsForRepurchaseOfCommonStock", "Repurchase of common stock", 123e6,
                                    seg="ClassOfStock=CommonClassA;")], "20260930", 3) == 123e6)
check("FANG: a tag padrão manda; as unidades da subsidiária (tag própria) saem",
      FI.recompras_do_cf(base + [cf(5, "PaymentsForRepurchaseOfCommonStock", "Repurchased shares", 431e6,
                                    seg="RelatedPartyTransactionsByRelatedParty=NonrelatedParty;"),
                                 cf(5, "PaymentsForRepurchaseOfCommonStock", "Repurchased shares", 509e6,
                                    seg="RelatedPartyTransactionsByRelatedParty=RelatedParty;"),
                                 cf(6, "PaymentsForRepurchaseOfCommonStockUnits",
                                    "Repurchased shares/units under Viper's repurchase program", 318e6)],
                         "20260930", 3) == 940e6)
check("cash flow sem linha de recompra → 0; acordos de recompra (repos) e preferenciais não contam",
      FI.recompras_do_cf(base + [cf(5, "IncreaseDecreaseInPayablesUnderRepurchaseAgreements",
                                    "Securities sold under agreements to repurchase", 13e9),
                                 cf(6, "PaymentsForRepurchaseOfPreferredStockAndPreferenceStock",
                                    "Preferred stock repurchased", 538e6)], "20260930", 3) == 0)
check("sem cash flow nessa coluna → None (não se inventa zero)",
      FI.recompras_do_cf(base, "20250930", 3) is None)
check("KEY: coluna de 3 meses com linhas soltas (sem o total operacional) não é cash flow → None",
      FI.recompras_do_cf([cf(1, "NetIncomeLoss", "Net income", 5e8, q=1), cf(2, "ProvisionForLoanLossesExpensed",
                          "Provision", 1e8, q=1), cf(3, "Depreciation", "Depreciation", 1e8, q=1)], "20260930", 1) is None)

print(f"\n{'OK' if not falhas else f'{falhas} FALHA(S)'}")
sys.exit(1 if falhas else 0)
