"""
Aplicações de curto prazo lidas das LINHAS IMPRESSAS do ativo corrente (dados DERA da SEC).

A caixa da BullValue é caixa e equivalentes + aplicações de curto prazo. As tags de
aplicações do companyfacts misturam o total do balanço com parcelas das notas, e a
escolha por prioridade apanhava a parcela:
  · Boeing 2020: AvailableForSaleSecurities = 0,6 mM (uma nota) em vez de
    "Short-term and other investments" = 17,8 mM, que é o que o balanço imprime;
  · NetApp, Hubbell, Cognizant: o mesmo, nos dois sentidos.
O balanço resolve: as aplicações são as linhas de títulos/aplicações impressas ACIMA
de "Total current assets". Sem ativo corrente (bancos, seguradoras) devolve None e o
motor fica com as tags.

  aplicacoes = para_cik(cik)    # {"AAAA-MM-DD": (valor, [linhas usadas])}
  python3 scripts/aplicacoes_balanco.py BA   → as linhas escolhidas por data
"""
from __future__ import annotations

import glob
import gzip
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTA = os.path.join(AQUI, ".cache", "dera")

_TAGS = {
    "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    "AvailableForSaleSecuritiesCurrent", "AvailableForSaleSecurities", "ShortTermInvestments",
    "DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent", "OtherShortTermInvestments",
    "HeldToMaturitySecuritiesCurrent", "DebtSecuritiesHeldToMaturityAmortizedCostAfterAllowanceForCreditLossCurrent",
    "TradingSecuritiesCurrent", "EquitySecuritiesFvNiCurrentAndNoncurrent", "TimeDepositsAtCarryingValue",
    "MarketableSecurities", "AvailableForSaleSecuritiesDebtSecurities", "ShortTermInvestmentsAndOtherInvestments",
}
# Tags próprias da empresa: pelo rótulo impresso.
_ROT = re.compile(r"short[- ]term (and other )?investments|marketable securities|time deposits|"
                  r"available[- ]for[- ]sale|investment securities|short[- ]term deposits", re.I)
_FORA = re.compile(r"restricted|cash and cash equivalents|total", re.I)


def aplicacoes_do_balanco(linhas, data):
    """Linhas do balanço (de um filing) → (soma, usadas) das aplicações correntes; None
    se o balanço não tiver ativo corrente legível."""
    bs = sorted((l for l in linhas if l["st"] == "BS" and l["data"] == data and l["q"] == 0
                 and l["un"] == "USD"), key=lambda l: (l["r"], l["l"]))
    r0 = min((l["r"] for l in bs if l["tag"] == "Assets"), default=None)
    if r0 is None:
        return None
    bs = [l for l in bs if l["r"] == r0]
    i_fim = next((i for i, l in enumerate(bs) if l["tag"] == "AssetsCurrent"), None)
    if i_fim is None:
        return None   # balanço sem ativo corrente (bancos, seguradoras): não se sabe
    usadas, vistas = [], set()
    for l in bs[:i_fim]:
        rot = l.get("rot") or ""
        if l["tag"] in vistas or _FORA.search(rot):
            continue
        if l["tag"] in _TAGS or (l.get("propria") and _ROT.search(rot)):
            vistas.add(l["tag"])
            usadas.append(l)
    return sum(l["v"] for l in usadas), [(l["tag"], l.get("rot"), l["v"]) for l in usadas]


def carregar(ciks: set[str] | None = None) -> dict:
    """{(cik, "AAAA-MM-DD"): (valor, usadas)} do filing MAIS RECENTE que imprime a data."""
    melhor: dict = {}
    for f in sorted(glob.glob(os.path.join(PASTA, "*.json.gz"))):
        for adsh, s in json.load(gzip.open(f)).items():
            if ciks and s["cik"] not in ciks:
                continue
            datas = {l["data"] for l in s["linhas"] if l["st"] == "BS" and l["q"] == 0 and l["tag"] == "AssetsCurrent"}
            for data in datas:
                k = (s["cik"], f"{data[:4]}-{data[4:6]}-{data[6:]}")
                if k in melhor and melhor[k][0] >= s["filed"]:
                    continue
                r = aplicacoes_do_balanco(s["linhas"], data)
                if r is not None:
                    melhor[k] = (s["filed"], r)
    return {k: v[1] for k, v in melhor.items()}


_TODAS: dict | None = None
_POR_CIK: dict = {}


def para_cik(cik) -> dict:
    """{"AAAA-MM-DD": (valor, usadas)} de uma empresa; {} sem cache DERA."""
    global _TODAS
    if _TODAS is None:
        _TODAS = carregar() if glob.glob(os.path.join(PASTA, "*.json.gz")) else {}
        for (c, data), v in _TODAS.items():
            _POR_CIK.setdefault(c, {})[data] = v
    return _POR_CIK.get(str(int(cik)), {})


if __name__ == "__main__":
    import psycopg2
    cur = psycopg2.connect(os.getenv("DIRECT_URL", "postgresql://localhost:5432/bullquant_sec")).cursor()
    cur.execute("SELECT cik FROM companies WHERE ticker = %s", (sys.argv[1],))
    cik = str(int(cur.fetchone()[0]))
    for (_, data), (v, usadas) in sorted(carregar({cik}).items()):
        print(f"{data}  {v:>18,.0f}")
        for t, r, x in usadas:
            print(f"      {x:>16,.0f}  {t[:45]:45} {(r or '')[:60]}")
