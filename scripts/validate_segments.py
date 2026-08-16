"""
validate_segments.py — Gate de QUALIDADE de `fundamentals.revenueSegments` (read-only).

Só faz SELECT — seguro contra qualquer BD. As ÚNICAS escritas são ficheiros em
scripts/out/ e docs/audit/. Nunca toca numa linha da base de dados.

Fecha a lacuna que nenhum validador cobria: os segmentos de receita entram na BD
por um pipeline manual (ingest_segments.py, sem cron nenhum) que é cego ao eixo
XBRL, funde trimestre com ano, e escreve o mesmo JSON na linha ANNUAL e na Q4.
Resultado medido: ~14,5% das linhas com segmentos não reconciliam com o `revenue`
da própria linha. O problema estava a ser mascarado na UI (StockAnalyst.tsx:174-195)
em vez de corrigido na origem — e o lib/ai/context.ts injeta os mesmos dados no
prompt do Gemini rotulados "verificado", sem guard nenhum.

Uso:
  python scripts/validate_segments.py                        # valida vs baseline
  python scripts/validate_segments.py --baseline             # congela o estado atual
  python scripts/validate_segments.py --profile              # + coortes/impacto/SDQI
  python scripts/validate_segments.py --report PATH --csv PATH
  python scripts/validate_segments.py --explain UBER:ANNUAL:2024
  python scripts/validate_segments.py --golden               # regressão vs fixtures
  python scripts/validate_segments.py --tickers UBER,CDW --rules SEG_SUM_EXPLOSIVE
  python scripts/validate_segments.py --severity P0,P1 --json

Exit 1 se houver violações P0 NOVAS (não na baseline nem em segments_accepted.json).
Bootstrap de env: usa DIRECT_URL do ambiente; senão carrega .env / .env.local / .env.dev.

A baseline é ANCORADA NO HOST: comparar uma baseline de um host com uma execução
noutro é recusado. O CI corre contra secrets.DIRECT_URL, que é um alvo diferente
do localhost de desenvolvimento — sem esta âncora, CI e local discordariam para sempre.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import segment_checks as C
import segment_profile as P

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_DIR = os.path.join(os.path.dirname(__file__), "out")
LEXICON_PATH = os.path.join(os.path.dirname(__file__), "data", "segment_lexicon.json")
GOLDEN_PATH = os.path.join(os.path.dirname(__file__), "data", "segment_golden.json")
ACCEPTED_PATH = os.path.join(os.path.dirname(__file__), "segments_accepted.json")
TARGETS_PATH = os.path.join(os.path.dirname(__file__), "segment_targets.py")


def _bootstrap_env() -> str:
    url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if url:
        return url
    for fname in (".env", ".env.local", ".env.dev"):
        p = os.path.join(ROOT, fname)
        if os.path.exists(p):
            load_dotenv(p)
            url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
            if url:
                return url
    sys.exit("ERRO: DIRECT_URL/DATABASE_URL não definida (nem em .env/.env.local/.env.dev).")


def _host_of(url: str) -> str:
    return url.split("@")[-1].split("/")[0] if "@" in url else "localhost"


def _slug(host: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in host)


def _sha256(path: str) -> str | None:
    if not os.path.exists(path):
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


# ═════════════════════════════════════════════════════════════════════════════
# Carregamento (SELECT apenas)
# ═════════════════════════════════════════════════════════════════════════════

SQL_ROWS = """
SELECT c.ticker, c.sector, f."companyId", f."periodType", f."fiscalYear",
       f."fiscalQuarter", f."periodEnd"::date AS "periodEnd", f.revenue,
       f."revenueSegments"
FROM fundamentals f
JOIN companies c ON c.id = f."companyId"
WHERE c."isActive" = true
ORDER BY c.ticker, f."periodEnd";
"""

SQL_HELD = """
SELECT DISTINCT c.ticker FROM companies c
WHERE c.id IN (SELECT "companyId" FROM portfolio_items)
   OR c.id IN (SELECT "companyId" FROM watchlist_items)
   OR c.id IN (SELECT "companyId" FROM watchlist_entries);
"""

SQL_MCAP = """
WITH last_price AS (
  SELECT p.ticker, p.close,
         ROW_NUMBER() OVER (PARTITION BY p.ticker ORDER BY p.date DESC) rn
  FROM prices p
), last_shares AS (
  SELECT c.ticker, f."sharesOutstanding" sh,
         ROW_NUMBER() OVER (PARTITION BY c.ticker ORDER BY f."periodEnd" DESC) rn
  FROM fundamentals f JOIN companies c ON c.id = f."companyId"
  WHERE f."sharesOutstanding" IS NOT NULL AND f."sharesOutstanding" > 0
)
SELECT lp.ticker, lp.close * ls.sh AS mcap
FROM last_price lp JOIN last_shares ls ON ls.ticker = lp.ticker
WHERE lp.rn = 1 AND ls.rn = 1;
"""


def load_data(url: str, tickers: set[str] | None):
    conn = psycopg2.connect(url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(SQL_ROWS)
            raw = cur.fetchall()
            cur.execute(SQL_HELD)
            held = {r["ticker"] for r in cur.fetchall()}
            cur.execute(SQL_MCAP)
            mcap = {r["ticker"]: float(r["mcap"]) if r["mcap"] is not None else None
                    for r in cur.fetchall()}
            cur.execute('SELECT max("updatedAt") AS m FROM fundamentals;')
            last_update = cur.fetchone()["m"]
    finally:
        conn.close()

    by_ticker: dict[str, list[dict]] = defaultdict(list)
    for r in raw:
        if tickers and r["ticker"] not in tickers:
            continue
        segs = r["revenueSegments"]
        if isinstance(segs, str):
            try:
                segs = json.loads(segs)
            except Exception:
                segs = None
        clean = None
        if isinstance(segs, dict) and segs:
            clean = {}
            for k, v in segs.items():
                try:
                    clean[k] = float(v) if v is not None else None
                except (TypeError, ValueError):
                    clean[k] = None
        by_ticker[r["ticker"]].append({
            "ticker": r["ticker"], "sector": r["sector"], "companyId": r["companyId"],
            "periodType": r["periodType"], "fiscalYear": r["fiscalYear"],
            "fiscalQuarter": r["fiscalQuarter"], "periodEnd": r["periodEnd"],
            "revenue": float(r["revenue"]) if r["revenue"] is not None else None,
            "segs": clean,
        })
    return by_ticker, held, mcap, last_update


# ═════════════════════════════════════════════════════════════════════════════
# Execução das regras
# ═════════════════════════════════════════════════════════════════════════════

def finding_key(ticker: str, period_type: str, period_end, rule: str, seg_key=None) -> str:
    base = f"{ticker}|{period_type}|{period_end}|{rule}"
    return f"{base}|{seg_key}" if seg_key else base


def run_company(ticker: str, rows: list[dict], lex: dict,
                sector_median_keys: float | None) -> list[dict]:
    """Corre a bateria completa numa empresa. Devolve findings já com chave."""
    out: list[dict] = []
    suppressed = C.chart_is_suppressed(rows)
    chart_visible = not suppressed

    def emit(f: dict, row: dict | None = None):
        pt = f.get("periodType") or (row["periodType"] if row else "COMPANY")
        pe = f.get("periodEnd") or (str(row["periodEnd"]) if row else "-")
        f["ticker"] = ticker
        f["periodType"] = pt
        f["periodEnd"] = str(pe)
        f["fiscalYear"] = row["fiscalYear"] if row else None
        f["fiscalQuarter"] = row["fiscalQuarter"] if row else None
        f["revenue"] = row["revenue"] if row else None
        f["chartVisible"] = chart_visible
        f.setdefault("segmentKey", None)
        f.setdefault("value", None)
        f.setdefault("ratio", None)
        f["key"] = finding_key(ticker, pt, pe, f["rule"], f.get("segmentKey"))
        out.append(f)

    for row in rows:
        segs, rev = row.get("segs"), row.get("revenue")
        if not segs:
            continue
        vals = {k: v for k, v in segs.items() if v is not None}
        for f in C.check_reconciliation(vals, rev):
            emit(f, row)
        for f in C.check_structure(vals, rev, lex):
            emit(f, row)
        for f in C.check_axis_mix(vals, rev, lex):
            emit(f, row)
        for f in C.check_labels(segs, lex, chart_visible=chart_visible):
            emit(f, row)
        for f in C.check_values(segs, rev):
            emit(f, row)

    # Regras multi-linha (a coluna periodEnd vem no próprio finding).
    for f in C.check_period_duplication(rows):
        emit(dict(f, periodType="ANNUAL+QUARTERLY"))
    for f in C.check_q4_carries_annual(rows):
        emit(dict(f, periodType="QUARTERLY"))
    for f in C.check_quarter_sum(rows):
        emit(dict(f, periodType="QUARTERLY"))
    for f in C.check_continuity(rows, lex):
        emit(dict(f, periodType="ANNUAL"))
    for f in C.check_parent_rollups(rows, lex):
        emit(dict(f, periodType="COMPANY"))
    for f in C.check_label_collisions(rows, lex):
        emit(dict(f, periodType="COMPANY", periodEnd="-"))
    for f in C.check_coverage(rows, sector_median_keys):
        emit(dict(f, periodType=f.get("periodType", "COMPANY"),
                  periodEnd=f.get("periodEnd", "-")))
    for f in C.check_key_cardinality(rows):
        emit(dict(f, periodType="COMPANY", periodEnd="-"))
    return out


# ═════════════════════════════════════════════════════════════════════════════
# --explain
# ═════════════════════════════════════════════════════════════════════════════

def do_explain(spec: str, by_ticker: dict, lex: dict):
    parts = spec.split(":")
    if len(parts) < 2:
        sys.exit("--explain espera TICKER:PERIODTYPE[:FISCALYEAR], ex. UBER:ANNUAL:2024")
    ticker, ptype = parts[0].upper(), parts[1].upper()
    fy = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None

    rows = by_ticker.get(ticker, [])
    cands = [r for r in rows if r["periodType"] == ptype and (fy is None or r["fiscalYear"] == fy)]
    if not cands:
        sys.exit(f"Sem linha para {spec}")
    row = cands[-1]
    segs = {k: v for k, v in (row["segs"] or {}).items() if v is not None}
    rev = row["revenue"]

    print(f"\n{'='*78}\n{ticker}  {ptype}  FY{row['fiscalYear']}"
          f"{'Q'+str(row['fiscalQuarter']) if row['fiscalQuarter'] else ''}"
          f"  periodEnd={row['periodEnd']}\n{'='*78}")
    print(f"receita (fundamentals.revenue) : {rev:,.0f}" if rev else "receita: NULL")
    total = sum(segs.values())
    print(f"Σ segmentos                    : {total:,.0f}")
    if rev:
        print(f"rácio                          : {total/rev:.4f}x")

    print(f"\n{'chave':<52} {'valor':>18} {'quota':>7}  eixo")
    print("-" * 96)
    axis_of = {k: C.classify_axis(k, lex) for k in segs}
    for k, v in sorted(segs.items(), key=lambda x: -x[1]):
        print(f"{k[:52]:<52} {v:>18,.0f} {v/total*100 if total else 0:>6.1f}%  {axis_of[k]}")

    by_axis = defaultdict(float)
    for k, v in segs.items():
        by_axis[axis_of[k]] += v
    print(f"\nSoma por eixo (vs receita):")
    for a, s in sorted(by_axis.items(), key=lambda x: -x[1]):
        mark = "  ← FECHA com a receita" if rev and abs(s - rev) <= 0.01 * rev else ""
        print(f"  {a:<15} {s:>18,.0f}  {s/rev if rev else 0:>7.3f}x{mark}")

    if rev:
        sub, status, method = C.find_reconciling_subset(sorted(segs.items()), rev, axis_of=axis_of)
        print(f"\nSubconjunto que reconcilia: status={status} método={method}")
        if sub:
            extra = [k for k in segs if k not in set(sub)]
            print(f"  MANTER ({len(sub)}): {', '.join(sub)}")
            print(f"  REMOVER ({len(extra)}): " + ", ".join(f"{k} [{axis_of[k]}]" for k in extra))

    print("\nAchados desta linha:")
    fs = [f for f in run_company(ticker, rows, lex, None)
          if f["periodEnd"] == str(row["periodEnd"])
          and f["periodType"] in (ptype, "ANNUAL+QUARTERLY")]
    if not fs:
        print("  (nenhum)")
    for f in sorted(fs, key=lambda x: x["severity"]):
        print(f"  [{f['severity']}] {f['rule']}\n        {f['detail']}")
    print()


# ═════════════════════════════════════════════════════════════════════════════
# --golden
# ═════════════════════════════════════════════════════════════════════════════

def do_golden(by_ticker: dict, lex: dict) -> int:
    if not os.path.exists(GOLDEN_PATH):
        print(f"⚠️  Sem fixtures em {GOLDEN_PATH} — nada a validar.")
        return 0
    with open(GOLDEN_PATH, encoding="utf-8") as f:
        fixtures = json.load(f).get("fixtures", [])
    if not fixtures:
        print("⚠️  Ficheiro de fixtures vazio.")
        return 0

    # Regras cujo âmbito é a EMPRESA (multi-período): o seu periodEnd não é o da
    # linha do fixture, logo não se pode exigir coincidência de data.
    COMPANY_SCOPED = {"SEG_PARENT_ROLLUP", "SEG_LABEL_COLLISION_SAME_ROW",
                      "SEG_LABEL_COLLISION_DISJOINT", "SEG_KEY_CARDINALITY",
                      "SEG_MISSING_ALL", "SEG_MISSING_PERIOD", "SEG_STALE",
                      "SEG_PEER_UNDERSEGMENTED", "SEG_AXIS_SWITCH", "SEG_SERIES_HOLE"}

    tp = fp = fn = 0
    failures = []
    print(f"\n=== Golden set: {len(fixtures)} fixtures ===")
    for fx in fixtures:
        t, pt, fy = fx["ticker"], fx["periodType"], fx.get("fiscalYear")
        fq = fx.get("fiscalQuarter")
        rows = by_ticker.get(t, [])
        match = [r for r in rows if r["periodType"] == pt and r["fiscalYear"] == fy
                 and (fq is None or r.get("fiscalQuarter") == fq)]
        # Preferir SEMPRE uma linha com segmentos: uma empresa pode ter Q1-Q3 sem
        # segmentos e só o Q4 preenchido (TSCO), e apanhar a linha vazia fazia o
        # fixture falhar por motivo errado.
        with_segs = [r for r in match if r.get("segs")]
        if not (with_segs or match):
            failures.append(f"{t} {pt} FY{fy}: linha AUSENTE na BD")
            fn += len(fx.get("expectedFindings", []))
            continue
        row = (with_segs or match)[0]
        all_f = run_company(t, rows, lex, None)
        got = {f["rule"] for f in all_f
               if f["periodEnd"] == str(row["periodEnd"]) or f["rule"] in COMPANY_SCOPED}
        exp = set(fx.get("expectedFindings", []))

        missing = exp - got
        tp += len(exp & got)
        fn += len(missing)
        if missing:
            failures.append(f"{t} {pt} FY{fy}: regras esperadas que NÃO dispararam: {sorted(missing)}")

        # Controlos negativos: nenhum P0 inesperado.
        if fx.get("isCleanControl"):
            p0 = {f["rule"] for f in all_f if f["severity"] == "P0"
                  and (f["periodEnd"] == str(row["periodEnd"])
                       or f["rule"] in COMPANY_SCOPED)}
            unexpected = p0 - exp
            fp += len(unexpected)
            if unexpected:
                failures.append(f"{t} {pt} FY{fy} (CONTROLO LIMPO): P0 INESPERADOS: {sorted(unexpected)}")

        # Valores esperados, quando o fixture os traz do footnote do 10-K.
        for k, want in (fx.get("expectedSegments") or {}).items():
            have = (row["segs"] or {}).get(k)
            if have is None:
                failures.append(f"{t} FY{fy}: segmento '{k}' ausente (esperado {want:,.0f})")
            elif abs(have - want) > 0.01 * abs(want):
                failures.append(f"{t} FY{fy}: '{k}' = {have:,.0f} vs esperado {want:,.0f}")

    prec = tp / (tp + fp) if (tp + fp) else 1.0
    rec = tp / (tp + fn) if (tp + fn) else 1.0
    print(f"\nprecisão={prec:.3f} recall={rec:.3f}  (TP={tp} FP={fp} FN={fn})")
    if failures:
        print(f"\n❌ {len(failures)} falhas:")
        for x in failures[:40]:
            print(f"  - {x}")
        return 1
    print("\n✓ Golden set verde.")
    return 0


# ═════════════════════════════════════════════════════════════════════════════
# Relatório
# ═════════════════════════════════════════════════════════════════════════════

def write_report(path: str, meta: dict, findings: list[dict], feats: list[dict],
                 sdqi: dict, silh: dict, val_freq: list | None = None) -> None:
    by_rule = Counter(f["rule"] for f in findings)
    sev_of = {f["rule"]: f["severity"] for f in findings}
    by_sev = Counter(f["severity"] for f in findings)
    by_cohort = Counter(x["cohort"] for x in feats)
    ranked = sorted(feats, key=lambda x: -(x.get("impactScore") or 0))
    total_impact = sum(x.get("impactScore") or 0 for x in ranked) or 1.0

    L = []
    a = L.append
    a("# Qualidade de dados — `revenueSegments`\n")
    a(f"> Gerado por `scripts/validate_segments.py` em {meta['runAt']} contra "
      f"`{meta['dbHost']}` (read-only).\n")
    a(f"> `segment_targets.py` sha256 `{(meta.get('segmentTargetsSha256') or '?')[:16]}…` · "
      f"`max(fundamentals.updatedAt)` = {meta.get('lastDbUpdate')}\n")

    a("\n## 1. Sumário executivo\n")
    a(f"| Métrica | Valor |\n|---|---|")
    a(f"| **SDQI** | **{sdqi['SDQI']}** / 100 |")
    if sdqi.get("SDQI_weighted") is not None:
        a(f"| SDQI ponderado por impacto | {sdqi['SDQI_weighted']} |")
    a(f"| R — reconciliação | {sdqi['R']}% |")
    a(f"| S — estrutura sem P0 | {sdqi['S']}% |")
    a(f"| L — rótulos limpos | {sdqi['L']}% |")
    a(f"| C — continuidade de eixo | {sdqi['C']}% |")
    a(f"| V — cobertura | {sdqi['V']}% |")
    a(f"| Empresas analisadas | {meta['nCompanies']} |")
    a(f"| — com segmentos | {meta.get('nCompaniesWithSegs')} |")
    a(f"| — sem segmentos nenhuns | "
      f"{meta['nCompanies'] - (meta.get('nCompaniesWithSegs') or 0)} |")
    a(f"| Linhas com segmentos | {meta['nRowsWithSegs']} |")
    a(f"| Pares chave/valor | {meta['nPairs']} |")
    a(f"| Achados totais | {len(findings)} |")
    for s in ("P0", "P1", "P2", "P3"):
        a(f"| — {s} | {by_sev.get(s, 0)} |")

    a("\n### Denominadores (explícitos, para o score ser honesto)\n")
    for k, v in sdqi["_denominators"].items():
        a(f"- `{k}`: {v}")
    a("\n> Nota: as regras do grupo A saltam linhas com `revenue` nulo. O "
      "`SEG_ORPHAN_ROW` conta-as explicitamente — omitir isto seria reportar "
      "95% de qualidade sobre uma amostra de 60%.\n")

    a("\n## 2. Achados por regra\n")
    a("| Regra | Sev | Ocorrências | Empresas |\n|---|---|---|---|")
    for rule, n in by_rule.most_common():
        ncomp = len({f["ticker"] for f in findings if f["rule"] == rule})
        a(f"| `{rule}` | {sev_of.get(rule,'')} | {n} | {ncomp} |")

    a("\n## 3. Coortes de remediação\n")
    a("Cada coorte mapeia 1:1 para UMA correção de raiz. É isto que colapsa "
      f"{meta['nCompanies']} empresas em {len([c for c in by_cohort if by_cohort[c]])} "
      "itens de trabalho.\n")
    a("| Coorte | Empresas | Causa-raiz |\n|---|---|---|")
    for c in P.COHORTS:
        if by_cohort.get(c):
            a(f"| `{c}` | {by_cohort[c]} | {P.COHORT_ROOT_CAUSE.get(c,'')} |")

    if silh:
        a("\n### Validação da taxonomia (silhouette)\n")
        a("O k-means NÃO atribui coortes — serve só para auditar se as fronteiras "
          "definidas à mão são separáveis.\n")
        a("> **Como ler:** o silhouette mede separação GEOMÉTRICA. Uma coorte que é "
          "uma BANDA INTERMÉDIA de uma dimensão ordenada (o `ELIMINATION_GROSS` ocupa "
          "1,02 < mediana ≤ 1,35, entre o `CLEAN` ~1,0 e o `AXIS_STACKED` >1,5) tem "
          "silhouette negativo POR CONSTRUÇÃO — cada ponto tem vizinhos mais próximos "
          "nas bandas adjacentes. Isso não invalida a fronteira: a distinção é "
          "contabilística, não geométrica. O silhouette só é acionável para coortes que "
          "deveriam formar um grupo ISOLADO (`Q4_CONTAMINATED`, `BANK_PARTIAL`, "
          "`TOTAL_ROW_INJECTED`, `LABEL_CHURN`); aí, < 0,10 é sinal real de fronteira "
          "mal desenhada.\n")
        a("| Coorte | Silhouette |\n|---|---|")
        for c, s in sorted(silh.items(), key=lambda x: -x[1]):
            banded = c in ("ELIMINATION_GROSS", "AXIS_STACKED", "BANK_PARTIAL")
            flag = "" if (s >= 0.10 or banded) else " ⚠️ revisar fronteira"
            if banded and s < 0.10:
                flag = " (banda intermédia — negativo esperado)"
            a(f"| `{c}` | {s}{flag} |")

    a("\n## 4. Top 40 empresas por impacto\n")
    a("`impacto = severityMass × audienceScore × surfaceScore × recencyScore`. "
      "Uma empresa com o gráfico suprimido continua a pontuar porque o "
      "`lib/ai/context.ts` injeta os mesmos segmentos no Gemini como `verificado`.\n")
    a("| # | Ticker | Coorte | Impacto | % cum. | P0 | mediana r | MAD r | Gráfico |")
    a("|---|---|---|---|---|---|---|---|---|")
    cum = 0.0
    for i, x in enumerate(ranked[:40], 1):
        cum += x.get("impactScore") or 0
        mr = f"{x['medianRatio']:.3f}" if x.get("medianRatio") is not None else "—"
        md = f"{x['madRatio']:.3f}" if x.get("madRatio") is not None else "—"
        a(f"| {i} | **{x['ticker']}** | `{x['cohort']}` | {x.get('impactScore',0):.0f} | "
          f"{cum/total_impact*100:.1f}% | {x.get('nP0',0)} | {mr} | {md} | "
          f"{'visível' if x.get('chartVisible') else 'suprimido'} |")

    for pct in (50, 80):
        c2, k = 0.0, 0
        for x in ranked:
            c2 += x.get("impactScore") or 0
            k += 1
            if c2 / total_impact * 100 >= pct:
                break
        a(f"\n- As **{k}** empresas de maior impacto concentram {pct}% do impacto total.")

    a("\n## 5. Exemplos trabalhados por coorte\n")
    for c in P.COHORTS:
        members = [x for x in ranked if x["cohort"] == c]
        if not members or c == "CLEAN":
            continue
        top = members[0]
        a(f"\n### `{c}` — {len(members)} empresas · causa: {P.COHORT_ROOT_CAUSE.get(c,'')}\n")
        a(f"Exemplo de maior impacto: **{top['ticker']}** "
          f"(mediana r={top.get('medianRatio') and round(top['medianRatio'],3)}, "
          f"MAD={top.get('madRatio') and round(top['madRatio'],3)}, "
          f"{top.get('nP0',0)} achados P0)\n")
        ex = [f for f in findings if f["ticker"] == top["ticker"]][:6]
        for f in ex:
            a(f"- `{f['rule']}` [{f['severity']}] {f['periodEnd']} — {f['detail'][:200]}")
        a(f"\nOutras: {', '.join(x['ticker'] for x in members[1:16])}"
          f"{' …' if len(members) > 16 else ''}")

    a("\n## 6. Mapa de causas-raiz\n")
    a("| Regra | Causa | Local |\n|---|---|---|")
    for rule, cause, loc in ROOT_CAUSES:
        if by_rule.get(rule):
            a(f"| `{rule}` | {cause} | `{loc}` |")

    a("\n## 7. Lista de execução de pseudo-segmentos\n")
    a("Apagar estas chaves é a melhor vitória visível por unidade de esforço do "
      "backlog. **A lista está dividida de propósito** — as duas metades têm "
      "níveis de confiança MUITO diferentes e tratá-las como uma só causaria "
      "perda de dados reais.\n")

    safe = Counter(f["segmentKey"] for f in findings
                   if f["rule"] in ("SEG_TOTAL_LABEL", "SEG_LABEL_NON_REVENUE")
                   and f.get("segmentKey"))
    a("\n### 7a. Identificadas pelo RÓTULO — deterministicamente seguras\n")
    a("O nome é literalmente um total/subtotal (`Operatings` = o "
      "`us-gaap:OperatingSegmentsMember` mutilado) ou uma linha de custo raspada "
      "de uma fila adjacente da tabela. Não há juízo de valor: podem ser "
      "apagadas em bloco.\n")
    a("| Chave | Ocorrências |\n|---|---|")
    for k, n in safe.most_common(45):
        a(f"| `{k}` | {n} |")

    val_only = Counter(f["segmentKey"] for f in findings
                       if f["rule"] == "SEG_GRAND_TOTAL_VALUE" and f.get("segmentKey")
                       and f["segmentKey"] not in safe)
    a("\n### 7b. Identificadas só pelo VALOR — exigem verificação individual\n")
    a("O valor iguala a receita total, mas o RÓTULO é um nome de negócio "
      "plausível. Duas explicações possíveis, indistinguíveis sem o filing: "
      "(i) é um total de dimensão mal ingerido, ou (ii) é um segmento "
      "genuinamente dominante que representa ~100% da receita — o caso de "
      "`Southern California Edison Company`, que É praticamente toda a receita "
      "da EIX. **Apagar esta metade em bloco destruiria dados legítimos.** "
      "Verificar contra o footnote antes de tocar em cada uma.\n")
    a("| Chave | Ocorrências |\n|---|---|")
    for k, n in val_only.most_common(45):
        a(f"| `{k}` | {n} |")

    trunc = [f for f in findings if f["rule"] == "SEG_SUBSET_SEARCH_TRUNCATED"]
    a("\n## 8. Limitações declaradas\n")
    a(f"- **{len(trunc)}** linhas com chaves demais para busca exaustiva de "
      "subconjunto: cobertura dessas linhas NÃO é exaustiva (listadas no CSV "
      "como `SEG_SUBSET_SEARCH_TRUNCATED`).")
    amb = len([f for f in findings if f["rule"] == "SEG_RECONCILING_SUBSET_AMBIGUOUS"])
    uni = len([f for f in findings if f["rule"] == "SEG_RECONCILING_SUBSET"])
    if uni + amb:
        a(f"- Taxa de ambiguidade do subset-sum: **{amb/(uni+amb)*100:.1f}%** "
          f"({amb} ambíguos / {uni} únicos) — métrica de autoqualidade do harness.")
    a("- O JSONB **não** preserva ordem nem chaves duplicadas: dois rótulos que o "
      "Postgres considera iguais já colapsaram na escrita, e o harness não os "
      "consegue detetar. A cobertura de colisões é, por isso, um limite inferior.")
    a("- A classificação de eixo é heurística de léxico. O eixo é um atributo "
      "LITERAL no XML de origem (`explicitMember@dimension`) que o "
      "`ingest_segments.py:66` deita fora; a fase 2 (SEC DERA) substitui a "
      "heurística por ground truth.")

    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    print(f"Relatório escrito: {path}")


ROOT_CAUSES = [
    ("SEG_Q4_CLONE_OF_ANNUAL", "UPDATE omite periodType", "scripts/ingest_segments.py:165-169"),
    ("SEG_Q4_CARRIES_ANNUAL", "duração trimestre/ano no mesmo balde", "scripts/ingest_segments.py:72-78"),
    ("SEG_QSUM_MISMATCH", "factos casados só pela data de fim", "scripts/ingest_segments.py:96-104"),
    ("SEG_Q_GT_ANNUAL", "idem — sem discriminação de duração", "scripts/ingest_segments.py:96-104"),
    ("SEG_AXIS_MIX_GEO", "cego ao eixo: member.text sem @dimension", "scripts/ingest_segments.py:60-66"),
    ("SEG_AXIS_MIX_TIMING", "cego ao eixo ASC-606", "scripts/ingest_segments.py:60-66"),
    ("SEG_AXIS_MIX_CUSTOMER", "cego ao eixo de cliente", "scripts/ingest_segments.py:60-66"),
    ("SEG_SUM_MAJOR_OVER", "eixos empilhados / rollup", "scripts/ingest_segments.py:60-66"),
    ("SEG_SUM_AXIS_DOUBLE", "2 eixos empilhados", "scripts/ingest_segments.py:60-66"),
    ("SEG_SUM_AXIS_TRIPLE", "3 eixos empilhados", "scripts/ingest_segments.py:60-66"),
    ("SEG_SUM_EXPLOSIVE", "múltiplos eixos + totais", "scripts/ingest_segments.py:60-66"),
    ("SEG_SUM_SEVERE_UNDER", "5 tags hardcoded, faltam juros/prémios", "scripts/ingest_segments.py:89-95"),
    ("SEG_SUM_UNDER", "cobertura de tags insuficiente", "scripts/ingest_segments.py:89-95"),
    ("SEG_SUM_MINOR_OVER", "eliminações/excise não subtraídos (decisão de produto)", "DATA_DISCREPANCIES.md"),
    ("SEG_TOTAL_LABEL", ".replace('Segment','') mutila OperatingSegmentsMember", "scripts/build_segment_map.py:48-61"),
    ("SEG_GRAND_TOTAL_VALUE", "membro de consolidação tratado como segmento", "scripts/build_segment_map.py:104-111"),
    ("SEG_PARENT_ROLLUP", "sem hierarquia: pai e filhos no mesmo nível", "prisma/schema.prisma:98"),
    ("SEG_LABEL_CAMEL_ARTIFACT", "splitter camelCase por caractere, sem acrónimos", "scripts/build_segment_map.py:52-59"),
    ("SEG_LABEL_HTML_ENTITY", "falta html.unescape()", "scripts/build_segment_map.py:48-51"),
    ("SEG_LABEL_XBRL_RESIDUE", "stripping de sufixos incompleto", "scripts/build_segment_map.py:48-51"),
    ("SEG_LABEL_NON_REVENUE", "filas adjacentes da tabela raspadas como receita", "scripts/ingest_segments.py:96-104"),
    ("SEG_LABEL_COLLISION_SAME_ROW", "mapa estático sem registo canónico de rótulos", "scripts/segment_targets.py"),
    ("SEG_LABEL_COLLISION_DISJOINT", "idem — rótulos mudam entre filings", "scripts/segment_targets.py"),
    ("SEG_AXIS_SWITCH", "mapa gerado 2026-07-03, nunca regenerado", "scripts/segment_targets.py"),
    ("SEG_SERIES_HOLE", "eixo instável entre filings", "scripts/segment_targets.py"),
    ("SEG_VALUE_UNIT_SUSPECT", "unitRef/decimals/scale nunca lidos", "scripts/ingest_segments.py:96-104"),
    ("SEG_VALUE_SENTINEL", "sem magnitude guard (existe para fundamentais)", "scripts/ingest_fundamentals.py:745-757"),
    ("SEG_VALUE_EXCEEDS_REVENUE", "sem sanity bound na extração", "scripts/ingest_segments.py:96-104"),
    ("SEG_MISSING_PERIOD", "filings[:10] → ~2,5 anos, sem backfill", "scripts/ingest_segments.py:136"),
    ("SEG_STALE", "zero cobertura de cron", ".github/workflows/"),
    ("SEG_MISSING_ALL", "except Exception: preserved = {} apaga em silêncio", "scripts/ingest_fundamentals.py:2176-2178"),
]


# ═════════════════════════════════════════════════════════════════════════════
# main
# ═════════════════════════════════════════════════════════════════════════════

def main() -> None:
    ap = argparse.ArgumentParser(description="Gate de qualidade de revenueSegments (read-only).")
    ap.add_argument("--target", default=None, help="local | prod | <url>")
    ap.add_argument("--tickers", default=None)
    ap.add_argument("--rules", default=None)
    ap.add_argument("--severity", default=None)
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--report", default=None)
    ap.add_argument("--csv", default=None)
    ap.add_argument("--profile", action="store_true")
    ap.add_argument("--sdqi-append", action="store_true")
    ap.add_argument("--golden", action="store_true")
    ap.add_argument("--explain", default=None)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    url = args.target if (args.target and "://" in args.target) else _bootstrap_env()
    host = _host_of(url)
    print(f"A validar segmentos de receita contra {host} (read-only, só SELECT).")

    with open(LEXICON_PATH, encoding="utf-8") as f:
        lex = json.load(f)

    tickers = {t.strip().upper() for t in args.tickers.split(",")} if args.tickers else None
    by_ticker, held, mcap, last_update = load_data(url, tickers)

    all_rows = [r for rows in by_ticker.values() for r in rows]
    # Diagnóstico de frequência de valores. NÃO gera regra — ver o docstring de
    # value_frequency_report: a hipótese do "valor-sentinela fabricado" foi
    # testada e REJEITADA contra estes dados (os emitentes reportam em milhões
    # inteiros, logo valores pequenos colidem entre empresas por efeito de
    # aniversário, sem pico nenhum na distribuição).
    val_freq = C.value_frequency_report(all_rows)

    # Mediana de nº de chaves por setor, para o SEG_PEER_UNDERSEGMENTED.
    sector_keys: dict[str, list[int]] = defaultdict(list)
    for rows in by_ticker.values():
        for r in rows:
            if r.get("segs") and r["periodType"] == "ANNUAL":
                sector_keys[r["sector"] or "?"].append(len(r["segs"]))
    sector_median = {s: (sorted(v)[len(v) // 2] if v else None) for s, v in sector_keys.items()}

    if args.explain:
        do_explain(args.explain, by_ticker, lex)
        return

    if args.golden:
        sys.exit(do_golden(by_ticker, lex))

    findings: list[dict] = []
    feats: list[dict] = []
    latest_fy = max((r["fiscalYear"] for r in all_rows if r["fiscalYear"]), default=None)

    for ticker in sorted(by_ticker):
        rows = by_ticker[ticker]
        sec = next((r["sector"] for r in rows if r["sector"]), None)
        fs = run_company(ticker, rows, lex, sector_median.get(sec or "?"))
        findings.extend(fs)
        if args.profile or args.report or args.csv:
            feat = P.company_features(ticker, rows, fs, sector=sec,
                                      market_cap=mcap.get(ticker),
                                      is_held=ticker in held,
                                      chart_suppressed=C.chart_is_suppressed(rows))
            cohort, tags = P.assign_cohort(feat)
            feat["cohort"] = cohort
            feat["secondaryTags"] = ";".join(tags)
            feat.update(P.impact_score(feat, fs, latest_fy))
            feats.append(feat)

    # Filtros de apresentação (nunca alteram a baseline nem o gate).
    view = findings
    if args.rules:
        want = {r.strip() for r in args.rules.split(",")}
        view = [f for f in view if f["rule"] in want]
    if args.severity:
        want = {s.strip().upper() for s in args.severity.split(",")}
        view = [f for f in view if f["severity"] in want]

    n_rows_segs = sum(1 for r in all_rows if r.get("segs"))
    n_pairs = sum(len(r["segs"]) for r in all_rows if r.get("segs"))
    by_sev = Counter(f["severity"] for f in findings)
    print(f"\nEmpresas: {len(by_ticker)} | linhas com segmentos: {n_rows_segs} "
          f"| pares: {n_pairs} | achados: {len(findings)}")
    print("  " + " ".join(f"{s}={by_sev.get(s,0)}" for s in ("P0", "P1", "P2", "P3")))
    for rule, n in Counter(f["rule"] for f in findings).most_common(18):
        print(f"    {rule:<38} {n}")

    # ── SDQI ────────────────────────────────────────────────────────────────
    fbr: dict[str, list[dict]] = defaultdict(list)
    for f in findings:
        fbr[f"{f['ticker']}|{f['periodType']}|{f['periodEnd']}"].append(f)
    label_pairs = len({(f["ticker"], f["periodEnd"], f["segmentKey"]) for f in findings
                       if f["rule"].startswith("SEG_LABEL_") and f.get("segmentKey")})
    transitions = sum(max(0, len([r for r in rows
                                  if r["periodType"] == "ANNUAL" and r.get("segs")]) - 1)
                      for rows in by_ticker.values())
    bad_tr = len([f for f in findings if f["rule"] in ("SEG_AXIS_SWITCH", "SEG_SERIES_HOLE")])
    ann_active = sum(1 for r in all_rows if r["periodType"] == "ANNUAL")
    ann_2plus = sum(1 for r in all_rows
                    if r["periodType"] == "ANNUAL" and r.get("segs") and len(r["segs"]) >= 2)
    impact_by_row = None
    if feats:
        imp = {x["ticker"]: x.get("impactScore") or 0 for x in feats}
        impact_by_row = {k: imp.get(k.split("|")[0], 0) or 1.0 for k in fbr}

    sdqi = P.compute_sdqi(all_rows, fbr, n_pairs, label_pairs, transitions, bad_tr,
                          ann_active, ann_2plus, impact_by_row)
    print(f"\nSDQI = {sdqi['SDQI']} (R={sdqi['R']} S={sdqi['S']} L={sdqi['L']} "
          f"C={sdqi['C']} V={sdqi['V']})"
          + (f" | ponderado={sdqi['SDQI_weighted']}" if sdqi.get("SDQI_weighted") else ""))

    silh = {}
    if args.profile and feats:
        silh = P.silhouette_of_cohorts(feats)
        print("\nCoortes: " + ", ".join(f"{c}={n}" for c, n in
                                        Counter(x["cohort"] for x in feats).most_common()))
        if silh:
            weak = [c for c, s in silh.items() if s < 0.10]
            print(f"Silhouette: " + ", ".join(f"{c}={s}" for c, s in silh.items())
                  + (f"  ⚠️ fronteira fraca: {weak}" if weak else ""))

    meta = {"runAt": datetime.datetime.now().isoformat(timespec="seconds"),
            "dbHost": host, "nCompanies": len(by_ticker), "nRowsWithSegs": n_rows_segs,
            "nPairs": n_pairs,
            "nCompaniesWithSegs": len({r["ticker"] for r in all_rows if r.get("segs")}),
            "segmentTargetsSha256": _sha256(TARGETS_PATH),
            "lastDbUpdate": str(last_update)}

    # ── Artefactos ──────────────────────────────────────────────────────────
    os.makedirs(OUT_DIR, exist_ok=True)
    if args.csv:
        cols = ["key", "ticker", "periodType", "periodEnd", "fiscalYear", "fiscalQuarter",
                "rule", "severity", "segmentKey", "value", "revenue", "ratio",
                "chartVisible", "detail"]
        fmap = {x["ticker"]: x for x in feats}
        with open(args.csv, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(cols + ["cohort", "impactScore", "aiExposed", "dbHost"])
            for f in view:
                ft = fmap.get(f["ticker"], {})
                w.writerow([f.get(c) for c in cols]
                           + [ft.get("cohort"), ft.get("impactScore"),
                              ft.get("aiExposed"), host])
        print(f"CSV escrito: {args.csv} ({len(view)} linhas)")

        jpath = args.csv.rsplit(".", 1)[0] + ".json"
        with open(jpath, "w", encoding="utf-8") as fh:
            json.dump({"meta": meta, "sdqi": sdqi, "findings": view}, fh,
                      indent=1, ensure_ascii=False, default=str)
        print(f"JSON escrito: {jpath}")

    if feats:
        ppath = os.path.join(OUT_DIR, "segment_company_profile.csv")
        keys = ["ticker", "sector", "cohort", "secondaryTags", "impactScore", "severityMass",
                "audienceScore", "surfaceScore", "recencyScore", "chartVisible", "aiExposed",
                "nPeriods", "nPairs", "medianRatio", "madRatio", "slopeRatio", "minRatio",
                "maxRatio", "fracInBand", "fracQ4Clone", "fracTotalLabel", "fracGeoMix",
                "fracDirtyLabel", "keyCardinalityRatio", "nAxisSwitches", "axisSwitchRate",
                "nCollisionGroups",
                "nP0", "nP1", "nFindings", "isFxSuspect", "marketCap", "isHeld",
                "latestSegFiscalYear"]
        with open(ppath, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(keys)
            for x in sorted(feats, key=lambda y: -(y.get("impactScore") or 0)):
                w.writerow([x.get(k) for k in keys])
        print(f"Perfil por empresa: {ppath} ({len(feats)} empresas)")

    if args.report:
        write_report(args.report, meta, findings, feats, sdqi, silh, val_freq)

    if args.sdqi_append:
        hist = os.path.join(OUT_DIR, "segment_sdqi_history.csv")
        new = not os.path.exists(hist)
        with open(hist, "a", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            if new:
                w.writerow(["runAt", "dbHost", "segmentTargetsSha256", "nRows", "nPairs",
                            "SDQI", "SDQI_weighted", "R", "S", "L", "C", "V",
                            "nP0", "nP1", "nP2", "nP3"])
            w.writerow([meta["runAt"], host, (meta["segmentTargetsSha256"] or "")[:16],
                        n_rows_segs, n_pairs, sdqi["SDQI"], sdqi["SDQI_weighted"],
                        sdqi["R"], sdqi["S"], sdqi["L"], sdqi["C"], sdqi["V"],
                        by_sev.get("P0", 0), by_sev.get("P1", 0),
                        by_sev.get("P2", 0), by_sev.get("P3", 0)])
        print(f"SDQI acrescentado: {hist}")

    if args.json:
        print(json.dumps(view, indent=2, ensure_ascii=False, default=str))

    # ── Baseline e gate ─────────────────────────────────────────────────────
    baseline_path = os.path.join(OUT_DIR, f"segment_baseline.{_slug(host)}.json")
    keys_now = sorted({f["key"] for f in findings})

    # Uma chave tem de identificar UM achado. Se duas regras colidirem na mesma
    # chave, a baseline não as distingue e o gate deixa passar regressões — por
    # isso reporta-se em voz alta em vez de se assumir que não acontece.
    dupes = [k for k, n in Counter(f["key"] for f in findings).items() if n > 1]
    if dupes:
        print(f"\n⚠️  {len(dupes)} chaves de finding DUPLICADAS ({len(findings)} achados → "
              f"{len(keys_now)} chaves). A baseline não distingue achados que partilham "
              f"chave. Exemplos: {dupes[:3]}")

    if args.baseline:
        with open(baseline_path, "w", encoding="utf-8") as fh:
            json.dump({"dbHost": host, "keys": keys_now, "meta": meta,
                       "note": "qualidade de revenueSegments — congelado como baseline"},
                      fh, indent=1)
        print(f"\nBaseline gravada: {baseline_path} ({len(keys_now)} achados)")
        return

    baseline: set[str] = set()
    if os.path.exists(baseline_path):
        with open(baseline_path, encoding="utf-8") as fh:
            data = json.load(fh)
        if data.get("dbHost") and data["dbHost"] != host:
            sys.exit(f"ERRO: baseline é do host '{data['dbHost']}' mas a execução é contra "
                     f"'{host}'. Comparar hosts diferentes produz regressões fantasma.")
        baseline = set(data["keys"])
    else:
        print(f"\n(aviso: sem baseline para {host} — todos os achados contam como novos)")

    if os.path.exists(ACCEPTED_PATH):
        with open(ACCEPTED_PATH, encoding="utf-8") as fh:
            accepted = json.load(fh).get("accepted", [])
        baseline |= {a["key"] for a in accepted}
        print(f"(+{len(accepted)} exceções aceites com racional em segments_accepted.json)")

    # Contagens todas em CHAVES ÚNICAS — misturar contagem de achados com
    # contagem de chaves deduplicadas dava um "na baseline" negativo.
    new_keys = [k for k in keys_now if k not in baseline]
    new = [f for f in findings if f["key"] in set(new_keys)]
    new_p0 = [f for f in new if f["severity"] == "P0"]
    resolved = len([k for k in baseline if k not in set(keys_now)]) if baseline else 0
    print(f"\nChaves: {len(keys_now)} | na baseline/aceites: "
          f"{len(keys_now) - len(new_keys)} | NOVAS: {len(new_keys)} "
          f"(achados P0 novos: {len(new_p0)}) | resolvidas vs baseline: {resolved}")

    if new_p0:
        print(f"\n❌ {len(new_p0)} achados P0 NOVOS:")
        for f in new_p0[:40]:
            print(f"  {f['ticker']} {f['periodEnd']}: {f['rule']} — {f['detail'][:120]}")
        if len(new_p0) > 40:
            print(f"  ... (+{len(new_p0) - 40})")
        sys.exit(1)

    print("\n✓ Sem achados P0 novos.")


if __name__ == "__main__":
    main()
