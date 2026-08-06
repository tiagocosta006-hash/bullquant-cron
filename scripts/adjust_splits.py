"""
adjust_splits.py — Corrige histórico de shares/EPS/DPS não ajustado a stock splits.

O EDGAR só reapresenta 2-3 anos comparativos após um split; o histórico mais
antigo fica na base pré-split (ex.: AMZN FY2019 504M vs FY2020 10.198M shares).
Este script deteta quebras na série de sharesOutstanding (>BREAK_DETECT) e valida-as
contra os rácios de split que as próprias empresas taggam no EDGAR
(StockholdersEquityNoteStockSplitConversionRatio1) E contra a série de preços
(yfinance), que é a base a que os fundamentais têm de ficar alinhados. Só
ajusta quando a quebra bate com um split real confirmado pelas duas fontes —
mergers (KDP 2018), anos de IPO (DASH 2020) e spin-offs (HON 2026, onde o
EDGAR diz 0.5x e o preço diz 0.9535x) nunca são "ajustados" por engano.

Campos ajustados nas rows antigas: sharesOutstanding ×F, epsDiluted ÷F,
dividendPerShare ÷F.

Corre DEPOIS de ingest_fundamentals.py (a re-ingestão repõe a base pré-split).
Uso: python scripts/adjust_splits.py [--dry-run]
"""

import os
import sys
import math
import time
import itertools
import datetime
import requests
import psycopg2
import yfinance as yf
from dotenv import load_dotenv

# Consolas Windows usam cp1252 — sem isto, prints com "⚠"/"←" matam o script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.join(os.path.dirname(__file__), "..")

if os.environ.get("GITHUB_ACTIONS") == "true":
    pass
else:
    ENV_FILE = os.path.join(ROOT, ".env.dev")
    if not os.path.exists(ENV_FILE):
        sys.exit(
            "ERRO: ficheiro .env.dev não encontrado.\n"
            "NUNCA uses .env.local — estes scripts só correm contra a BD de desenvolvimento."
        )
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

EDGAR_BASE = "https://data.sec.gov/api/xbrl/companyfacts"
EDGAR_HEADERS = {"User-Agent": "BullValue admin@bullocracy.com"}

# Deteção e tolerância são coisas diferentes e tinham o mesmo valor (2.5), o
# que escondia uma família inteira de casos: um split 2:1 dá um degrau de
# exatamente 2.0 e um 3:2 dá 1.5 — ambos abaixo de 2.5, portanto essas
# empresas nunca eram sequer investigadas (54 na BD atual, contra 35 acima de
# 2.5x). O pressuposto de que "os 2:1 consecutivos compõem" só é verdade
# quando há vários; um único 2:1 não compõe com nada.
#
# Baixar a deteção não relaxa o rigor: cada row só é ajustada por um fator que
# corresponda a splits realmente taggados no EDGAR, e quem não encaixar fica
# intocada e é reportada. O custo de detetar a mais é uma chamada ao EDGAR.
BREAK_DETECT = 1.4          # abaixo de 1.5 para apanhar 3:2 exatos
BREAK_DETECT_LO = 1 / BREAK_DETECT
# Tolerância de encaixe: o fator escolhido tem de deixar a row a menos disto da
# série (weighted averages nunca batem exato; buybacks/emissões no mesmo ano
# desviam). Mantém-se folgada de propósito.
BREAK_HI = 2.5
BREAK_LO = 1 / BREAK_HI

SPLIT_TAGS = [
    "StockholdersEquityNoteStockSplitConversionRatio1",
    "StockholdersEquityNoteStockSplitConversionRatio",
]

session = requests.Session()
session.headers.update(EDGAR_HEADERS)


def fetch_split_ratios(cik: str) -> list[tuple[str, float]]:
    """Devolve [(data_efetiva, rácio)] dos splits taggados no EDGAR, dedup."""
    padded = cik.zfill(10)
    try:
        r = session.get(f"{EDGAR_BASE}/CIK{padded}.json", timeout=60)
        if r.status_code == 404:
            return []
        r.raise_for_status()
        gaap = (r.json().get("facts") or {}).get("us-gaap") or {}
    except Exception as e:
        print(f"    EDGAR error: {e}")
        return []

    events: dict[tuple[int, float], str] = {}  # (ano, rácio) → data mais antiga
    for tag in SPLIT_TAGS:
        node = gaap.get(tag)
        if not node:
            continue
        for entries in (node.get("units") or {}).values():
            for e in entries:
                val = e.get("val")
                end = e.get("end")
                if not val or not end or val == 1:
                    continue
                # O mesmo split aparece em vários filings com datas próximas —
                # dedup por (ano, rácio), guardando a data mais antiga.
                key = (int(end[:4]), float(val))
                if key not in events or end < events[key]:
                    events[key] = end
    return sorted(((d, ratio) for (_, ratio), d in events.items()))


def corroborate_with_prices(ticker: str, edgar: list[tuple[str, float]]) -> tuple[list[tuple[str, float]], list[str]]:
    """Mantém só os rácios do EDGAR confirmados pela fonte dos PREÇOS (yfinance).

    O objetivo do ajuste é pôr os fundamentais na mesma base de split em que
    estão os preços. Logo a autoridade não é o EDGAR — é quem ajusta os
    preços. Quando as duas fontes discordam, ajustar pelo EDGAR *cria* a
    incoerência que se queria eliminar.

    Caso real: a HON tem no EDGAR uma etiqueta de 0.5x a 2026-06-29, mas o
    yfinance regista 0.9535x na mesma data — o fator típico de um SPIN-OFF,
    que mexe no preço e não no número de ações. Sem esta validação o script
    multiplicava 51 linhas boas por 0.5 para as alinhar com uma única linha
    recente defeituosa (319M contra 638M no trimestre anterior), destruindo o
    histórico. A DD, essa, tem 0.333x nas duas fontes — reverse split real,
    e é ajustada.
    """
    try:
        yf_splits = yf.Ticker(ticker).splits
    except Exception as e:
        return [], [f"yfinance indisponível ({e}) — nada ajustado, EDGAR sozinho não chega"]

    price_events = [(str(d.date()), float(r)) for d, r in yf_splits.items()] if len(yf_splits) else []
    kept, warnings = [], []
    for date, ratio in edgar:
        match = None
        for pdate, pratio in price_events:
            # ±10 dias: a data efetiva e a de registo raramente coincidem
            if abs((datetime.date.fromisoformat(pdate) - datetime.date.fromisoformat(date)).days) > 10:
                continue
            if abs(math.log(pratio / ratio)) < math.log(1.02):
                match = (pdate, pratio)
                break
        if match:
            kept.append((date, ratio))
        else:
            near = [f"{d} {r:g}x" for d, r in price_events
                    if abs((datetime.date.fromisoformat(d) - datetime.date.fromisoformat(date)).days) <= 10]
            warnings.append(
                f"EDGAR diz {date} {ratio:g}x mas a série de preços "
                f"{'diz ' + ', '.join(near) if near else 'não tem split nessa data'} — "
                f"não é split de ações (provável spin-off), ignorado"
            )
    return kept, warnings


def candidate_factors(splits: list[tuple[str, float]], older_end: str) -> list[float]:
    """Produtos de subconjuntos dos splits posteriores a older_end.
    Uma quebra pode acumular vários splits (ex.: NVDA 4:1 e 10:1 → 40x)."""
    ratios = [r for d, r in splits if d > older_end]
    factors = set()
    for n in range(1, len(ratios) + 1):
        for combo in itertools.combinations(ratios, n):
            f = 1.0
            for r in combo:
                f *= r
            factors.add(f)
    return sorted(factors, reverse=True)


def find_break_companies(cur) -> list[dict]:
    """Empresas com quebras >BREAK_DETECT entre rows consecutivas (anuais E trimestrais:
    Q4 sintetizado/backfilled pode ficar na base pré-split mesmo com a série
    anual já ajustada — a deteção tem de ver todas as rows)."""
    cur.execute("""
        WITH s AS (
          SELECT c.id, c.ticker, c.cik,
                 f."sharesOutstanding"::float8 AS sh,
                 LAG(f."sharesOutstanding"::float8)
                   OVER (PARTITION BY c.id ORDER BY f."periodEnd") AS prev
          FROM fundamentals f JOIN companies c ON f."companyId" = c.id
          WHERE f."sharesOutstanding" IS NOT NULL AND c.cik IS NOT NULL)
        SELECT DISTINCT id, ticker, cik FROM s
        WHERE prev IS NOT NULL AND prev > 0 AND (sh / prev > %s OR sh / prev < %s)
        ORDER BY ticker
    """, (BREAK_DETECT, BREAK_DETECT_LO))
    return [{"id": r[0], "ticker": r[1], "cik": r[2]} for r in cur.fetchall()]


def plan_adjustments(rows: list[dict], splits: list[tuple[str, float]]) -> tuple[list[dict], list[str]]:
    """rows: ordenadas por periodEnd DESC (mais recente primeiro; base atual).

    Decisão POR ROW, não por fator cumulativo: o EDGAR reapresenta 2-3 anos
    comparativos, portanto rows já na base pós-split aparecem intercaladas com
    rows na base antiga (ex.: AAPL FY2018 anual restated entre quarters
    pré-split). Cada row escolhe o fator — 1 ou um produto de splits
    posteriores ao seu periodEnd — que melhor mantém a continuidade da série;
    se nenhum encaixar, a row fica intocada e é reportada.

    Devolve (updates, avisos)."""
    updates: list[dict] = []
    warnings: list[str] = []
    prev_adjusted: float | None = None

    for row in rows:
        raw = row["shares"]
        if raw is None or raw <= 0:
            continue
        if prev_adjusted is None:
            prev_adjusted = raw  # row mais recente = base atual (âncora)
            continue

        cands = [1.0] + candidate_factors(splits, row["period_end"])
        best, best_dev = 1.0, None
        for f in cands:
            dev = abs(math.log((raw * f) / prev_adjusted))
            if best_dev is None or dev < best_dev:
                best, best_dev = f, dev

        if best_dev is None or best_dev > math.log(BREAK_HI):
            warnings.append(
                f"{row['period_end']}: {raw/1e6:.0f}M não encaixa na série "
                f"({prev_adjusted/1e6:.0f}M) com nenhum fator de split — não ajustado"
            )
            continue  # mantém a âncora; não propaga a anomalia

        if best != 1.0:
            updates.append({"id": row["id"], "factor": best, "period_end": row["period_end"],
                            "shares_before": raw, "shares_after": raw * best})
        prev_adjusted = raw * best

    return updates, warnings


def main():
    dry_run = "--dry-run" in sys.argv

    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        companies = find_break_companies(cur)
    print(f"{len(companies)} empresas com quebras de shares >2.5x a validar contra splits EDGAR.")

    total_updates = 0
    for company in companies:
        ticker = company["ticker"]
        print(f"\n{ticker}:")
        splits = fetch_split_ratios(company["cik"])
        time.sleep(0.2)
        if not splits:
            print("  sem splits taggados no EDGAR — quebra é corporate action (merger/IPO/reorg), não ajustado")
            continue
        print(f"  splits EDGAR: {', '.join(f'{d} {r}x' for d, r in splits)}")
        splits, price_warnings = corroborate_with_prices(ticker, splits)
        for w in price_warnings:
            print(f"  ⚠ {w}")
        if not splits:
            print("  nenhum split confirmado pela série de preços — não ajustado")
            continue

        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, "periodEnd"::date::text, "sharesOutstanding"::float8
                FROM fundamentals
                WHERE "companyId" = %s AND "sharesOutstanding" IS NOT NULL
                ORDER BY "periodEnd" DESC
            """, (company["id"],))
            rows = [{"id": r[0], "period_end": r[1], "shares": r[2]} for r in cur.fetchall()]

        updates, warnings = plan_adjustments(rows, splits)
        for w in warnings:
            print(f"  ⚠ {w}")
        if not updates:
            print("  nada a ajustar")
            continue

        by_factor: dict[float, int] = {}
        for u in updates:
            by_factor[u["factor"]] = by_factor.get(u["factor"], 0) + 1
        first, last = updates[0], updates[-1]
        breakdown = ", ".join(f"×{f:g}: {n} rows" for f, n in sorted(by_factor.items()))
        print(f"  {len(updates)} rows a ajustar ({last['period_end']} → {first['period_end']}) — {breakdown}; "
              f"ex.: {first['shares_before']/1e6:.0f}M → {first['shares_after']/1e6:.0f}M")

        if dry_run:
            total_updates += len(updates)
            continue

        try:
            with conn.cursor() as cur:
                for u in updates:
                    cur.execute("""
                        UPDATE fundamentals SET
                          "sharesOutstanding" = "sharesOutstanding" * %(factor)s,
                          "epsDiluted"        = "epsDiluted" / %(factor)s,
                          "dividendPerShare"  = "dividendPerShare" / %(factor)s,
                          "updatedAt"         = NOW()
                        WHERE id = %(id)s
                    """, u)
            conn.commit()
            total_updates += len(updates)
        except Exception as e:
            conn.rollback()
            print(f"  DB error: {e}")

    # GOOG/FOX/NWS não têm CIK próprio (find_break_companies exclui-os) e o
    # sync no fim da ingestão copia a base pré-ajuste — sem isto, o GOOG
    # ficava com a série GOOGL não ajustada ao split após cada cron semanal.
    if total_updates > 0 and not dry_run:
        from ingest_fundamentals import sync_dual_class
        sync_dual_class(conn)

    conn.close()
    print(f"\nConcluído{' (dry-run)' if dry_run else ''}. {total_updates} rows ajustadas.")


if __name__ == "__main__":
    main()
