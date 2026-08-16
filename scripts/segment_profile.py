"""
segment_profile.py — Camada ESTATÍSTICA e de TRIAGEM sobre os achados de segmentos.

Funções puras (sem I/O). Transforma "7 mil achados espalhados" em:
  1. um vetor de features por empresa,
  2. uma COORTE primária por empresa (~9 grupos, cada um = uma correção de raiz),
  3. um score de IMPACTO para ordenar o ataque,
  4. o SDQI, um score 0-100 rastreável ao longo do tempo.

A ideia central da coorte: um rácio de 1,06x CONSTANTE é uma diferença
CONTABILÍSTICA (decisão de produto: mostramos bruto ou líquido de eliminações?);
um rácio a oscilar entre 1,0 e 10,5 é um BUG DE ENGENHARIA. Precisam de pessoas
diferentes para resolver, e nenhuma regra determinística os distingue — só a
dispersão. É por isso que a estatística aqui não é decoração.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict

SEVERITY_WEIGHT = {"P0": 5.0, "P1": 2.0, "P2": 0.5, "P3": 0.1}

# Coortes por LISTA DE DECISÃO (primeira correspondência ganha), não k-means.
# Os IDs de cluster do k-means são instáveis entre execuções — o que mata a
# comparabilidade semana a semana, que é um requisito explícito — e "coorte 4"
# não é acionável. O k-means serve, uma vez e offline, para VALIDAR que estas
# fronteiras são separáveis (silhouette < 0,1 numa coorte = fronteira mal
# desenhada). É esse o papel correto do não-supervisionado aqui: auditar a
# taxonomia, não produzi-la.
COHORTS = (
    "NO_COVERAGE", "Q4_CONTAMINATED", "AXIS_STACKED", "TOTAL_ROW_INJECTED",
    "BANK_PARTIAL", "ELIMINATION_GROSS", "ERRATIC_EXTRACTION", "AXIS_UNSTABLE",
    "LABEL_CHURN", "CLEAN",
)

COHORT_ROOT_CAUSE = {
    "NO_COVERAGE": "sem cron (.github/workflows/) e filings[:10] em ingest_segments.py:136",
    "Q4_CONTAMINATED": "UPDATE sem periodType — ingest_segments.py:165-169",
    "AXIS_STACKED": "cego ao eixo: member.text sem @dimension — ingest_segments.py:60-66",
    "TOTAL_ROW_INJECTED": ".replace('Segment','') — build_segment_map.py:48-61",
    "BANK_PARTIAL": "5 tags hardcoded, faltam juros/prémios — ingest_segments.py:89-95",
    "ELIMINATION_GROSS": "DECISÃO DE PRODUTO (bruto vs líquido), não bug — DATA_DISCREPANCIES.md",
    "ERRATIC_EXTRACTION": "duração+eixo instáveis por filing — ingest_segments.py:72-78",
    "AXIS_UNSTABLE": "segment_targets.py estático, gerado 2026-07-03 e nunca regenerado",
    "LABEL_CHURN": "clean_segment_name sem unescape/acrónimos — build_segment_map.py:48-61",
    "CLEAN": "—",
}


# ═════════════════════════════════════════════════════════════════════════════
# Estatística robusta
# ═════════════════════════════════════════════════════════════════════════════

def _median(xs: list[float]) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def _mad(xs: list[float]) -> float | None:
    """Desvio absoluto mediano — robusto a outliers, ao contrário do desvio
    padrão, que uma única linha a 15x destruiria."""
    m = _median(xs)
    if m is None:
        return None
    return _median([abs(x - m) for x in xs])


def _theil_sen(pts: list[tuple[float, float]]) -> float | None:
    """Declive de Theil-Sen: mediana dos declives entre todos os pares. Robusto,
    e com n=8-10 pontos anuais é o único estimador de tendência defensável."""
    if len(pts) < 3:
        return None
    slopes = [(y2 - y1) / (x2 - x1)
              for (x1, y1), (x2, y2) in ((a, b) for i, a in enumerate(pts) for b in pts[i + 1:])
              if x2 != x1]
    return _median(slopes)


# ═════════════════════════════════════════════════════════════════════════════
# Features por empresa
# ═════════════════════════════════════════════════════════════════════════════

def company_features(ticker: str, rows: list[dict], findings: list[dict],
                     sector: str | None = None, market_cap: float | None = None,
                     is_held: bool = False, chart_suppressed: bool = False) -> dict:
    """~18 dimensões por empresa. `rows` são as linhas de fundamentais (com
    `segs` e `revenue`); `findings` são os achados já produzidos para ela."""
    with_segs = [r for r in rows if r.get("segs")]
    ratios, ratio_pts = [], []
    for r in with_segs:
        rev = r.get("revenue")
        if rev and rev > 0:
            rr = sum(v for v in r["segs"].values() if v is not None) / rev
            ratios.append(rr)
            if r["periodType"] == "ANNUAL":
                ratio_pts.append((float(r["fiscalYear"]), rr))

    n_rows = len(with_segs)
    by_rule = Counter(f["rule"] for f in findings)
    rows_with_rule = lambda rule: len({f.get("periodEnd") for f in findings if f["rule"] == rule})

    q4_rows = [r for r in with_segs
               if r["periodType"] == "QUARTERLY" and r.get("fiscalQuarter") == 4]
    n_annual_transitions = max(0, len([r for r in with_segs
                                       if r["periodType"] == "ANNUAL"]) - 1)
    distinct_keys = len({k for r in with_segs for k in r["segs"]})
    med_keys = _median([len(r["segs"]) for r in with_segs]) or 0
    n_pairs = sum(len(r["segs"]) for r in with_segs)
    dirty = sum(1 for f in findings if f["rule"].startswith("SEG_LABEL_")
                and f["rule"] not in ("SEG_LABEL_COLLISION_SAME_ROW",
                                      "SEG_LABEL_COLLISION_DISJOINT"))

    return {
        "ticker": ticker,
        "sector": sector,
        "nPeriods": n_rows,
        "nPairs": n_pairs,
        "medianRatio": _median(ratios),
        "madRatio": _mad(ratios),
        "slopeRatio": _theil_sen(sorted(ratio_pts)),
        "minRatio": min(ratios) if ratios else None,
        "maxRatio": max(ratios) if ratios else None,
        "fracInBand": (sum(1 for x in ratios if 0.98 <= x <= 1.02) / len(ratios)) if ratios else None,
        "fracQ4Clone": (rows_with_rule("SEG_Q4_CLONE_OF_ANNUAL") / len(q4_rows)) if q4_rows else 0.0,
        "fracTotalLabel": (rows_with_rule("SEG_TOTAL_LABEL") / n_rows) if n_rows else 0.0,
        "fracGeoMix": (rows_with_rule("SEG_AXIS_MIX_GEO") / n_rows) if n_rows else 0.0,
        "fracDirtyLabel": (dirty / n_pairs) if n_pairs else 0.0,
        "keyCardinalityRatio": (distinct_keys / med_keys) if med_keys else None,
        "nAxisSwitches": by_rule.get("SEG_AXIS_SWITCH", 0),
        # TAXA, não contagem. Uma empresa que trocou de eixo UMA vez em 10 anos
        # reorganizou-se — é legítimo e comum. Uma que troca em >=30% das
        # transições ano-a-ano tem um extrator instável. Usar a contagem crua
        # punha 204 das 529 empresas (39%) na coorte AXIS_UNSTABLE, o que não é
        # um item de trabalho acionável.
        "axisSwitchRate": (by_rule.get("SEG_AXIS_SWITCH", 0) / n_annual_transitions
                           if n_annual_transitions else 0.0),
        "nCollisionGroups": (by_rule.get("SEG_LABEL_COLLISION_SAME_ROW", 0)
                             + by_rule.get("SEG_LABEL_COLLISION_DISJOINT", 0)),
        "nP0": sum(1 for f in findings if f["severity"] == "P0"),
        "nP1": sum(1 for f in findings if f["severity"] == "P1"),
        "nFindings": len(findings),
        "isFxSuspect": by_rule.get("SEG_FX_SUSPECT", 0) > 0,
        "marketCap": market_cap,
        "isHeld": is_held,
        "chartSuppressed": chart_suppressed,
        "latestSegFiscalYear": max((r["fiscalYear"] for r in with_segs), default=None),
    }


# ═════════════════════════════════════════════════════════════════════════════
# Coortes
# ═════════════════════════════════════════════════════════════════════════════

def assign_cohort(f: dict) -> tuple[str, list[str]]:
    """Devolve (coorte primária, tags secundárias). Primeira correspondência
    ganha; as tags secundárias registam tudo o mais que disparou, para não se
    perder informação ao colapsar numa coorte só."""
    med, mad = f.get("medianRatio"), f.get("madRatio")
    tags = []

    if f.get("fracQ4Clone", 0) > 0.2:
        tags.append("Q4_CONTAMINATED")
    if med is not None and (med > 1.5 or f.get("fracGeoMix", 0) > 0.3):
        tags.append("AXIS_STACKED")
    if f.get("fracTotalLabel", 0) > 0.3:
        tags.append("TOTAL_ROW_INJECTED")
    if med is not None and mad is not None and med < 0.90 and mad < 0.05:
        tags.append("BANK_PARTIAL")
    if med is not None and mad is not None and 1.02 < med <= 1.35 and mad < 0.03:
        tags.append("ELIMINATION_GROSS")
    if mad is not None and mad >= 0.10:
        tags.append("ERRATIC_EXTRACTION")
    if f.get("axisSwitchRate", 0) >= 0.30 and f.get("nAxisSwitches", 0) >= 2:
        tags.append("AXIS_UNSTABLE")
    if f.get("nCollisionGroups", 0) >= 2 or f.get("fracDirtyLabel", 0) > 0.1:
        tags.append("LABEL_CHURN")

    if not f.get("nPeriods"):
        return "NO_COVERAGE", []
    for c in COHORTS:
        if c in tags:
            return c, [t for t in tags if t != c]
    return "CLEAN", []


# ═════════════════════════════════════════════════════════════════════════════
# Impacto
# ═════════════════════════════════════════════════════════════════════════════

def impact_score(f: dict, findings: list[dict], latest_fy: int | None = None) -> dict:
    """impacto = severityMass × audienceScore × surfaceScore × recencyScore

    `surfaceScore` conta o gráfico suprimido como MENOS grave mas nunca inócuo,
    porque o lib/ai/context.ts:83-93 injeta os mesmos segmentos no prompt do
    Gemini rotulados `verificado`, SEM guard nenhum. Uma empresa escondida do
    gráfico continua exposta à IA — é por isso que ainda pontua.
    """
    severity_mass = sum(SEVERITY_WEIGHT.get(x["severity"], 0.1) for x in findings)

    mc = f.get("marketCap") or 0
    audience = 1.0 + (2.0 if f.get("isHeld") else 0.0) + math.log10(1 + mc / 1e9)

    chart_visible = not f.get("chartSuppressed", False)
    ai_exposed = f.get("latestSegFiscalYear") is not None
    surface = 0.5 + (0.5 if chart_visible else 0.0) + (0.5 if ai_exposed else 0.0) + 0.25

    recent = False
    if latest_fy is not None:
        for x in findings:
            pe = str(x.get("periodEnd") or "")
            if pe[:4].isdigit() and int(pe[:4]) >= latest_fy - 1:
                recent = True
                break
    recency = 1.0 + (1.5 if recent else 0.0)

    return {
        "severityMass": round(severity_mass, 2),
        "audienceScore": round(audience, 3),
        "surfaceScore": round(surface, 3),
        "recencyScore": recency,
        "chartVisible": chart_visible,
        "aiExposed": ai_exposed,
        "impactScore": round(severity_mass * audience * surface * recency, 2),
    }


# ═════════════════════════════════════════════════════════════════════════════
# SDQI
# ═════════════════════════════════════════════════════════════════════════════

def compute_sdqi(rows: list[dict], findings_by_row: dict, n_pairs: int,
                 label_finding_pairs: int, transitions: int, bad_transitions: int,
                 annual_rows_active: int, annual_rows_with_2plus: int,
                 impact_by_row: dict | None = None) -> dict:
    """SDQI = 0,30·R + 0,30·S + 0,15·L + 0,10·C + 0,15·V

    Reconciliação (R) e estrutura (S) dominam porque são as duas que fazem a app
    AFIRMAR ALGO FALSO. Cobertura (V) leva 0,15 — um gráfico ausente é honesto,
    só incompleto. Rótulos (L) 0,15 — visível mas não enganador. Continuidade
    (C) 0,10 — o mais subtil, e em parte legítimo (as empresas reorganizam-se).

    Devolve também o SDQI PONDERADO POR IMPACTO: sem ele, alguém "melhora" o
    número limpando 95 empresas que ninguém abre.
    """
    with_segs = [r for r in rows if r.get("segs")]
    scoreable = [r for r in with_segs if r.get("revenue") and r["revenue"] > 0]

    in_band = sum(1 for r in scoreable
                  if 0.98 <= sum(v for v in r["segs"].values() if v is not None) / r["revenue"] <= 1.02)
    R = 100.0 * in_band / len(scoreable) if scoreable else 0.0

    structural = {"SEG_GRAND_TOTAL_VALUE", "SEG_TOTAL_LABEL", "SEG_PARENT_ROLLUP",
                  "SEG_RECONCILING_SUBSET", "SEG_AXIS_MIX_GEO", "SEG_AXIS_MIX_TIMING",
                  "SEG_LABEL_NON_REVENUE", "SEG_VALUE_EXCEEDS_REVENUE",
                  "SEG_Q4_CLONE_OF_ANNUAL", "SEG_Q4_CARRIES_ANNUAL"}
    clean_rows = sum(1 for r in with_segs
                     if not any(x["severity"] == "P0" and x["rule"] in structural
                                for x in findings_by_row.get(_row_key(r), [])))
    S = 100.0 * clean_rows / len(with_segs) if with_segs else 0.0

    L = 100.0 * (n_pairs - label_finding_pairs) / n_pairs if n_pairs else 0.0
    C = 100.0 * (transitions - bad_transitions) / transitions if transitions else 100.0
    V = 100.0 * annual_rows_with_2plus / annual_rows_active if annual_rows_active else 0.0

    sdqi = 0.30 * R + 0.30 * S + 0.15 * L + 0.10 * C + 0.15 * V

    weighted = None
    if impact_by_row:
        tw = sum(impact_by_row.values())
        if tw > 0:
            good = sum(w for k, w in impact_by_row.items()
                       if not any(x["severity"] == "P0" for x in findings_by_row.get(k, [])))
            weighted = round(100.0 * good / tw, 2)

    return {"SDQI": round(sdqi, 2), "SDQI_weighted": weighted,
            "R": round(R, 2), "S": round(S, 2), "L": round(L, 2),
            "C": round(C, 2), "V": round(V, 2),
            "_denominators": {"scoreableRows": len(scoreable), "rowsWithSegs": len(with_segs),
                              "pairs": n_pairs, "transitions": transitions,
                              "annualRowsActive": annual_rows_active}}


def _row_key(r: dict) -> str:
    return f"{r['ticker']}|{r['periodType']}|{r['periodEnd']}"


# ═════════════════════════════════════════════════════════════════════════════
# Validação da taxonomia (o papel correto do não-supervisionado)
# ═════════════════════════════════════════════════════════════════════════════

def silhouette_of_cohorts(feats: list[dict]) -> dict:
    """Silhouette das coortes definidas à mão, no espaço de features normalizado.
    NÃO atribui coortes — audita se as fronteiras escolhidas são separáveis.

    ── Como LER o resultado (importa, senão leva a otimizar o número errado) ──
    O silhouette mede separação GEOMÉTRICA. Uma coorte definida como uma BANDA
    INTERMÉDIA de uma dimensão ordenada — é o caso do ELIMINATION_GROSS, que
    ocupa 1,02 < mediana <= 1,35, entre o CLEAN (~1,0) e o AXIS_STACKED (>1,5) —
    tem silhouette negativo POR CONSTRUÇÃO, porque cada ponto tem vizinhos mais
    próximos nas bandas adjacentes. Isso não significa que a fronteira esteja
    errada: significa que a distinção é contabilística, não geométrica.

    O silhouette é acionável para coortes que deveriam formar um GRUPO ISOLADO
    (Q4_CONTAMINATED, BANK_PARTIAL, TOTAL_ROW_INJECTED, LABEL_CHURN). Aí, um
    valor < 0,10 é sinal genuíno de fronteira mal desenhada.
    """
    dims = ["medianRatio", "madRatio", "fracQ4Clone", "fracTotalLabel",
            "fracGeoMix", "fracDirtyLabel", "axisSwitchRate", "nCollisionGroups"]
    pts, labels = [], []
    for f in feats:
        if f.get("cohort") in (None, "NO_COVERAGE"):
            continue
        pts.append([float(f.get(d) or 0) for d in dims])
        labels.append(f["cohort"])
    if len(set(labels)) < 2 or len(pts) < 4:
        return {}

    lo = [min(p[i] for p in pts) for i in range(len(dims))]
    hi = [max(p[i] for p in pts) for i in range(len(dims))]
    span = [(h - l) or 1.0 for l, h in zip(lo, hi)]
    z = [[(p[i] - lo[i]) / span[i] for i in range(len(dims))] for p in pts]

    def dist(a, b):
        return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

    by_lab: dict[str, list[int]] = defaultdict(list)
    for i, lab in enumerate(labels):
        by_lab[lab].append(i)

    per_cohort: dict[str, list[float]] = defaultdict(list)
    for i, lab in enumerate(labels):
        same = [j for j in by_lab[lab] if j != i]
        if not same:
            continue
        a = sum(dist(z[i], z[j]) for j in same) / len(same)
        b = min(sum(dist(z[i], z[j]) for j in idx) / len(idx)
                for other, idx in by_lab.items() if other != lab and idx)
        if max(a, b) > 0:
            per_cohort[lab].append((b - a) / max(a, b))
    return {lab: round(sum(v) / len(v), 3) for lab, v in per_cohort.items() if v}
