#!/usr/bin/env python3
"""
relabel_fiscal_periods.py — corrige (fiscalYear, fiscalQuarter) IN PLACE.

NÃO APAGA NADA. Só faz UPDATE do rótulo fiscal das linhas que já existem,
ancorado na identidade FÍSICA do período (`periodEnd`), que esta correção não
altera. Nenhuma linha é criada nem removida: o conjunto de `periodEnd` por
empresa fica exatamente igual, muda só a etiqueta.

Porquê isto e não uma re-ingestão: o `ingest_fundamentals.py` escreve com
DELETE-por-empresa + reinsert (`:2202`), e esse caminho passa pelo bloco de
preservação de segmentos que tem um `except Exception: preserved = {}` — em
caso de falha apaga os `revenueSegments` da empresa em silêncio. Para uma
correção que só mexe em rótulos, o DELETE é risco puro sem contrapartida.

A correção da CAUSA está em `build_fiscal_calendar` (ver
docs/audit/db-state-2026-08-05.md §A). Este script alinha as linhas que já
foram escritas com o calendário corrigido — sem ele, os dados só convergiriam
à medida que cada empresa fosse reingerida.

Uso:
  python scripts/relabel_fiscal_periods.py                 # dry-run, TODAS as empresas
  python scripts/relabel_fiscal_periods.py --tickers AMZN,LHX
  python scripts/relabel_fiscal_periods.py --apply         # escreve
"""
import argparse
import datetime
import importlib.util
import json
import os
import sys
import time
import urllib.request

import psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, "..", ".env"))

_spec = importlib.util.spec_from_file_location(
    "ingf", os.path.join(HERE, "ingest_fundamentals.py")
)
ingf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ingf)

CACHE = os.path.join(HERE, ".cache", "companyfacts")
ANCHORS_PATH = os.path.join(HERE, "fiscal_anchors.json")
UA = {"User-Agent": os.getenv("SEC_USER_AGENT", "BullValue contacto@thebullvalue.com")}
# Deslocamento temporário para evitar colisões com a unique
# (companyId, periodType, fiscalYear, fiscalQuarter) durante a troca de rótulos:
# um shift de -1 faz FY2026 querer virar FY2025 enquanto FY2025 ainda existe.
PARK = 10000


def companyfacts(cik: str) -> dict | None:
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"CIK{cik}.json")
    if not os.path.exists(p):
        url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
                open(p, "wb").write(r.read())
        except Exception as e:
            print(f"    SEC falhou: {e}")
            return None
        time.sleep(0.15)
    try:
        return json.load(open(p))
    except Exception:
        return None


def load_anchors() -> dict:
    """Âncoras fiscais autoritativas (scripts/fiscal_anchors.json), overrides incluídos."""
    try:
        doc = json.load(open(ANCHORS_PATH)) or {}
    except Exception:
        return {}
    anchors = dict(doc.get("anchors") or {})
    for ticker, ov in (doc.get("overrides") or {}).items():
        anchors[ticker] = {"end": ov["end"], "fy": ov["fy"]}
    return anchors


def apply_anchor(cal: dict, anchor: dict | None) -> dict:
    """Substitui a calibração do `build_fiscal_calendar` pela âncora declarada pela
    própria empresa à SEC.

    ⚠️ Não é redundante. O `build_fiscal_calendar` deriva o `anchor_fy` por moda dos
    votos dos factos, e para emitentes que mudaram de convenção a meio do histórico
    (TJX, STZ) a moda fica calibrada na convenção velha — devolvia FY2025 para o
    exercício que a TJX chama fiscal 2026. As datas de fecho (`annual_ends`) vêm do
    calendário e continuam a valer; só a NUMERAÇÃO é que passa a vir da âncora.
    """
    if not anchor:
        return cal
    try:
        end = datetime.date.fromisoformat(anchor["end"])
        fy = int(anchor["fy"])
    except (KeyError, ValueError, TypeError):
        return cal
    return {**cal, "anchor_end": end, "anchor_fy": fy}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", help="lista separada por vírgulas; omitir = todas")
    ap.add_argument("--apply", action="store_true", help="escrever (por omissão é dry-run)")
    ap.add_argument("--allow-remote", action="store_true",
                    help="permitir correr contra uma BD que não seja localhost")
    args = ap.parse_args()

    dsn = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not dsn:
        print("DIRECT_URL/DATABASE_URL em falta")
        return 2

    # --apply exige lista explícita. O calendário ainda erra em empresas de fecho
    # em janeiro/fevereiro cuja convenção de nome mudou a meio (TJX, CRM, BBY,
    # KR, STZ, CRWD, VEEV, ALB, COHR) — aí o rótulo guardado está certo e o
    # calculado está errado, logo um relabel em massa REGREDIA-AS. Só relabelar
    # o que estiver verificado contra o validate_period_identity.py.
    if args.apply and not args.tickers:
        print("--apply exige --tickers explícito (guarda contra relabel em massa).")
        print("Correr primeiro em dry-run e confirmar empresa a empresa.")
        return 2
    host = dsn.split("@")[-1].split("/")[0]

    # Mesma guarda de segurança do sync_segments_to_prod.ts: escrever numa BD
    # remota tem de ser um ato deliberado, nunca o resultado de um .env apontado
    # ao sítio errado.
    if not host.startswith(("localhost", "127.0.0.1")) and not args.allow_remote:
        print(f"ERRO: DIRECT_URL aponta para '{host.split(':')[0]}', não localhost.")
        print("Se queres mesmo escrever numa BD remota, corre com --allow-remote.")
        return 2

    print(f"{'APLICAR' if args.apply else 'DRY-RUN'} contra {host}\n")

    anchors = load_anchors()
    print(f"{len(anchors)} âncoras fiscais carregadas de fiscal_anchors.json\n")

    conn = psycopg2.connect(dsn)
    where, params = "c.cik IS NOT NULL", []
    if args.tickers:
        where += " AND c.ticker = ANY(%s)"
        params.append([t.strip().upper() for t in args.tickers.split(",")])

    with conn.cursor() as cur:
        cur.execute(
            f'SELECT c.id, c.ticker, c.cik FROM companies c WHERE {where} ORDER BY c.ticker',
            params,
        )
        companies = cur.fetchall()

    tot_rows = tot_chg = tot_skip = 0
    changed_companies, conflicts = [], []

    for cid, ticker, cik in companies:
        facts = companyfacts(str(cik).zfill(10))
        if not facts:
            continue
        cal = ingf.build_fiscal_calendar((facts.get("facts") or {}).get("us-gaap") or {})
        if not cal:
            print(f"{ticker:6} sem calendário fiscal — ignorada")
            tot_skip += 1
            continue
        cal = apply_anchor(cal, anchors.get(ticker))

        with conn.cursor() as cur:
            cur.execute(
                'SELECT id, "periodType", "periodEnd"::date, "fiscalYear", "fiscalQuarter" '
                'FROM fundamentals WHERE "companyId" = %s ORDER BY "periodEnd"',
                (cid,),
            )
            rows = cur.fetchall()
        tot_rows += len(rows)

        # Alvo por linha. periodEnd é a identidade física — não muda.
        # Calcular o rótulo final de TODAS as linhas (não só das que mudam):
        # numa translação global de -1 ano, a FY2026 vira FY2025 ao mesmo tempo
        # que a FY2025 vira FY2024 — comparar contra os rótulos ANTIGOS daria
        # colisões que não existem no estado final.
        final: dict[tuple, list] = {}
        plan = []
        for rid, ptype, pend, fy, fq in rows:
            is_annual = ptype == "ANNUAL"
            nfy, nfp = ingf.map_end_to_fiscal(pend, is_annual, cal)
            nfq = None if is_annual else int(nfp[1:])
            final.setdefault((ptype, nfy, nfq), []).append(pend)
            if (nfy, nfq) != (fy, fq):
                plan.append((rid, ptype, pend, fy, fq, nfy, nfq))
        if not plan:
            continue

        # Colisão real: dois periodEnd distintos a reclamar o mesmo rótulo FINAL.
        dup = {k: v for k, v in final.items() if len(v) > 1}
        if dup:
            conflicts.append((ticker, dup))
            print(f"{ticker:6} ⚠️  CONFLITO — ignorada, resolver à mão:")
            for (pt, fy, fq), ends in dup.items():
                print(f"         {pt} FY{fy}Q{fq}: {', '.join(str(e) for e in ends)}")
            continue

        changed_companies.append((ticker, len(plan)))
        tot_chg += len(plan)
        ann = [p for p in plan if p[1] == "ANNUAL"]
        print(f"{ticker:6} {len(plan):>4} linhas ({len(ann)} anuais)")
        for _rid, ptype, pend, fy, fq, nfy, nfq in ann[:3]:
            print(f"         {pend}  FY{fy} → FY{nfy}")

        if args.apply:
            try:
                with conn.cursor() as cur:
                    # Fase 1: estacionar fora do intervalo real para nenhuma
                    # atualização colidir com um rótulo ainda por trocar.
                    for rid, *_ in plan:
                        cur.execute(
                            'UPDATE fundamentals SET "fiscalYear" = "fiscalYear" + %s '
                            'WHERE id = %s',
                            (PARK, rid),
                        )
                    # Fase 2: rótulo final.
                    for rid, _pt, _pe, _fy, _fq, nfy, nfq in plan:
                        cur.execute(
                            'UPDATE fundamentals SET "fiscalYear" = %s, "fiscalQuarter" = %s, '
                            '"updatedAt" = NOW() WHERE id = %s',
                            (nfy, nfq, rid),
                        )
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"         ✗ ROLLBACK: {e}")
                changed_companies.pop()
                tot_chg -= len(plan)

    print(f"\n{'─'*60}")
    print(f"Empresas analisadas: {len(companies)} | linhas lidas: {tot_rows}")
    print(f"Empresas a relabelar: {len(changed_companies)} | linhas: {tot_chg}")
    if conflicts:
        print(f"Conflitos (não tocadas): {len(conflicts)} — {', '.join(t for t, _ in conflicts)}")
    if not args.apply:
        print("\nDry-run. Correr com --apply para escrever. Nenhum DELETE é feito.")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
