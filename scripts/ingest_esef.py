#!/usr/bin/env python3
"""
ingest_esef.py — ingere cotadas europeias a partir dos relatórios ESEF.

O EQUIVALENTE EUROPEU AO EDGAR:
  Desde 2020 todas as cotadas em mercado regulamentado da UE são obrigadas a
  publicar o relatório anual em XBRL (formato ESEF, regulamento delegado
  2019/815). A XBRL International agrega-os em filings.xbrl.org, com API
  pública e SEM CHAVE — o que resolve o problema de fundo: a Dassault
  Systèmes cancelou o registo na SEC em 2008 e não tem lá nada, mas tem cinco
  relatórios ESEF (2021-2025) com o seu LEI.

  Isto é a fonte OFICIAL AUDITADA, não métricas derivadas: os valores vêm tal
  como reportados, com as rubricas todas e com os eixos dimensionais dos
  segmentos. Cruzado com a reconstrução via Finnhub na Dassault de 2024:
  6.213,6 M EUR oficiais contra 6.235 M reconstruídos, 0,3% de desvio — valida
  o método antigo e confirma que este é melhor.

DUAS ARMADILHAS, ambas encontradas nos dados reais:

  1. CONSOLIDADO vs SOCIEDADE-MÃE. Os relatórios franceses trazem as contas da
     société mère ao lado das consolidadas, e os valores da mãe são uma fração
     (capital próprio de 445 M contra 9.081 M consolidados). Os factos
     consolidados são os que NÃO têm dimensões além de concept/entity/period/
     unit; qualquer eixo extra é uma fatia (segmento, classe, componente).

  2. FICHEIROS PARTIDOS. Um período pode ter vários pacotes — o de 2025 da
     Dassault só traz a demonstração de capital próprio. Juntam-se TODOS os
     ficheiros do mesmo período antes de decidir.

MOEDA: os montantes vêm na moeda de reporte (EUR) e a BD é toda em USD, para
os múltiplos serem comparáveis. Converte-se com a série do BCE que o
ingest_fundamentals já usa, à taxa mais próxima anterior ao fim do período.

Uso:
  python scripts/ingest_esef.py --procurar dassault
  python scripts/ingest_esef.py --lei 96950065LBWY0APQIM86 --ticker DSY --dry-run
  python scripts/ingest_esef.py --lei 96950065LBWY0APQIM86 --ticker DSY
"""
import argparse
import bisect
import datetime as dt
import json
import os
import sys
import uuid

import requests
import psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, "..", ".env.dev"))
DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

API = "https://filings.xbrl.org/api"
FILES = "https://filings.xbrl.org"
H = {"Accept": "application/vnd.api+json"}

sys.path.insert(0, HERE)
from ingest_fundamentals import get_fx_series  # noqa: E402

# IFRS -> colunas da BD, por ordem de preferência. A primeira que existir ganha.
MAPA = {
    "revenue": ["RevenueFromContractsWithCustomers", "Revenue"],
    "costOfRevenue": ["CostOfSales"],
    "grossProfit": ["GrossProfit"],
    "operatingIncome": ["ProfitLossFromOperatingActivities", "OperatingIncomeLoss"],
    "incomeBeforeTax": ["ProfitLossBeforeTax"],
    "netIncome": ["ProfitLossAttributableToOwnersOfParent", "ProfitLoss"],
    "taxExpense": ["IncomeTaxExpenseContinuingOperations"],
    "researchAndDevelopment": ["ResearchAndDevelopmentExpense"],
    "totalAssets": ["Assets"],
    "totalLiabilities": ["Liabilities"],
    "totalEquity": ["Equity"],
    "cash": ["CashAndCashEquivalents"],
    "totalCurrentAssets": ["CurrentAssets"],
    "totalCurrentLiab": ["CurrentLiabilities"],
    "inventory": ["Inventories"],
    "accountsReceivable": ["TradeAndOtherCurrentReceivables"],
    "goodwillAndIntangibles": ["Goodwill"],   # somado com os intangíveis abaixo
    "propertyPlantEquipment": ["PropertyPlantAndEquipment"],
    "operatingCashFlow": ["CashFlowsFromUsedInOperatingActivities"],
    "investingCashFlow": ["CashFlowsFromUsedInInvestingActivities"],
    "financingCashFlow": ["CashFlowsFromUsedInFinancingActivities"],
    # A taxonomia IFRS tem várias grafias para a mesma coisa e as empresas
    # escolhem a que lhes serve. Estes nomes saíram de ler o que a Dassault
    # realmente publica — sem eles ficavam 16 colunas vazias, incluindo capex,
    # dívida e dividendo, que são exatamente as que decidem uma tese.
    "capex": ["PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwill"
              "InvestmentPropertyAndOtherNoncurrentAssets",
              "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
              "PurchaseOfPropertyPlantAndEquipment"],
    "epsDiluted": ["DilutedEarningsLossPerShare"],
    "sharesOutstanding": ["AdjustedWeightedAverageShares", "WeightedAverageShares"],
    "dividendPerShare": ["DividendsRecognisedAsDistributionsToOwnersPerShare",
                         "DividendsPaidOrdinarySharePerShare"],
    "dividendsPaid": ["DividendsPaidClassifiedAsFinancingActivities", "DividendsPaid"],
    "longTermDebt": ["LongtermBorrowings", "NoncurrentPortionOfNoncurrentBorrowings"],
    "shortTermDebt": ["CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings",
                      "CurrentPortionOfNoncurrentBorrowings"],
    # A última entrada é um conceito PRÓPRIO da Dassault. O ESEF permite às
    # empresas estender a taxonomia, e várias publicam a amortização só assim —
    # o mapa tem de aceitar extensões, não apenas nomes ifrs-full.
    "depreciationAndAmortization": ["DepreciationAndAmortisationExpense",
                                    "DepreciationAmortisationAndImpairmentLossReversalOf"
                                    "ImpairmentLossRecognisedInProfitOrLoss",
                                    "AmortizationOfAcquiredIntangibleAssetsAndOf"
                                    "TangibleAssetsRevaluation"],
    "interestExpense": ["InterestPaidClassifiedAsOperatingActivities", "InterestExpense"],
    "accountsPayable": ["TradeAndOtherCurrentPayables"],
    "retainedEarnings": ["RetainedEarnings"],
    "shareRepurchases": ["Paymentstoacquireorredeementitysshares",
                         "PaymentsForRepurchaseOfEntitysOwnEquityInstruments"],
    "sellingGeneralAndAdmin": ["SalesAndMarketingExpense"],
    "netChangeInCash": ["IncreaseDecreaseInCashAndCashEquivalents"],
    "minorityInterest": ["NoncontrollingInterests"],
    "stockBasedCompensation": ["IncreaseDecreaseThroughSharebasedPaymentTransactions"],
}
# O passivo total raramente é tagged: deriva-se do que EXISTE, que é o corrente
# e o não corrente, ou pela identidade do balanço.
DERIVADAS = {
    "totalLiabilities": [("CurrentLiabilities", "NoncurrentLiabilities")],
}
POR_ACAO = {"epsDiluted", "dividendPerShare"}
SEM_CONVERSAO = {"sharesOutstanding", "roic", "returnOnEquity",
                 "grossMargin", "operatingMargin", "netMargin"}


def api(caminho: str, **params) -> dict:
    r = requests.get(f"{API}/{caminho}", params=params, headers=H, timeout=60)
    r.raise_for_status()
    return r.json()


def procurar(termo: str, paises=("FR", "DE", "NL", "IT", "ES", "SE", "FI", "DK", "BE", "IE", "PT")):
    """Varre o índice por país à procura de um nome. O API não tem pesquisa."""
    termo = termo.lower()
    achados = {}
    for pais in paises:
        for pg in range(0, 15):
            try:
                d = api("filings", **{"filter[country]": pais, "page[size]": 100,
                                      "page[number]": pg, "include": "entity"})
            except Exception:
                break
            inc = d.get("included", [])
            for e in inc:
                nome = (e.get("attributes", {}).get("name") or "")
                if termo in nome.lower():
                    achados[e["id"]] = (nome, pais,
                                        e.get("attributes", {}).get("identifier"))
            if len(d.get("data", [])) < 100:
                break
    return achados


def filings_do_lei(lei: str) -> dict:
    """{period_end: [json_url, ...]} — um período pode ter vários ficheiros."""
    out: dict = {}
    for pais in ("FR", "DE", "NL", "IT", "ES", "SE", "FI", "DK", "BE", "IE", "PT", "AT", "NO", "PL", "GR", "LU"):
        for pg in range(0, 15):
            try:
                d = api("filings", **{"filter[country]": pais, "page[size]": 100,
                                      "page[number]": pg, "include": "entity"})
            except Exception:
                break
            ident = {e["id"]: (e.get("attributes", {}).get("identifier") or "")
                     for e in d.get("included", [])}
            for f in d.get("data", []):
                ent = (f.get("relationships", {}).get("entity", {}).get("data") or {})
                if lei not in (ident.get(str(ent.get("id"))) or ""):
                    continue
                a = f["attributes"]
                if a.get("json_url"):
                    out.setdefault(a["period_end"], []).append(a["json_url"])
            if len(d.get("data", [])) < 100:
                break
        if out:
            break   # o LEI identifica o país; não vale a pena varrer os restantes
    return out


def factos_consolidados(urls: list) -> dict:
    """{(conceito, periodo): (valor, moeda)} só dos factos SEM dimensões extra."""
    out: dict = {}
    for u in urls:
        try:
            r = requests.get(f"{FILES}{u}", timeout=180)
            r.raise_for_status()
            doc = r.json()
        except Exception as e:
            print(f"    aviso: não consegui ler {u}: {e!r}")
            continue
        for f in (doc.get("facts") or {}).values():
            dim = f.get("dimensions") or {}
            extra = [k for k in dim if k not in ("concept", "entity", "period", "unit", "language")]
            if extra:
                continue                      # fatia dimensional, não o consolidado
            c = (dim.get("concept") or "")
            if ":" not in c:
                continue
            try:
                v = float(f.get("value"))
            except (TypeError, ValueError):
                continue
            # As unidades por ação são "iso4217:EUR/xbrli:shares" — apanhar o
            # último segmento dava "shares" como se fosse a moeda. O código da
            # moeda vem imediatamente a seguir a "iso4217:" e termina no "/".
            unidade = (dim.get("unit") or "")
            moeda = None
            if "iso4217:" in unidade:
                moeda = unidade.split("iso4217:")[1].split("/")[0].strip() or None
            out[(c.split(":")[-1], dim.get("period"))] = (v, moeda)
    return out


def duracao_anual(periodo: str):
    """(fim, True) se for uma duração de ~1 ano; (fim, False) se instantâneo."""
    if not periodo:
        return None, False
    if "/" in periodo:
        ini, fim = periodo.split("/")
        d1, d2 = dt.date.fromisoformat(ini[:10]), dt.date.fromisoformat(fim[:10])
        if not (350 <= (d2 - d1).days <= 380):
            return None, False
        # A duração termina no INÍCIO do dia seguinte; o período fecha na véspera.
        return d2 - dt.timedelta(days=1), True
    return dt.date.fromisoformat(periodo[:10]) - dt.timedelta(days=1), False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--procurar", help="procura um nome no índice e sai")
    ap.add_argument("--lei")
    ap.add_argument("--ticker")
    ap.add_argument("--nome")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.procurar:
        for eid, (nome, pais, lei) in procurar(args.procurar).items():
            print(f"  {nome}  | país {pais} | LEI {lei} | entidade {eid}")
        return

    if not (args.lei and args.ticker):
        sys.exit("--lei e --ticker obrigatórios (ou usa --procurar)")

    periodos = filings_do_lei(args.lei)
    if not periodos:
        sys.exit(f"nenhum relatório ESEF para o LEI {args.lei}")
    print(f"{len(periodos)} períodos com relatório ESEF: {', '.join(sorted(periodos))}")

    linhas = []
    for pend, urls in sorted(periodos.items()):
        factos = factos_consolidados(urls)
        if not factos:
            continue
        # Um relatório traz o ano corrente E os comparativos; aproveitam-se todos.
        por_fim: dict = {}
        for (conceito, periodo), (v, moeda) in factos.items():
            fim, e_duracao = duracao_anual(periodo)
            if fim is None:
                continue
            por_fim.setdefault(fim, {"dur": {}, "inst": {}, "moeda": moeda})
            alvo = "dur" if e_duracao else "inst"
            por_fim[fim][alvo].setdefault(conceito, v)
            if moeda:
                por_fim[fim]["moeda"] = moeda

        for fim, blocos in por_fim.items():
            rec = {}
            for coluna, candidatos in MAPA.items():
                for c in candidatos:
                    v = blocos["dur"].get(c, blocos["inst"].get(c))
                    if v is not None:
                        rec[coluna] = v
                        break
            if "revenue" not in rec or "netIncome" not in rec:
                continue          # sem os dois pilares não vale a pena gravar

            def facto(nome):
                return blocos["dur"].get(nome, blocos["inst"].get(nome))

            # Goodwill + intangíveis: a coluna representa os dois, e a Dassault
            # publica-os em rubricas separadas (2.641 M só de intangíveis).
            intang = facto("IntangibleAssetsOtherThanGoodwill")
            if intang is not None:
                rec["goodwillAndIntangibles"] = (rec.get("goodwillAndIntangibles") or 0) + intang

            # Passivo total: soma do corrente com o não corrente. Se faltar um,
            # a identidade do balanço fecha a conta (Ativo = Passivo + Capital).
            if "totalLiabilities" not in rec:
                cl, ncl = facto("CurrentLiabilities"), facto("NoncurrentLiabilities")
                if cl is not None and ncl is not None:
                    rec["totalLiabilities"] = cl + ncl
                elif rec.get("totalAssets") and rec.get("totalEquity"):
                    rec["totalLiabilities"] = rec["totalAssets"] - rec["totalEquity"]

            # Dívida total = curto + longo prazo. É o que alimenta o EV e a
            # alavancagem; sem ela ambos ficam errados.
            partes = [rec.get("shortTermDebt"), rec.get("longTermDebt")]
            if any(p is not None for p in partes):
                rec["totalDebt"] = sum(p for p in partes if p is not None)

            # Despesas operacionais: as três linhas que a Dassault publica.
            opex = [facto("SalesAndMarketingExpense"), facto("ResearchAndDevelopmentExpense"),
                    facto("GeneralAndAdministrativeExpense")]
            if all(x is not None for x in opex):
                rec["operatingExpenses"] = sum(opex)

            # FCF = fluxo operacional − capex, a definição corrente.
            if rec.get("operatingCashFlow") is not None and rec.get("capex") is not None:
                rec["freeCashFlow"] = rec["operatingCashFlow"] - abs(rec["capex"])

            # Retornos: ROE sobre o capital próprio, ROIC sobre capital investido
            # (capital próprio + dívida), que é a convenção usada no resto da BD.
            if rec.get("totalEquity"):
                rec["returnOnEquity"] = rec["netIncome"] / rec["totalEquity"]
                investido = rec["totalEquity"] + (rec.get("totalDebt") or 0)
                if investido:
                    base = rec.get("operatingIncome", rec["netIncome"])
                    rec["roic"] = base / investido

            linhas.append((fim, rec, blocos["moeda"] or "EUR"))
        print(f"  {pend}: {len(factos)} factos consolidados")

    # Vários relatórios cobrem o mesmo ano (comparativos) — fica o mais completo.
    melhor: dict = {}
    for fim, rec, moeda in linhas:
        if fim not in melhor or len(rec) > len(melhor[fim][0]):
            melhor[fim] = (rec, moeda)
    print(f"\n{len(melhor)} exercícios reconstruídos: {', '.join(str(k) for k in sorted(melhor))}")

    for fim in sorted(melhor):
        rec, moeda = melhor[fim]
        print(f"  {fim} ({moeda}): receita={rec['revenue']/1e6:,.1f}M  "
              f"resultado={rec['netIncome']/1e6:,.1f}M  campos={len(rec)}")

    if args.dry_run:
        print("\nDry-run — nada escrito.")
        return

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    cur.execute("SELECT id FROM companies WHERE ticker = %s", (args.ticker,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"empresa {args.ticker} não existe na BD — criar primeiro")
    cid = row[0]

    escritas = 0
    for fim in sorted(melhor):
        rec, moeda = melhor[fim]
        datas, taxas = ([], [])
        taxa = 1.0
        if moeda != "USD":
            datas, taxas = get_fx_series(moeda)
            if not datas:
                print(f"  {fim}: sem série FX para {moeda} — SALTADO")
                continue
            i = bisect.bisect_right(datas, fim.isoformat()) - 1
            taxa = taxas[max(i, 0)]
        campos = {}
        for k, v in rec.items():
            if v is None:
                continue
            # Rácios e contagens são adimensionais — converter dava disparate.
            campos[k] = v if k in SEM_CONVERSAO else v * taxa
        # Margens, para o frontend não ter de as calcular.
        if campos.get("revenue"):
            r = campos["revenue"]
            if campos.get("grossProfit") is not None:
                campos["grossMargin"] = campos["grossProfit"] / r
            if campos.get("operatingIncome") is not None:
                campos["operatingMargin"] = campos["operatingIncome"] / r
            if campos.get("netIncome") is not None:
                campos["netMargin"] = campos["netIncome"] / r
        cols = ", ".join(f'"{k}"' for k in campos)
        vals = ", ".join(["%s"] * len(campos))
        # NADA de ON CONFLICT aqui. A @@unique da tabela inclui fiscalQuarter,
        # que é NULL nas anuais, e em Postgres dois NULLs são DISTINTOS num
        # índice único — o conflito nunca dispara e cada corrida inseria uma
        # linha nova. Procura-se explicitamente e faz-se UPDATE.
        cur.execute(
            'SELECT id FROM fundamentals WHERE "companyId"=%s AND "periodType"=\'ANNUAL\' '
            'AND "periodEnd"::date = %s::date', (cid, fim))
        existente = cur.fetchone()
        if existente:
            sets = ", ".join(f'"{k}" = %s' for k in campos)
            cur.execute(f'UPDATE fundamentals SET {sets}, "updatedAt"=NOW() WHERE id=%s',
                        list(campos.values()) + [existente[0]])
        else:
            cur.execute(
                f'''INSERT INTO fundamentals (id, "companyId", "periodType", "fiscalYear",
                        "fiscalQuarter", "periodEnd", "createdAt", "updatedAt", {cols})
                    VALUES (%s,%s,'ANNUAL'::"period_type",%s,NULL,%s,NOW(),NOW(), {vals})''',
                [uuid.uuid4().hex, cid, fim.year, fim] + list(campos.values()))
        escritas += 1
    conn.commit()
    print(f"\n{escritas} exercícios gravados para {args.ticker}.")
    conn.close()


if __name__ == "__main__":
    main()
