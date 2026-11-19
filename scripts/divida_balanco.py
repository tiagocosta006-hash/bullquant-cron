"""
Dívida total lida das LINHAS IMPRESSAS do balanço (dados DERA da SEC, ver dera_demonstracoes.py).

O método é o de um analista com o relatório à frente: percorre o passivo do
balanço e soma as linhas de dívida financeira (curto + longo prazo, papel
comercial, linhas de crédito, notas e obrigações), sem leasings — incluindo as
linhas com tags próprias da empresa, que o companyfacts não traz.

  dividas = carregar()                 # {(cik, "AAAA-MM-DD"): (valor, [linhas usadas])}
  python3 scripts/divida_balanco.py EXR  → mostra as linhas escolhidas por período
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

# Linha de dívida: pela tag OU pelo rótulo impresso.
_TAG = re.compile(
    r"(Debt|Borrowings?|NotesPayable|SeniorNotes|CommercialPaper|LineOfCredit|Debentures|"
    r"ConvertibleNotes|LoansPayable|BankLoans|SecuredDebt|UnsecuredDebt|FederalHomeLoanBankAdvances|"
    r"Bonds?Payable|TermLoan|MortgageNotes|MortgageLoans)", re.I)
_ROT = re.compile(
    r"\b(debt|borrowings?|notes payable|senior notes|commercial paper|lines? of credit|credit facilit|"
    r"debentures|term loans?|bonds payable|mortgage notes|mortgages payable|loans payable|"
    r"current (portion|maturities) of long-term)\b", re.I)
# Nunca é dívida financeira no nosso conceito (ou é ativo, ou é outra coisa).
_FORA = re.compile(
    r"(^Liabilities|OtherThan|Affiliate|Overdraft|Lease|Receivable|Securities|Investment|Interest(Payable)?$|AccruedInterest|DeferredFinancing|"
    r"IssuanceCost|Discount|Premium|Derivative|Guarantee|Deposits?$|Customer|Payable(Current)?AndAccrued|"
    r"Fair ?Value|Hedge|Warrant|Tax|Pension|Revenue|Contract)", re.I)
_ROT_FORA = re.compile(r"(lease|receivable|interest payable|accrued interest|issuance cost|investments?\b|"
                       r"held-to-maturity|available-for-sale|guarantee|deferred revenue)", re.I)
_TOTAL = re.compile(r"^\s*total\b", re.I)


def _e_divida(l):
    t, r = l["tag"], l["rot"] or ""
    if _FORA.search(t) or _ROT_FORA.search(r):
        return False
    return bool(_TAG.search(t) or _ROT.search(r))


def divida_do_balanco(linhas, data):
    """Linhas do balanço (de um filing) → (soma, usadas) para a data; None se não houver dívida legível."""
    bs = sorted((l for l in linhas if l["st"] == "BS" and l["data"] == data and l["q"] == 0
                 and l["un"] == "USD"), key=lambda l: (l["r"], l["l"]))
    if not bs:
        return None
    # Só o PRIMEIRO balanço do filing (o da empresa-mãe): utilities como a
    # Dominion, a PPL e a Duke entregam um 10-K combinado com os balanços das
    # subsidiárias, e somá-los todos duplicava a dívida.
    r0 = min((l["r"] for l in bs if l["tag"] == "Assets"), default=None)
    if r0 is None:
        return None
    bs = [l for l in bs if l["r"] == r0]
    # só o passivo: a seguir à linha do ativo total e antes do capital próprio
    i0 = next((i for i, l in enumerate(bs) if l["tag"] == "Assets"), None)
    if i0 is None:
        return None
    fim = next((i for i in range(i0 + 1, len(bs))
                if bs[i]["tag"] in ("StockholdersEquity", "CommitmentsAndContingencies",
                                    "LiabilitiesAndStockholdersEquity")
                or "TemporaryEquity" in bs[i]["tag"] or bs[i]["tag"].startswith(("CommonStock", "PreferredStock"))),
               len(bs))
    passivo = bs[i0 + 1:fim]
    vistas, usadas = set(), []
    for l in passivo:
        if not _e_divida(l) or l["tag"] in vistas:
            continue
        vistas.add(l["tag"])
        usadas.append(l)
    # Um "Total debt" impresso a seguir às parcelas não pode somar-se a elas.
    if any(_TOTAL.search(l["rot"] or "") for l in usadas):
        parcelas = [l for l in usadas if not _TOTAL.search(l["rot"] or "")]
        totais = [l for l in usadas if _TOTAL.search(l["rot"] or "")]
        if parcelas and any(abs(sum(p["v"] for p in parcelas) - t["v"]) <= 0.01 * abs(t["v"]) for t in totais):
            usadas = totais[:1]
        else:
            usadas = parcelas or totais[:1]
    if not usadas:
        return None
    return sum(l["v"] for l in usadas), [(l["tag"], l["rot"], l["v"]) for l in usadas]


def carregar(ciks: set[str] | None = None) -> dict:
    """Uma dívida por (cik, data de fecho), tirada do filing MAIS RECENTE que
    mostra essa data no balanço (o do próprio período ou o comparativo do ano
    seguinte) — a mesma regra do motor, que usa o valor reexpresso mais recente
    (LLY 2018 depois do spin-off da Elanco)."""
    melhor: dict = {}
    for f in sorted(glob.glob(os.path.join(PASTA, "*.json.gz"))):
        for adsh, s in json.load(gzip.open(f)).items():
            if ciks and s["cik"] not in ciks:
                continue
            datas = {l["data"] for l in s["linhas"] if l["st"] == "BS" and l["q"] == 0 and l["tag"] == "Assets"}
            for data in datas:
                k = (s["cik"], f"{data[:4]}-{data[4:6]}-{data[6:]}")
                rank = s["filed"]
                if k in melhor and melhor[k][0] >= rank:
                    continue
                r = divida_do_balanco(s["linhas"], data)
                if r is not None:
                    melhor[k] = (rank, r)
    return {k: v[1] for k, v in melhor.items()}


if __name__ == "__main__":
    import psycopg2
    cur = psycopg2.connect(os.getenv("DIRECT_URL", "postgresql://localhost:5432/bullquant_sec")).cursor()
    cur.execute("SELECT cik FROM companies WHERE ticker = %s", (sys.argv[1],))
    cik = str(int(cur.fetchone()[0]))
    for (c, data), (v, usadas) in sorted(carregar({cik}).items()):
        print(f"{data}  {v:>18,.0f}")
        for t, r, x in usadas:
            print(f"      {x:>16,.0f}  {t[:45]:45} {r[:60]}")


_TODAS: dict | None = None
_POR_CIK: dict = {}


def para_cik(cik) -> list:
    """[(data, valor)] da dívida do balanço de uma empresa. Carrega a cache DERA
    uma única vez por processo; sem a pasta (ex.: ainda não descarregada no CI)
    devolve [] e o motor segue só com as tags."""
    global _TODAS
    if _TODAS is None:
        _TODAS = carregar() if glob.glob(os.path.join(PASTA, "*.json.gz")) else {}
        for (c, data), (v, _) in _TODAS.items():
            _POR_CIK.setdefault(c, []).append((data, v))
    return _POR_CIK.get(str(int(cik)), [])
