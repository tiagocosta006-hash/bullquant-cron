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

print(f"\n{'OK' if not falhas else f'{falhas} FALHA(S)'}")
sys.exit(1 if falhas else 0)
