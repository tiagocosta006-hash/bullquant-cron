#!/usr/bin/env python3
"""
esef_segments_dassault.py — repartição da receita e KPIs de negócio da Dassault.

PORQUE PRECISA DE CÓDIGO PRÓPRIO:
  O extrator de segmentos genérico (ingest_segments_xbrl) procura EIXOS
  dimensionais — us-gaap:StatementBusinessSegmentsAxis e afins. A Dassault não
  usa eixos: o único que existe no ESEF dela é o de componentes do capital
  próprio. A repartição da receita está tagged como CONCEITOS PRÓPRIOS no rosto
  da demonstração de resultados (dassault:SubscriptionAndSupportRevenue,
  dassault:LicensesAndOtherSoftwareRevenue, dassault:SoftwareRevenue).

  É um padrão legítimo e comum no ESEF: as empresas estendem a taxonomia com
  conceitos próprios em vez de dimensionar um conceito genérico. O extrator
  dimensional nunca os apanharia.

A PARTIÇÃO FECHA, e é essa a validação:
    SubscriptionAndSupport + LicensesAndOther = SoftwareRevenue
    SoftwareRevenue + Serviços               = Receita total
  Os Serviços obtêm-se por diferença (a empresa não os tagga isoladamente),
  e só se escreve quando as duas identidades fecham.

OS KPIs QUE ISTO PERMITE, e que são o que decide uma tese em software:
  - % de receita RECORRENTE (subscrição sobre o total): a métrica central de
    qualquer negócio de software, e a que explica múltiplos.
  - Margem bruta POR SEGMENTO: a Dassault tagga CostOfSoftwareRevenue e
    CostOfServicesRevenue separadamente, o que dá 91% no software contra ~14%
    nos serviços — a diferença que explica porque a mistura importa.
  - Peso dos serviços: negócio de baixa margem que dilui a margem consolidada.

Uso:
  python scripts/esef_segments_dassault.py --dry-run
  python scripts/esef_segments_dassault.py
"""
import argparse
import bisect
import datetime as dt
import json
import os
import sys

import requests
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, "..", ".env.dev"))
DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

sys.path.insert(0, HERE)
from ingest_fundamentals import get_fx_series  # noqa: E402

FILES = "https://filings.xbrl.org"
API = "https://filings.xbrl.org/api"
LEI = "96950065LBWY0APQIM86"

CONCEITOS = {
    "SubscriptionAndSupportRevenue": "sub",
    "LicensesAndOtherSoftwareRevenue": "lic",
    "SoftwareRevenue": "sw",
    "CostOfSoftwareRevenue": "csw",
    "CostOfServicesRevenue": "csv",
    "RevenueFromContractsWithCustomers": "rev",
}
TOL = 0.02   # as identidades da partição têm de fechar a 2%


def urls_do_lei(lei: str) -> list:
    out = []
    for pg in range(0, 15):
        r = requests.get(f"{API}/filings", headers={"Accept": "application/vnd.api+json"},
                         params={"filter[country]": "FR", "page[size]": 100,
                                 "page[number]": pg, "include": "entity"}, timeout=60)
        d = r.json()
        ident = {e["id"]: (e.get("attributes", {}).get("identifier") or "")
                 for e in d.get("included", [])}
        for f in d.get("data", []):
            ent = (f.get("relationships", {}).get("entity", {}).get("data") or {})
            if lei in (ident.get(str(ent.get("id"))) or "") and f["attributes"].get("json_url"):
                out.append(f["attributes"]["json_url"])
        if len(d.get("data", [])) < 100:
            break
    return sorted(set(out))


def recolher(urls: list) -> dict:
    """{ano_fiscal: {chave: valor}} a partir dos factos anuais não dimensionados."""
    tudo: dict = {}
    for u in urls:
        try:
            doc = requests.get(FILES + u, timeout=180).json()
        except Exception as e:
            print(f"  aviso: {u} — {e!r}")
            continue
        for f in (doc.get("facts") or {}).values():
            dim = f.get("dimensions", {})
            extra = [k for k in dim if k not in ("concept", "entity", "period", "unit", "language")]
            if extra:
                continue
            nome = (dim.get("concept") or "").split(":")[-1]
            if nome not in CONCEITOS:
                continue
            p = str(dim.get("period", ""))
            if "/" not in p:
                continue
            ini, fim = p.split("/")
            d1, d2 = dt.date.fromisoformat(ini[:10]), dt.date.fromisoformat(fim[:10])
            if not (350 <= (d2 - d1).days <= 380):
                continue
            try:
                v = float(f["value"])
            except (TypeError, ValueError):
                continue
            # A duração fecha no início do dia seguinte -> o exercício é o do ano anterior.
            tudo.setdefault(d2.year - 1, {})[CONCEITOS[nome]] = abs(v)
    return tudo


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print("a localizar relatórios ESEF da Dassault...")
    dados = recolher(urls_do_lei(LEI))
    print(f"{len(dados)} exercícios com dados de repartição\n")

    linhas = []
    for ano in sorted(dados):
        v = dados[ano]
        if not all(k in v for k in ("sub", "lic", "sw")):
            print(f"  {ano}: incompleto, saltado")
            continue
        rev = v.get("rev")
        if not rev:
            print(f"  {ano}: sem receita total, saltado")
            continue
        # Identidade 1: as duas componentes têm de dar o software.
        if abs((v["sub"] + v["lic"]) - v["sw"]) > TOL * v["sw"]:
            print(f"  {ano}: sub+lic != software, saltado")
            continue
        servicos = rev - v["sw"]
        if servicos <= 0:
            print(f"  {ano}: serviços negativos, saltado")
            continue

        segmentos = {
            "Subscrição e suporte": v["sub"],
            "Licenças e outro software": v["lic"],
            "Serviços": servicos,
        }
        kpis = {
            "Receita recorrente (%)": round(v["sub"] / rev, 4),
            "Peso do software (%)": round(v["sw"] / rev, 4),
            "Peso dos serviços (%)": round(servicos / rev, 4),
        }
        if v.get("csw"):
            kpis["Margem bruta do software"] = round((v["sw"] - v["csw"]) / v["sw"], 4)
        if v.get("csv"):
            kpis["Margem bruta dos serviços"] = round((servicos - v["csv"]) / servicos, 4)
        if v.get("csw") and v.get("csv"):
            kpis["Custo total de receita"] = round(v["csw"] + v["csv"], 1)
        linhas.append((ano, segmentos, kpis, rev))
        print(f"  {ano}: subscrição {v['sub']:,.0f} | licenças {v['lic']:,.0f} | "
              f"serviços {servicos:,.0f}  (recorrente {kpis['Receita recorrente (%)']:.1%})")

    if args.dry_run:
        print("\nDry-run — nada escrito.")
        return

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    cur.execute("SELECT id FROM companies WHERE ticker='DSY'")
    row = cur.fetchone()
    if not row:
        sys.exit("DSY não existe na BD")
    cid = row[0]

    escritas = 0
    for ano, segmentos, kpis, rev_eur in linhas:
        # Os segmentos vêm em EUR e a coluna revenue da BD está em USD — sem
        # converter, o gate de segmentos acusaria a soma como 0,85x a receita.
        datas, taxas = get_fx_series("EUR")
        i = bisect.bisect_right(datas, f"{ano}-12-31") - 1
        taxa = taxas[max(i, 0)]
        # Os factos XBRL já vêm em unidades absolutas (4.488.100.000 EUR), não
        # em milhões — só falta a conversão cambial.
        seg_usd = {k: v * taxa for k, v in segmentos.items()}

        cur.execute('SELECT id FROM fundamentals WHERE "companyId"=%s AND "periodType"=\'ANNUAL\' '
                    'AND "fiscalYear"=%s', (cid, ano))
        r = cur.fetchone()
        if not r:
            print(f"  {ano}: sem linha anual na BD, saltado")
            continue
        cur.execute('UPDATE fundamentals SET "revenueSegments"=%s, "revenueSegmentsByAxis"=%s, '
                    '"businessKpis" = COALESCE("businessKpis", \'{}\'::jsonb) || %s::jsonb, '
                    '"updatedAt"=NOW() WHERE id=%s',
                    (Json(seg_usd), Json({"product": seg_usd}), Json(kpis), r[0]))
        escritas += 1
    conn.commit()
    print(f"\n{escritas} exercícios com segmentos e KPIs de negócio gravados.")
    conn.close()


if __name__ == "__main__":
    main()
