"""
fluxos_impressos.py — Recompras de ações lidas da demonstração de fluxos de caixa IMPRESSA.

O companyfacts só traz tags padrão sem dimensões. As recompras escapam-lhe de três formas,
todas vistas nos filings de 2026:
  · tag própria da empresa — BLK "Shares/Subco Units repurchased", KEY "Common Share
    repurchases", GRMN "…under share repurchase plan", DD "Purchases of common stock and
    forward contracts", APA "Treasury stock activity, net", BX, MS, FISV, AMCR, FFIV;
  · tag padrão com dimensão — TSN (só na classe A), FANG (partes relacionadas / não);
  · linha que só aparece quando há pagamentos — SYK não recomprou no 1.º semestre e o 10-Q
    do Q2 não tem a linha; sem esse acumulado, o Q3 (9M − 6M) e o Q4 ficavam N/A.

Aqui lê-se a linha no cash flow de cada filing (DERA + recentes, formato de
dera_demonstracoes.py) e o resultado entra no motor como a ÚLTIMA tag da lista das
recompras (TAG_IMPRESSA): só conta quando nenhuma tag padrão tem valor para o período.

Regras (gerais, sem empresas):
  1. Linhas candidatas: rótulo de recompra de ações próprias (ou tag de recompra), fora
     preferenciais, acordos de recompra (repos), dívida, emissões/vendas de ações próprias,
     interesses minoritários.
  2. Se há uma linha com a tag padrão (PaymentsForRepurchaseOfCommonStock/Equity), essa é a
     definição e as linhas de tag própria saem (FANG: as unidades da Viper, subsidiária).
  3. Linhas só de retenções para impostos / planos de empregados saem se houver outra
     (KEY, GRMN, SWKS); se forem a ÚNICA e a tag for a de retenções, não há recompra (IBM).
     Uma linha que junta as duas coisas (MS, FISV, URI) fica — não há como separar.
  4. Linha só com valores por membro de UMA dimensão: soma dos membros (TSN: 1 membro;
     FANG: relacionadas + não relacionadas = a linha impressa).
  5. Várias linhas: por tag fica o maior (o total e as suas parcelas — FDX imprime o total e
     os dois programas com a mesma tag); somam-se tags diferentes.
  6. Cash flow impresso SEM nenhuma linha de recompra (nem com dimensões) → 0.
"""
from __future__ import annotations

import datetime as dt
import glob
import gzip
import json
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTA = os.path.join(AQUI, ".cache", "dera")
TAG_IMPRESSA = "_RecomprasImpressasNoCashFlow"

_OCF_TAG = re.compile(r"^NetCashProvidedByUsedInOperatingActivities|^CashFlowsFromUsedInOperatingActivities")
_OCF_ROT = re.compile(r"net cash (provided|used|generated|from).*operating activities", re.I)
_TAGS_PADRAO = {"PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"}
_TAG_RETENCOES = re.compile(r"^PaymentsRelatedToTaxWithholdingForShareBasedCompensation$")
_ROT = re.compile(
    r"repurchas|buy-?backs?|treasury (stock|shares?)|"
    r"purchases? of (the company.s |our |own )?(common|ordinary|class [a-z]|capital|treasury)?\s*(stock|shares|units)|"
    r"acquisition of (own|treasury|common)|shares? (and|/)[^,]* repurchased|stock repurchased",
    re.I)
_TAG = re.compile(r"Repurchase|TreasuryStock.*Acquired|PaymentsToAcquireOrRedeemEntitysShares|PurchaseOfTreasuryShares")
_FORA = re.compile(
    r"preferred|preference|agreements? to repurchase|repurchase agreements?|securities (sold|purchased)|"
    r"\bnotes?\b|\bdebt\b|\bloans?\b|borrowing|senior|bonds?|debentures?|convertible|"
    r"non-?controlling|minority|proceeds|issuance|issued|sale of treasury|sales of treasury|reissu",
    re.I)
_TAG_FORA = re.compile(r"^(Proceeds|Repayments|IncreaseDecrease|InterestExpense|Securities|"
                       r"PaymentsForRepurchaseOfPreferred|PaymentsForRepurchaseOfRedeemable|"
                       r"PaymentsForRepurchaseOfOtherEquity|.*Debt|.*Notes)")
_RETENCOES = re.compile(r"withh|tax(es)? (paid|obligation|withholding)|employee|equity awards?|"
                        r"share-?based (compensation|incentive)|vest", re.I)


def _candidata(l) -> bool:
    rot, tag = l.get("rot") or "", l["tag"]
    if _TAG_FORA.match(tag) or _FORA.search(rot):
        return False
    return bool(_ROT.search(rot) or _TAG.search(tag) or _TAG_RETENCOES.match(tag))


def recompras_do_cf(linhas, data: str, q: int):
    """Recompras (valor positivo) no cash flow impresso para a coluna (data, q).
    None = não há cash flow nessa coluna; 0 = há cash flow e não tem linha de recompra."""
    cf = [l for l in linhas if l["st"] == "CF" and l["data"] == data and l["q"] == q and l["un"] == "USD"]
    # Só é "o cash flow desta coluna" se tiver o total do fluxo operacional: os 10-Q de
    # bancos (KEY) trazem colunas de 3 meses com meia dúzia de linhas soltas, e "não há
    # linha de recompra" ali NÃO quer dizer zero.
    if not any(not l.get("seg") and (_OCF_TAG.search(l["tag"]) or _OCF_ROT.search(l.get("rot") or ""))
               for l in cf):
        return None
    # agrupar por linha impressa (relatório, nº da linha): valor sem dimensões ou soma dos membros
    por_linha: dict = {}
    for l in cf:
        if _candidata(l):
            por_linha.setdefault((l["r"], l["l"], l["tag"]), []).append(l)
    linhas_rec = []
    for (r, n, tag), ls in por_linha.items():
        sem = [l for l in ls if not l.get("seg")]
        if sem:
            v = abs(sem[0]["v"])
        else:
            eixos = {l["seg"].split("=", 1)[0] for l in ls}
            if len(eixos) != 1 or any(";" in l["seg"].rstrip(";") for l in ls):
                continue   # várias dimensões cruzadas: não se sabe qual é o total
            v = sum(abs(l["v"]) for l in ls)
        linhas_rec.append({"tag": tag, "rot": ls[0].get("rot") or "", "v": v,
                           "propria": ls[0].get("propria"), "l": n})
    if not linhas_rec:
        return 0.0
    padrao = [x for x in linhas_rec if x["tag"] in _TAGS_PADRAO]
    if padrao:
        linhas_rec = padrao + [x for x in linhas_rec if _TAG_RETENCOES.match(x["tag"])]

    def retencao(x):
        # a tag padrão é recompra por definição, mesmo que o rótulo diga "incluindo retenções"
        return bool(_TAG_RETENCOES.match(x["tag"])) or (x["tag"] not in _TAGS_PADRAO
                                                         and bool(_RETENCOES.search(x["rot"])))
    outras = [x for x in linhas_rec if not retencao(x)]
    if outras:
        linhas_rec = outras
    elif all(_TAG_RETENCOES.match(x["tag"]) for x in linhas_rec):
        return 0.0   # só retenções para impostos (IBM): não é recompra
    por_tag: dict = {}
    for x in linhas_rec:
        por_tag[x["tag"]] = max(por_tag.get(x["tag"], 0.0), x["v"])
    vals = sorted(por_tag.values(), reverse=True)
    if len(vals) > 1 and abs(vals[0] - sum(vals[1:])) <= 0.01 * vals[0]:
        return vals[0]   # um total e as suas parcelas com tags diferentes
    return sum(vals)


def carregar(ciks: set[str] | None = None) -> dict:
    """{cik: {("AAAA-MM-DD", q): (valor, filed AAAAMMDD, form, adsh)}} — do filing do próprio
    período quando existe (o original), senão do mais recente que o imprime."""
    melhor: dict = {}
    for f in sorted(glob.glob(os.path.join(PASTA, "*.json.gz"))):
        for adsh, s in json.load(gzip.open(f)).items():
            if ciks and s["cik"] not in ciks:
                continue
            cols = {(l["data"], l["q"]) for l in s["linhas"] if l["st"] == "CF" and not l.get("seg")}
            for data, q in cols:
                if q < 1:
                    continue
                v = recompras_do_cf(s["linhas"], data, q)
                if v is None:
                    continue
                k = (f"{data[:4]}-{data[4:6]}-{data[6:]}", q)
                original = data == s.get("period")
                rank = (original, s["filed"])
                atual = melhor.setdefault(s["cik"], {}).get(k)
                if atual is None or rank > atual[0]:
                    melhor[s["cik"]][k] = (rank, (v, s["filed"], s["form"], adsh))
    return {c: {k: x[1] for k, x in d.items()} for c, d in melhor.items()}


_TODAS: dict | None = None


def para_cik(cik) -> dict:
    global _TODAS
    if _TODAS is None:
        _TODAS = carregar() if glob.glob(os.path.join(PASTA, "*.json.gz")) else {}
    return _TODAS.get(str(int(cik)), {})


def injetar(cik, namespace: dict) -> int:
    """Põe as recompras impressas no namespace us-gaap como a tag TAG_IMPRESSA, no formato
    do companyfacts (o motor trata-a como a última tag da lista). Devolve o nº de entradas."""
    dados = para_cik(cik)
    if not dados:
        return 0
    # O DERA arredonda as datas ao fim do mês (TSN: o trimestre de 27/12 vem a 31/12); o
    # motor casa por data exata. Encostar cada data ao fim de período REAL mais próximo
    # (até 7 dias) tirado do fluxo operacional da própria empresa.
    reais = sorted({e["end"] for t in ("NetCashProvidedByUsedInOperatingActivities",
                                        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations")
                    for es_ in ((namespace.get(t) or {}).get("units") or {}).values() for e in es_})

    def encostar(fim):
        d0 = dt.date.fromisoformat(fim)
        perto = [r for r in reais if abs((dt.date.fromisoformat(r) - d0).days) <= 7]
        return min(perto, key=lambda r: abs((dt.date.fromisoformat(r) - d0).days)) if perto else fim

    final: dict = {}
    for (fim, q), x in dados.items():
        k = (encostar(fim), q)
        if k not in final or x[1] > final[k][1]:
            final[k] = x
    es = []
    for (fim, q), (v, filed, form, adsh) in final.items():
        d = dt.date.fromisoformat(fim)
        es.append({"start": (d - dt.timedelta(days=91 * q - 1)).isoformat(), "end": fim,
                   "val": v, "accn": adsh, "fy": None, "fp": None, "form": form,
                   "filed": f"{filed[:4]}-{filed[4:6]}-{filed[6:]}"})
    namespace[TAG_IMPRESSA] = {"units": {"USD": es}}
    return len(es)


if __name__ == "__main__":
    import sys
    import psycopg2
    cur = psycopg2.connect(os.getenv("DIRECT_URL", "postgresql://localhost:5432/bullquant_sec")).cursor()
    cur.execute("SELECT cik FROM companies WHERE ticker = %s", (sys.argv[1],))
    cik = str(int(cur.fetchone()[0]))
    for (fim, q), (v, filed, form, adsh) in sorted(carregar({cik}).get(cik, {}).items()):
        if fim >= (sys.argv[2] if len(sys.argv) > 2 else "2024-01-01"):
            print(fim, f"{q}T", f"{v / 1e6:,.1f} M", form, filed)
