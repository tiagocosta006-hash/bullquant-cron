#!/usr/bin/env python3
"""
ingest_finnhub_company.py — ingere empresas que NÃO reportam à SEC.

PORQUÊ:
  Todo o pipeline (companyfacts, edgartools, DERA) assenta no EDGAR. Para uma
  cotada europeia que nunca registou ADR nos EUA, ou que cancelou o registo,
  não existe lá NADA. A Dassault Systèmes saiu do registo da SEC em Outubro de
  2008 (formulário 15F-12G): o último 20-F é de 2008 e o companyfacts devolve
  404, porque o XBRL só passou a ser obrigatório depois de ela sair.

  A Finnhub cobre as bolsas europeias e devolve MÉTRICAS DERIVADAS (rácios,
  margens, valores por ação) com histórico anual desde os anos 90 e trimestral
  até ao trimestre corrente. Não devolve as demonstrações em bruto — o endpoint
  financials-reported é alimentado pela SEC e vem vazio para estas empresas.

COMO SE RECONSTRÓI:
  As demonstrações saem dos rácios por álgebra simples, e cada valor tem pelo
  menos duas vias independentes que TÊM de bater. Para a Dassault em 2025:

    receita   = ev / evRevenue          = 30.965,8 / 4,9658 = 6.235 M€
    acoes     = receita / salesPerShare = 6.235 / 4,694     = 1.328 M
    resultado = eps * acoes             = 0,9002 * 1.328    = 1.196 M€
    verificação: netMargin * receita    = 0,1918 * 6.235    = 1.196 M€  ✓

  Onde as duas vias divergem mais do que TOL_CRUZAMENTO, NÃO se escreve — o
  princípio é o mesmo do resto do projeto: antes NULL que errado.

MOEDA:
  A empresa reporta em EUR e as métricas vêm em EUR, mas a coluna `revenue` da
  BD é USD para todas as outras empresas. Converte-se com a mesma série do BCE
  que o ingest_fundamentals usa (Frankfurter), à taxa mais próxima anterior ao
  fim do período — para os múltiplos serem comparáveis entre empresas.

Uso:
  python scripts/ingest_finnhub_company.py --symbol DASTY --ticker DSY --dry-run
  python scripts/ingest_finnhub_company.py --symbol DASTY --ticker DSY
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
from psycopg2.extras import Json
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, "..", ".env.dev"))

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")
FINNHUB_KEY = os.getenv("FINNHUB_API_KEY")
if not FINNHUB_KEY:
    sys.exit("FINNHUB_API_KEY não definida")

BASE = "https://finnhub.io/api/v1"
TOL_CRUZAMENTO = 0.05   # duas vias de cálculo têm de bater a 5%

sys.path.insert(0, HERE)
from ingest_fundamentals import get_fx_series  # noqa: E402  (mesma série do BCE)


def api(path: str, **params) -> dict:
    params["token"] = FINNHUB_KEY
    r = requests.get(f"{BASE}/{path}", params=params, timeout=45)
    r.raise_for_status()
    return r.json()


def taxa_para(moeda: str, data_iso: str) -> float:
    """Taxa moeda->USD à data mais próxima anterior (critério do ingestor)."""
    if not moeda or moeda == "USD":
        return 1.0
    datas, taxas = get_fx_series(moeda)
    if not datas:
        raise RuntimeError(f"série FX vazia para {moeda}USD")
    i = bisect.bisect_right(datas, data_iso[:10]) - 1
    return taxas[max(i, 0)]


def serie_por_periodo(series: dict) -> dict:
    """{periodo: {nome_serie: valor}} a partir do formato da Finnhub."""
    out: dict = {}
    for nome, pontos in (series or {}).items():
        for p in pontos or []:
            out.setdefault(p["period"], {})[nome] = p["v"]
    return out


def reconstruir(m: dict, acoes_ref: float | None = None) -> dict | None:
    """Demonstrações a partir dos rácios de UM período. None se não fechar.

    `acoes_ref` é obrigatório nos TRIMESTRES. Nas séries trimestrais da Finnhub
    o evRevenue é TTM (doze meses) mas o salesPerShare é do trimestre — dividir
    um pelo outro dava ~4x as ações reais, e a Dassault aparecia com 8,1 mil
    milhões de ações em vez de 1,33 mil milhões, oscilando de trimestre para
    trimestre. Com o número de ações do exercício (que é estável), o trimestre
    calcula-se diretamente: receita = salesPerShare x acoes.
    """
    ev, evrev = m.get("ev"), m.get("evRevenue") or m.get("evRevenueTTM")
    sps, eps = m.get("salesPerShare"), m.get("eps")
    if not (sps and eps):
        return None

    if acoes_ref:
        receita = sps * acoes_ref
        acoes = acoes_ref
        resultado = eps * acoes
        d = {"revenue": receita, "netIncome": resultado, "sharesOutstanding": acoes,
             "epsDiluted": eps, "ebitda": m.get("ebitda"), "totalEquity": m.get("bookValue"),
             "grossMargin": m.get("grossMargin"), "operatingMargin": m.get("operatingMargin"),
             "netMargin": m.get("netMargin")}
        if m.get("grossMargin") is not None:
            d["grossProfit"] = receita * m["grossMargin"]
            d["costOfRevenue"] = receita - d["grossProfit"]
        if m.get("operatingMargin") is not None:
            d["operatingIncome"] = receita * m["operatingMargin"]
        return d

    receita = None
    if ev and evrev:
        receita = ev / evrev
    # Via alternativa: bookValue / pb dá a capitalização, e ps dá a receita.
    if receita is None and m.get("pb") and m.get("bookValue") and (m.get("ps") or m.get("psTTM")):
        capitalizacao = m["bookValue"] * m["pb"]
        receita = capitalizacao / (m.get("ps") or m.get("psTTM"))
    if not receita or receita <= 0:
        return None

    acoes = receita / sps
    if acoes <= 0:
        return None
    resultado = eps * acoes

    # CRUZAMENTO: a margem líquida tem de reproduzir o mesmo resultado.
    nm = m.get("netMargin")
    if nm:
        alt = nm * receita
        if abs(alt) > 1 and abs(alt - resultado) / abs(alt) > TOL_CRUZAMENTO:
            return None

    d = {
        "revenue": receita,
        "netIncome": resultado,
        "sharesOutstanding": acoes,
        "epsDiluted": eps,
        "ebitda": m.get("ebitda"),
        "totalEquity": m.get("bookValue"),
        "grossMargin": m.get("grossMargin"),
        "operatingMargin": m.get("operatingMargin"),
        "netMargin": nm,
    }
    if m.get("grossMargin") is not None:
        d["grossProfit"] = receita * m["grossMargin"]
        d["costOfRevenue"] = receita - d["grossProfit"]
    if m.get("operatingMargin") is not None:
        d["operatingIncome"] = receita * m["operatingMargin"]
    if m.get("fcfMargin") is not None:
        d["freeCashFlow"] = receita * m["fcfMargin"]
    if m.get("ebitPerShare") is not None:
        d.setdefault("operatingIncome", m["ebitPerShare"] * acoes)

    # BALANÇO A PARTIR DOS RÁCIOS. Antes de 2020 não há ESEF (a obrigação legal
    # começou nesse ano), portanto estes anos só têm demonstração de resultados
    # e o ativo, a dívida e o dividendo ficavam vazios. Derivam-se:
    #     dívida = (dívida/capital próprio) x capital próprio
    #     ativo  = dívida / (dívida/ativo)
    #     DPS    = payout x EPS
    # Validado contra o oficial de 2024: dá 15.545 M de ativo, que é exatamente
    # o que o ESEF reporta, e 3.061 M de dívida contra 3.049 M reais.
    bv, tde, tda = m.get("bookValue"), m.get("totalDebtToEquity"), m.get("totalDebtToTotalAsset")
    if bv and tde:
        d["totalDebt"] = tde * bv
        if tda:
            d["totalAssets"] = d["totalDebt"] / tda
            if d.get("totalEquity"):
                d["totalLiabilities"] = d["totalAssets"] - d["totalEquity"]
    if m.get("longtermDebtTotalEquity") and bv:
        d["longTermDebt"] = m["longtermDebtTotalEquity"] * bv
    if m.get("payoutRatio") is not None and eps:
        d["dividendPerShare"] = m["payoutRatio"] * eps
    if m.get("roe") is not None:
        d["returnOnEquity"] = m["roe"]
    if m.get("roic") is not None:
        d["roic"] = m["roic"]
    return d


# Rácios que não cabem em colunas próprias mas interessam a quem decide
# investir — vão para businessKpis, que o frontend já sabe mostrar.
KPIS_INVESTIMENTO = [
    ("roic", "ROIC"), ("roe", "ROE"), ("roa", "ROA"), ("rotc", "Retorno do capital total"),
    ("pe", "P/E"), ("peTTM", "P/E (TTM)"), ("pb", "P/B"), ("ps", "P/S"), ("psTTM", "P/S (TTM)"),
    ("evEbitda", "EV/EBITDA"), ("evEbitdaTTM", "EV/EBITDA (TTM)"),
    ("evRevenue", "EV/Receita"), ("pfcf", "P/FCF"), ("pfcfTTM", "P/FCF (TTM)"),
    ("fcfMargin", "Margem FCF"), ("pretaxMargin", "Margem antes de impostos"),
    ("currentRatio", "Liquidez corrente"), ("quickRatio", "Liquidez reduzida"),
    ("cashRatio", "Liquidez imediata"),
    ("totalDebtToEquity", "Dívida/Capital próprio"),
    ("totalDebtToTotalAsset", "Dívida/Ativo"),
    ("netDebtToTotalEquity", "Dívida líquida/Capital próprio"),
    ("longtermDebtTotalEquity", "Dívida LP/Capital próprio"),
    ("payoutRatio", "Payout"), ("payoutRatioTTM", "Payout (TTM)"),
    ("sgaToSale", "SG&A/Vendas"), ("assetTurnoverTTM", "Rotação do ativo"),
    ("receivablesTurnover", "Rotação de clientes"),
    ("inventoryTurnover", "Rotação de existências"),
    ("tangibleBookValue", "Capital próprio tangível"), ("ptbv", "P/Tangible BV"),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", required=True, help="símbolo Finnhub (ex.: DASTY)")
    ap.add_argument("--ticker", help="ticker a gravar na BD (default = --symbol)")
    ap.add_argument("--dry-run", action="store_true")
    # 2015 é o horizonte do resto da BD (a regra FY_RANGE do validador usa
    # [2015, 2028]). A Finnhub dá séries desde os anos 90, mas gravá-las criava
    # ruído no gate para períodos que o site nem mostra.
    ap.add_argument("--desde", type=int, default=2015)
    args = ap.parse_args()
    ticker = (args.ticker or args.symbol).upper()

    perfil = api("stock/profile2", symbol=args.symbol)
    if not perfil.get("name"):
        sys.exit(f"Finnhub não conhece {args.symbol}")
    dados = api("stock/metric", symbol=args.symbol, metric="all")
    metricas, series = dados.get("metric", {}), dados.get("series", {})
    moeda = perfil.get("currency") or "USD"

    print(f"{perfil['name']} | {perfil.get('exchange')} | moeda {moeda}")
    print(f"  {len(metricas)} métricas, séries anuais {len(series.get('annual',{}))}, "
          f"trimestrais {len(series.get('quarterly',{}))}")

    # Primeiro os anuais: o número de ações que daí sai serve de referência
    # para os trimestres do mesmo exercício.
    acoes_por_ano: dict = {}
    receita_anual: dict = {}
    for periodo, m in serie_por_periodo(series.get("annual", {})).items():
        r = reconstruir(m)
        if r:
            ano_a = dt.date.fromisoformat(periodo).year
            acoes_por_ano[ano_a] = r["sharesOutstanding"]
            receita_anual[ano_a] = r["revenue"]
    semestres = [0]

    linhas = []
    for freq, ptype in (("annual", "ANNUAL"), ("quarterly", "QUARTERLY")):
        for periodo, m in sorted(serie_por_periodo(series.get(freq, {})).items()):
            ano = dt.date.fromisoformat(periodo).year
            ref = None
            if ptype == "QUARTERLY":
                ref = acoes_por_ano.get(ano) or acoes_por_ano.get(ano - 1)
                if not ref:
                    continue          # sem referência não se inventa
            rec = reconstruir(m, ref)
            if not rec:
                continue
            # SEMESTRES DISFARÇADOS DE TRIMESTRES. As europeias reportam
            # semestralmente: a Finnhub mete essas linhas na série "quarterly"
            # e elas trazem METADE do ano, não um quarto. A Dassault só passou
            # a trimestral em 2025, por isso a série mistura os dois — e um
            # gráfico com 3.634 seguido de 1.715 dá a impressão de a receita ter
            # caído para metade. O schema só tem QUARTERLY e ANNUAL, portanto
            # não há como etiquetar um semestre: fica de fora.
            # Comparar AQUI, antes da conversão cambial e da escala: a
            # referência anual está na mesma unidade que este rec.
            if ptype == "QUARTERLY":
                anual = receita_anual.get(ano) or receita_anual.get(ano - 1)
                if anual and rec.get("revenue", 0) > 0.35 * anual:
                    semestres[0] += 1
                    continue

            fim = dt.date.fromisoformat(periodo)
            if fim.year < args.desde:
                continue
            taxa = taxa_para(moeda, periodo)
            # Rácios e valores por ação NÃO se convertem; montantes sim.
            for campo in ("revenue", "netIncome", "ebitda", "totalEquity", "grossProfit",
                          "costOfRevenue", "operatingIncome", "freeCashFlow",
                          "totalDebt", "totalAssets", "totalLiabilities", "longTermDebt"):
                if rec.get(campo) is not None:
                    rec[campo] = rec[campo] * taxa * 1e6   # Finnhub reporta em milhões
            for campo in ("epsDiluted", "dividendPerShare"):
                if rec.get(campo) is not None:
                    rec[campo] = rec[campo] * taxa
            if rec.get("sharesOutstanding") is not None:
                rec["sharesOutstanding"] = rec["sharesOutstanding"] * 1e6

            kpis = {rot: round(m[k], 4) for k, rot in KPIS_INVESTIMENTO
                    if m.get(k) is not None}
            linhas.append((ptype, fim, rec, kpis))

    if semestres[0]:
        print(f"  {semestres[0]} períodos semestrais descartados (o schema só "
              f"tem QUARTERLY/ANNUAL)")
    anuais = sum(1 for l in linhas if l[0] == "ANNUAL")
    print(f"  reconstruídas {len(linhas)} linhas ({anuais} anuais, {len(linhas)-anuais} trimestrais)")
    if linhas:
        ult = max(l for l in linhas if l[0] == "ANNUAL")
        print(f"  último anual {ult[1]}: receita={ult[2]['revenue']/1e6:,.0f} M USD, "
              f"resultado={ult[2]['netIncome']/1e6:,.0f} M, EPS={ult[2]['epsDiluted']:.2f}, "
              f"ações={ult[2]['sharesOutstanding']/1e6:,.0f} M")

    if args.dry_run:
        print("\nDry-run — nada escrito.")
        return

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    cur.execute("SELECT id FROM companies WHERE ticker = %s", (ticker,))
    row = cur.fetchone()
    if row:
        cid = row[0]
        cur.execute('UPDATE companies SET name=%s, exchange=%s, country=%s, currency=%s, '
                    '"logoUrl"=COALESCE(%s,"logoUrl"), website=COALESCE(%s,website), '
                    '"updatedAt"=NOW() WHERE id=%s',
                    (perfil["name"], perfil.get("exchange", "")[:60], perfil.get("country", "US"),
                     "USD", perfil.get("logo"), perfil.get("weburl"), cid))
    else:
        cid = uuid.uuid4().hex
        cur.execute('INSERT INTO companies (id, ticker, name, exchange, country, currency, '
                    'sector, industry, "logoUrl", website, "isActive", "createdAt", "updatedAt") '
                    'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,TRUE,NOW(),NOW())',
                    (cid, ticker, perfil["name"], perfil.get("exchange", "")[:60],
                     perfil.get("country", "US"), "USD", perfil.get("finnhubIndustry"),
                     perfil.get("finnhubIndustry"), perfil.get("logo"), perfil.get("weburl")))
    conn.commit()

    escritas = 0
    for ptype, fim, rec, kpis in linhas:
        fy = fim.year
        fq = None if ptype == "ANNUAL" else (fim.month - 1) // 3 + 1
        campos = {k: v for k, v in rec.items() if v is not None}
        cols = ", ".join(f'"{k}"' for k in campos)
        vals = ", ".join(["%s"] * len(campos))
        # NADA de ON CONFLICT: a @@unique inclui fiscalQuarter, NULL nas anuais,
        # e em Postgres dois NULLs são DISTINTOS num índice único — o conflito
        # nunca dispara e cada corrida inseria uma linha anual nova.
        cur.execute('SELECT id FROM fundamentals WHERE "companyId"=%s '
                    'AND "periodType"=%s::"period_type" AND "periodEnd"::date=%s::date',
                    (cid, ptype, fim))
        existente = cur.fetchone()
        if existente:
            sets = ", ".join(f'"{k}" = %s' for k in campos)
            cur.execute(f'UPDATE fundamentals SET {sets}, "businessKpis"=%s, "updatedAt"=NOW() WHERE id=%s',
                        list(campos.values()) + [Json(kpis) if kpis else None, existente[0]])
        else:
            cur.execute(
                f'''INSERT INTO fundamentals (id, "companyId", "periodType", "fiscalYear",
                        "fiscalQuarter", "periodEnd", "businessKpis",
                        "createdAt", "updatedAt", {cols})
                    VALUES (%s,%s,%s::"period_type",%s,%s,%s,%s,NOW(),NOW(), {vals})''',
                [uuid.uuid4().hex, cid, ptype, fy, fq, fim, Json(kpis) if kpis else None]
                + list(campos.values()))
        escritas += 1
    conn.commit()
    print(f"\n{escritas} linhas gravadas para {ticker} (companyId={cid}).")
    conn.close()


if __name__ == "__main__":
    main()
