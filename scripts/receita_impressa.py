"""
Receita total lida da LINHA IMPRESSA na demonstração de resultados (dados DERA, ver
dera_demonstracoes.py).

Porquê: o companyfacts traz várias tags de receita para o mesmo período e a escolha por
prioridade falha quando a empresa imprime o total com uma tag e o subtotal ASC 606 com
outra. A ConocoPhillips imprime "Sales and other operating revenues" = 58,94 mM
(`Revenues`) e tagga à parte a receita de contratos com clientes = 51,82 mM; a Sempra
imprime "Total revenues" = 13,70 mM (`RegulatedAndUnregulatedOperatingRevenue`) e o
ASC 606 = 12,42 mM. O motor ficava com o subtotal. A linha impressa é o número que a
empresa apresenta como a sua receita.

Ao contrário do `Revenues` do companyfacts, a linha impressa não apanha totais de
notas: a Republic Services tagga `Revenues` = 19,03 mM na nota de segmentos (antes de
eliminar vendas entre segmentos) mas imprime "Revenue" = 16,59 mM.

  receitas = para_cik(cik)   # {("AAAA-MM-DD", q): valor}, q = 1 (trimestre) ou 4 (ano)
  python3 scripts/receita_impressa.py COP   → as linhas escolhidas por período
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

# Tags que, IMPRESSAS na demonstração de resultados, são a receita total (ou o seu
# equivalente setorial). Fora: "RevenuesAndOtherIncome" (soma outros proveitos),
# "...IncludingAssessedTax" (receita com impostos especiais) e as linhas parciais.
TAGS_TOTAL = {
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RegulatedAndUnregulatedOperatingRevenue",
    "SalesRevenueNet",
    "RevenuesNetOfInterestExpense",
}
# Impostos especiais impressos como custo (tabaco, bebidas, combustíveis): a receita
# impressa é BRUTA de imposto e a nossa definição é líquida — não se usa.
# (tag que COMEÇA por Excise; "TaxesExcludingIncomeAndExciseTaxes" da COP é o contrário)
_EXCISE_TAG = re.compile(r"^Excise", re.I)
_EXCISE_ROT = re.compile(r"\bexcise\b", re.I)
_OUTRO_PROVEITO_TAG = re.compile(r"EquityMethod|Nonoperating|OtherIncome|InterestDividends|Derivative|Gain|"
                                 r"InvestmentIncome|OtherOperatingIncome|InterestIncome", re.I)
_OUTROS_PROVEITOS = re.compile(r"other income|revenues? and other|and other revenues? and income", re.I)


def receita_da_demonstracao(linhas, data, q, rejeitados=None, confirmados=None):
    """Linhas de um filing → (receita total impressa, tag) para (data AAAAMMDD, q), ou None.
    `rejeitados` (set) recebe (tag, valor) das linhas de receita postas de parte por serem
    "receita + outros proveitos" — servem para as vetar noutros filings. `confirmados` recebe
    as tags aceites com a prova à vista (linhas de outros proveitos impressas abaixo delas)."""
    ist = [l for l in linhas if l["st"] == "IS" and l["data"] == data and l["q"] == q and l["un"] == "USD"]
    if not ist:
        return None
    # Só a PRIMEIRA demonstração de resultados que tem uma linha de receita: um 10-K
    # combinado (utilities) traz a da empresa-mãe primeiro e as das subsidiárias depois.
    rs = sorted({l["r"] for l in ist if l["tag"] in TAGS_TOTAL})
    if not rs:
        return None
    # Impostos especiais procurados em TODA a demonstração do filing (todas as colunas):
    # o 10-K da Altria repete os trimestres só com a linha da receita, sem a do imposto.
    if any(l["st"] == "IS" and (_EXCISE_TAG.search(l["tag"]) or _EXCISE_ROT.search(l.get("rot") or ""))
           for l in linhas):
        return None
    ist = [l for l in ist if l["r"] == rs[0]]
    # Corretoras: a receita é a LÍQUIDA de juros (Raymond James imprime "Total revenues"
    # bruto e "Net revenues"); é a mesma prioridade das tags no motor.
    liquida = [l["v"] for l in ist if l["tag"] == "RevenuesNetOfInterestExpense" and l["v"] and l["v"] > 0]
    if liquida:
        return liquida[0], "RevenuesNetOfInterestExpense"
    # "Receita + outros proveitos": uma linha de receita impressa DEPOIS de linhas que
    # não são receita (associadas, outros proveitos, derivados, juros, mais-valias) é
    # um total que as soma. A ExxonMobil tagga-o `Revenues` e chama-lhe "Total revenues
    # and other income" num ano e só "Total" no seguinte; a EQT põe os ganhos dos
    # hedges dentro de "Total operating revenues". Conta a posição, não o rótulo.
    l_outro = min((l["l"] for l in ist if _OUTRO_PROVEITO_TAG.search(l["tag"])
                   and l["tag"] not in TAGS_TOTAL), default=None)
    vals, fora = [], []
    for l in ist:
        if l["tag"] not in TAGS_TOTAL or not l["v"] or l["v"] <= 0:
            continue
        if (l_outro is None or l["l"] < l_outro) and not _OUTROS_PROVEITOS.search(l.get("rot") or ""):
            vals.append((l["v"], l["tag"]))
        else:
            fora.append((l["tag"], l["v"]))
    if rejeitados is not None:
        rejeitados.update(fora)
    if confirmados is not None and l_outro is not None:
        confirmados.update(t for _, t in vals)
    return max(vals) if vals else None


def carregar(ciks: set[str] | None = None) -> dict:
    """{(cik, "AAAA-MM-DD", q): (valor, filed AAAAMMDD)} tirado do filing MAIS RECENTE que imprime esse
    período (o do próprio período ou o comparativo seguinte) — a mesma regra do motor,
    que usa o número reexpresso mais recente."""
    por_periodo: dict = {}   # k → [(filed, (valor, tag) aceite, {(tag, valor) rejeitados})]
    eventos: dict = {}       # (cik, tag) → [(filed, True = vetada / False = confirmada como receita)]
    for f in sorted(glob.glob(os.path.join(PASTA, "*.json.gz"))):
        for adsh, s in json.load(gzip.open(f)).items():
            if ciks and s["cik"] not in ciks:
                continue
            # Trimestres só dos 10-Q: os 10-K repetem os trimestres em tabelas parciais.
            qs = (1,) if s["form"].startswith("10-Q") else (4,) if s["form"].startswith("10-K") else ()
            chaves = {(l["data"], l["q"]) for l in s["linhas"]
                      if l["st"] == "IS" and l["q"] in qs and l["tag"] in TAGS_TOTAL}
            for data, q in chaves:
                k = (s["cik"], f"{data[:4]}-{data[4:6]}-{data[6:]}", q)
                rej: set = set()
                conf: set = set()
                v = receita_da_demonstracao(s["linhas"], data, q, rej, conf)
                por_periodo.setdefault(k, []).append((s["filed"], v, rej))
                for tag, _ in rej:
                    eventos.setdefault((s["cik"], tag), []).append((s["filed"], True))
                for tag in conf:
                    eventos.setdefault((s["cik"], tag), []).append((s["filed"], False))

    def vetada(cik, tag, filed):
        """O último sinal até este filing diz que a tag é "receita + outros proveitos"?
        A ConocoPhillips usou `Revenues` para esse total até 2020 e para as vendas depois:
        o veto dura até um filing mostrar a tag como receita, com a prova à vista."""
        antes = [e for e in eventos.get((cik, tag), []) if e[0] <= filed]
        return bool(antes) and max(antes)[1]

    out = {}
    for k, lst in por_periodo.items():
        # Um total que um filing mostrou ser "receita + outros proveitos" fica vetado
        # nos outros: o 10-Q seguinte da ExxonMobil repete só a linha do total, sem as
        # componentes que o denunciavam no original.
        #
        # E a TAG fica vetada na empresa a partir desse filing: desde 2023 a ExxonMobil
        # já nem mostra as componentes (estão com dimensões), só o total `Revenues` — mas
        # os 10-Q de 2022 provaram que, nela, `Revenues` é "Total revenues and other income".
        vetados = {x for _, _, r in lst for _, x in r}
        for filed, vt, _ in sorted(lst, key=lambda x: x[0], reverse=True):
            if not vt:
                continue
            v, tag = vt
            if vetada(k[0], tag, filed):
                continue
            if not any(abs(v - x) <= 0.001 * x for x in vetados):
                out[k] = (v, filed)
                break
    return out


_TODAS: dict | None = None
_POR_CIK: dict = {}


def para_cik(cik) -> dict:
    """{("AAAA-MM-DD", q): (receita impressa, filed AAAAMMDD)} de uma empresa; {} sem cache DERA."""
    global _TODAS
    if _TODAS is None:
        _TODAS = carregar() if glob.glob(os.path.join(PASTA, "*.json.gz")) else {}
        for (c, data, q), v in _TODAS.items():
            _POR_CIK.setdefault(c, {})[(data, q)] = v
    return _POR_CIK.get(str(int(cik)), {})


if __name__ == "__main__":
    import psycopg2
    cur = psycopg2.connect(os.getenv("DIRECT_URL", "postgresql://localhost:5432/bullquant_sec")).cursor()
    cur.execute("SELECT cik FROM companies WHERE ticker = %s", (sys.argv[1],))
    cik = cur.fetchone()[0]
    for (_, d, q), (v, filed) in sorted(carregar({str(int(cik))}).items()):
        print(d, "ano" if q == 4 else "trim", f"{v / 1e9:,.2f} mM", "filing de", filed)
