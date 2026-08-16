"""
segment_checks.py — Biblioteca de REGRAS de qualidade para `fundamentals.revenueSegments`.

Funções PURAS: zero I/O, zero BD, zero rede, zero leitura de ficheiros. O léxico entra
como argumento. É deliberado — torna o modo `--golden` do validate_segments.py um teste
de regressão de funções puras, seguindo o precedente do check_repair_integrity.py.

Contrato de um finding (o chamador acrescenta ticker/período e monta a chave
`TICKER|PERIODTYPE|PERIODEND|RULE[|SEGMENT_KEY]`):

    {"rule": "SEG_...", "severity": "P0".."P3", "detail": "...",
     "segmentKey": str|None, "value": float|None, "ratio": float|None}

Severidades:
  P0 — a app afirma algo FALSO ao utilizador ou ao Gemini. Bloqueia o gate.
  P1 — materialmente errado mas invisível (gráfico suprimido) ou ambíguo.
  P2 — cosmético / rótulo / fragmentação. Determinístico, sem juízo financeiro.
  P3 — ausência e informativo. Nunca bloqueia.
"""

from __future__ import annotations

import html
import math
import re
import unicodedata
from collections import Counter, defaultdict

P0, P1, P2, P3 = "P0", "P1", "P2", "P3"

# ── Tolerâncias ──────────────────────────────────────────────────────────────
# BAND_TOL: uma tabela de desagregação de um 10-K fecha por construção. Os 2%
# absorvem apenas (i) emitentes cujo `revenue` vem de uma tag XBRL diferente da
# dos segmentos e (ii) arredondamento float64 vs Decimal(20,4). É generoso de
# propósito nesta fase 1; a fase 2 recalibra-o contra o percentil 99 do silver
# set (espera-se ~1,008, o que justificaria apertar para 1,01).
BAND_TOL = 0.02
# Igualdade "este valor É a receita total" — muito mais apertada que a banda.
EQ_TOL = 0.005
# Tolerância do subset-sum / rollup. 1% para não inventar subconjuntos.
SUBSET_TOL = 0.01
# Acima de quantas chaves a busca com poda desiste e passa a leave-k-out — e
# REPORTA que desistiu (ver SEG_SUBSET_SEARCH_TRUNCATED). Nunca finge cobertura.
EXHAUSTIVE_MAX_KEYS = 24

AXES = ("PRODUCT", "GEO", "TIMING", "CUSTOMER", "CONSOLIDATION", "TOTAL", "UNKNOWN")


# ═════════════════════════════════════════════════════════════════════════════
# Normalização de nomes
# ═════════════════════════════════════════════════════════════════════════════

def norm_key(name: str) -> str:
    """Nível 1-2: NFKC, unescape de entidades HTML, remoção de invisíveis,
    colapso de espaços, casefold. Preserva pontuação e ordem das palavras."""
    s = unicodedata.normalize("NFKC", name or "")
    s = html.unescape(s)
    s = re.sub(r"[ ​‌‍‎‏  ﻿]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.casefold()


def canon_key(name: str, stopwords: set[str]) -> str:
    """Nível 3-4: forma canónica para deteção de colisões — remove pontuação e
    stopwords, ordena os tokens. 'Europe, Middle East and North Africa' e
    'Europe, Middle East, And North Africa' colapsam no mesmo resultado."""
    s = norm_key(name)
    s = re.sub(r"[,.\-–—&/()\[\]:;'\"]", " ", s)
    toks = [t for t in s.split() if t and t not in stopwords]
    return " ".join(sorted(toks))


def _tokens(name: str) -> list[str]:
    s = re.sub(r"[,.\-–—&/()\[\]:;'\"]", " ", norm_key(name))
    return [t for t in s.split() if t]


def _has_word(name_norm: str, phrase: str) -> bool:
    """Casamento por FRONTEIRA DE PALAVRA, nunca substring. É o que impede
    'cAPACity' de casar com 'apac' — o bug exato do build_segment_map.py:104-111."""
    return re.search(r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])", name_norm) is not None


# ═════════════════════════════════════════════════════════════════════════════
# Classificação de eixo
# ═════════════════════════════════════════════════════════════════════════════

def classify_axis(name: str, lex: dict) -> str:
    """Devolve um dos AXES. Heurística de léxico — a fase 2 (SEC DERA) substitui
    isto por ground truth, porque o eixo é um atributo LITERAL no XML de origem
    (`explicitMember@dimension`) que o ingest_segments.py:66 deita fora."""
    n = norm_key(name)
    if not n:
        return "UNKNOWN"

    if _is_total_label(n, lex):
        return "TOTAL"

    # TIMING antes de tudo: 'principal'/'agent' só contam com 'transferred'.
    if _has_word(n, "transferred") or _has_word(n, "point in time") or _has_word(n, "over time"):
        return "TIMING"

    # GEO ANTES de CONSOLIDATION: 'All Other Countries' (uma das chaves
    # geográficas da UBER) contém 'all other', que é token de consolidação. A
    # regra de pureza distingue-os corretamente — 'All Other' sozinho não tem
    # token geográfico e continua CONSOLIDATION.
    if _is_pure_geo(n, lex):
        return "GEO"

    for t in lex.get("elimination_tokens", []):
        if _has_word(n, t):
            return "CONSOLIDATION"
    for t in lex.get("consolidation_tokens", []):
        if _has_word(n, t):
            return "CONSOLIDATION"

    for t in lex.get("customer_tokens", []):
        if _has_word(n, t):
            return "CUSTOMER"

    return "PRODUCT"


def _is_total_label(name_norm: str, lex: dict) -> bool:
    if name_norm in {norm_key(x) for x in lex.get("total_labels_exact", [])}:
        return True
    return any(re.match(r"^" + re.escape(norm_key(p)) + r"(?![a-z0-9])", name_norm)
               for p in lex.get("total_labels_prefix", []))


def _is_pure_geo(name_norm: str, lex: dict) -> bool:
    """GEO só quando, removido o filler, TODO o resto é geografia.

    Sem esta regra de pureza, 'International Site Leasing' (SBAC), 'Aflac Japan'
    (AFL) e 'United States Mechanical Construction And Facilities Services' (EME)
    — que são segmentos de NEGÓCIO reportáveis — seriam classificados como
    geografia, e o SEG_AXIS_MIX_GEO enchia-se de falsos positivos.
    """
    if not lex.get("geo_requires_purity", True):
        return any(_has_word(name_norm, t) for t in lex.get("geo_tokens", []))

    geo = [norm_key(t) for t in lex.get("geo_tokens", [])]
    filler = {norm_key(t) for t in lex.get("geo_filler", [])}

    # Consome primeiro os bigramas geográficos ('middle east', 'united states').
    residual = name_norm
    saw_geo = False
    for phrase in sorted((g for g in geo if " " in g), key=len, reverse=True):
        if _has_word(residual, phrase):
            residual = re.sub(r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])", " ", residual)
            saw_geo = True

    unigrams = {g for g in geo if " " not in g}
    for tok in _tokens(residual):
        if tok in unigrams:
            saw_geo = True
        elif tok not in filler:
            return False  # sobrou um token substantivo não-geográfico
    return saw_geo


# ═════════════════════════════════════════════════════════════════════════════
# Busca de subconjunto que reconcilia
# ═════════════════════════════════════════════════════════════════════════════

def find_reconciling_subset(items: list[tuple[str, float]], target: float,
                            tol: float = SUBSET_TOL, axis_of: dict | None = None):
    """Encontra o subconjunto de chaves cuja soma fecha com `target`.

    Devolve (subset_keys, status, method) onde status ∈
    {'unique', 'ambiguous', 'none', 'truncated'}.

    Estratégia por ordem de custo E de interpretabilidade:
      1. GRUPOS DE EIXO — se o eixo PRODUCT (ou outro) sozinho fecha com a
         receita, essa é a resposta certa e explicável: "o eixo de produto
         fecha; o geográfico e o total são extra". O(nº de eixos), não O(2^n).
      2. DFS com poda (branch-and-bound) até EXHAUSTIVE_MAX_KEYS chaves.
      3. Leave-k-out (k<=5) e devolve 'truncated' — nunca finge cobertura.
    """
    if target is None or target <= 0 or len(items) < 2:
        return None, "none", "n/a"

    lo, hi = target * (1 - tol), target * (1 + tol)

    # ── 1. Grupos de eixo ───────────────────────────────────────────────────
    if axis_of:
        hits = []
        by_axis: dict[str, list[str]] = defaultdict(list)
        for k, _ in items:
            by_axis[axis_of.get(k, "UNKNOWN")].append(k)
        vals = dict(items)
        for axis, keys in by_axis.items():
            if len(keys) < 2:
                continue
            if lo <= sum(vals[k] for k in keys) <= hi:
                hits.append(keys)
        if len(hits) == 1:
            return sorted(hits[0]), "unique", "axis-group"
        if len(hits) > 1:
            return sorted(max(hits, key=len)), "ambiguous", "axis-group"

    n = len(items)
    # ── 2. DFS com poda (branch-and-bound) ──────────────────────────────────
    # Enumerar 2^n cegamente é inviável: find_rollup_children corre uma vez por
    # CHAVE de cada linha, logo uma linha de 20 chaves custaria ~10M operações.
    # Com os valores ordenados por ordem decrescente e sufixos acumulados, a poda
    # corta o espaço em ordens de magnitude sobre dados reais.
    if n <= EXHAUSTIVE_MAX_KEYS:
        order = sorted(range(n), key=lambda i: -items[i][1])
        vals = [items[i][1] for i in order]
        suffix = [0.0] * (n + 1)
        for i in range(n - 1, -1, -1):
            suffix[i] = suffix[i + 1] + (vals[i] if vals[i] > 0 else 0.0)

        found: list[list[int]] = []

        def dfs(i: int, acc: float, chosen: list[int]) -> bool:
            """Devolve True para abortar (já há 2 soluções — basta p/ ambiguidade)."""
            if len(found) > 1:
                return True
            if acc > hi:
                return False                      # já passou o topo
            if acc + suffix[i] < lo:
                return False                      # nem somando tudo o que resta chega
            if i == n:
                if lo <= acc <= hi and len(chosen) >= 2:
                    found.append(list(chosen))
                return len(found) > 1
            chosen.append(order[i])
            if dfs(i + 1, acc + vals[i], chosen):
                return True
            chosen.pop()
            return dfs(i + 1, acc, chosen)

        dfs(0, 0.0, [])
        if len(found) == 1:
            return sorted(keys_at(items, found[0])), "unique", "dfs-pruned"
        if len(found) > 1:
            return None, "ambiguous", "dfs-pruned"
        return None, "none", "dfs-pruned"

    # ── 3. Leave-k-out, declaradamente parcial ──────────────────────────────
    from itertools import combinations
    keys = [k for k, _ in items]
    vals = [v for _, v in items]
    total = sum(vals)
    for k in range(1, 6):
        for drop in combinations(range(n), k):
            s = total - sum(vals[i] for i in drop)
            if lo <= s <= hi:
                keep = [keys[i] for i in range(n) if i not in drop]
                return sorted(keep), "truncated", f"leave-{k}-out"
    return None, "truncated", "leave-k-out-exhausted"


def keys_at(items: list[tuple[str, float]], idxs: list[int]) -> list[str]:
    return [items[i][0] for i in idxs]


def find_subsets_summing_to(items: list[tuple[str, float]], target: float,
                            tol: float, max_solutions: int = 12) -> list[list[str]]:
    """TODOS os subconjuntos (até max_solutions) cuja soma fecha com `target`.

    Existe porque exigir um subconjunto ÚNICO é o critério errado para detetar
    rollups: o 'Total Hardware' do CDW (15.219,1M) tem o conjunto verdadeiro de
    6 filhos MAIS outras combinações que caem na mesma janela — 17 chaves com
    valores na ordem dos milhares de milhões garantem-no. A busca devolvia
    'ambiguous' e a regra não disparava no caso mais óbvio do corpus.

    O discriminador correto não é a unicidade dentro da linha, é a PERSISTÊNCIA
    entre períodos (ver check_parent_rollups): o conjunto verdadeiro repete-se
    todos os trimestres porque é assim que a empresa estrutura a tabela; uma
    coincidência aritmética não sobrevive a três períodos com valores diferentes.
    """
    if target is None or target <= 0 or len(items) < 2:
        return []
    lo, hi = target * (1 - tol), target * (1 + tol)
    n = len(items)
    if n > EXHAUSTIVE_MAX_KEYS:
        return []

    order = sorted(range(n), key=lambda i: -items[i][1])
    vals = [items[i][1] for i in order]
    suffix = [0.0] * (n + 1)
    for i in range(n - 1, -1, -1):
        suffix[i] = suffix[i + 1] + max(vals[i], 0.0)

    found: list[list[str]] = []

    def dfs(i: int, acc: float, chosen: list[int]) -> None:
        if len(found) >= max_solutions or acc > hi or acc + suffix[i] < lo:
            return
        if i == n:
            if lo <= acc <= hi and len(chosen) >= 2:
                found.append(sorted(items[order[j]][0] for j in chosen))
            return
        chosen.append(i)
        dfs(i + 1, acc + vals[i], chosen)
        chosen.pop()
        dfs(i + 1, acc, chosen)

    dfs(0, 0.0, [])
    return found


def find_rollup_children(key: str, value: float, siblings: list[tuple[str, float]],
                         tol: float = SUBSET_TOL):
    """Chave cujo valor é a soma de >=2 dos próprios irmãos → rollup pai contado
    como par dos seus filhos (o 'Total Hardware' do CDW). Exige |S|>=2 para não
    disparar em dois irmãos que por acaso têm o mesmo valor.

    Pré-filtro barato antes da busca: um pai tem de ser maior que os seus filhos
    individuais e não pode exceder a soma de todos os irmãos. Sem isto, a busca
    corria para TODAS as chaves de TODAS as linhas — o gargalo original."""
    if value is None or value <= 0 or len(siblings) < 2:
        return None
    pos = [(k, v) for k, v in siblings if v is not None and v > 0]
    if len(pos) < 2:
        return None
    if value > sum(v for _, v in pos) * (1 + tol):
        return None                                    # maior que tudo o que resta
    if sum(1 for _, v in pos if v < value) < 2:
        return None                                    # não há 2 filhos menores
    sub, status, _ = find_reconciling_subset(pos, value, tol)
    return sub if status == "unique" and sub and len(sub) >= 2 else None


# ═════════════════════════════════════════════════════════════════════════════
# GRUPO A — reconciliação
# ═════════════════════════════════════════════════════════════════════════════

_BANDS = [
    (lambda r: r < 0,                       "SEG_SUM_NEGATIVE",      P0, "soma negativa"),
    (lambda r: 0 < r < 0.45,                "SEG_SUM_SEVERE_UNDER",  P0, "falta um fluxo de receita inteiro"),
    (lambda r: 0.45 <= r < 1 - BAND_TOL,    "SEG_SUM_UNDER",         P1, "extração parcial"),
    (lambda r: 1 + BAND_TOL < r <= 1.10,    "SEG_SUM_MINOR_OVER",    P1, "eliminações/impostos não subtraídos"),
    (lambda r: 1.10 < r < 1.90,             "SEG_SUM_MAJOR_OVER",    P0, "eixo parcial ou chave de rollup"),
    (lambda r: 1.90 <= r <= 2.10,           "SEG_SUM_AXIS_DOUBLE",   P0, "2 eixos empilhados"),
    (lambda r: 2.10 < r < 2.90,             "SEG_SUM_MAJOR_OVER",    P0, "eixo parcial ou chave de rollup"),
    (lambda r: 2.90 <= r <= 3.10,           "SEG_SUM_AXIS_TRIPLE",   P0, "3 eixos empilhados"),
    (lambda r: r > 3.10,                    "SEG_SUM_EXPLOSIVE",     P0, "múltiplos eixos e/ou totais"),
]


def check_reconciliation(segs: dict, revenue: float | None) -> list[dict]:
    """Teste de soma com classificação em bandas. Cada banda tem nome próprio de
    propósito: 1,02-1,10 e 1,10-1,90 são causas-raiz DIFERENTES com correções
    diferentes (subtrair um item reconciliador vs apagar uma chave). Fundi-las
    numa só regra 'a soma está errada' destruiria o cohorting."""
    out = []
    # >=1 chave, NÃO >=2: uma linha com UMA só chave a valer 4x a receita é
    # obviamente um defeito (TSCO Q4 FY2025: 'Reportable' = 15,5B numa linha de
    # 3,9B). Exigir 2 chaves saltava-a em silêncio. Não há contrapartida: uma
    # única chave IGUAL à receita dá rácio 1,0 e fica dentro da banda.
    if revenue is None or revenue <= 0 or len(segs) < 1:
        return out
    s = sum(segs.values())
    r = s / revenue
    for pred, rule, sev, why in _BANDS:
        if pred(r):
            out.append({"rule": rule, "severity": sev, "ratio": r, "value": s,
                        "detail": f"Σ segmentos {s:,.0f} vs receita {revenue:,.0f} = {r:.3f}x — {why}"})
            break

    # Múltiplo inteiro: nunca é economia, são k eixos cada um a somar o total.
    if r >= 1.90 and abs(r - round(r)) <= 0.04:
        out.append({"rule": "SEG_INTEGER_MULTIPLE", "severity": P0, "ratio": r,
                    "detail": f"soma é {round(r)}x exata da receita ({r:.3f}x) — "
                              f"{round(r)} eixos empilhados, não economia"})
    return out


def check_fx_suspect(segs: dict, revenue: float | None, fx_rates: dict | None) -> list[dict]:
    """Os nomes europeus tiveram `revenue` convertido para USD pela reparação de
    fundamentais, mas os segmentos vieram do XBRL cru em moeda nativa. Um rácio
    puramente cambial mascara-se de bug de estrutura — retaguar em vez de
    diagnosticar uma coorte inteira mal."""
    if not fx_rates or revenue is None or revenue <= 0 or not segs:
        return []
    r = sum(segs.values()) / revenue
    for cur, rate in fx_rates.items():
        if rate and rate > 0 and abs(r - (1 / rate)) / (1 / rate) <= 0.03:
            return [{"rule": "SEG_FX_SUSPECT", "severity": P2, "ratio": r,
                     "detail": f"rácio {r:.3f}x ≈ 1/taxa {cur}USD ({1/rate:.3f}) — "
                               f"provável mistura de moeda, não bug de estrutura"}]
    return []


# ═════════════════════════════════════════════════════════════════════════════
# GRUPO B — estrutura interna da linha
# ═════════════════════════════════════════════════════════════════════════════

def check_structure(segs: dict, revenue: float | None, lex: dict) -> list[dict]:
    out = []
    if not segs:
        return out
    items = sorted(segs.items())
    ratio = (sum(segs.values()) / revenue) if (revenue and revenue > 0) else None
    over = ratio is not None and ratio > 1 + BAND_TOL
    axis_of = {k: classify_axis(k, lex) for k in segs}

    for k, v in items:
        n = norm_key(k)

        # Valor que É a receita total, disfarçado de segmento.
        if revenue and revenue > 0 and v is not None and abs(v - revenue) <= EQ_TOL * revenue:
            out.append({"rule": "SEG_GRAND_TOTAL_VALUE", "severity": P0 if len(segs) >= 3 else P1,
                        "segmentKey": k, "value": v,
                        "detail": f"'{k}' = {v:,.0f} = a receita total — é o total, não um segmento"})

        # Rótulo de total. P1 sozinho, P0 quando co-ocorre com excesso de soma.
        if _is_total_label(n, lex):
            out.append({"rule": "SEG_TOTAL_LABEL", "severity": P0 if over else P1,
                        "segmentKey": k, "value": v,
                        "detail": f"'{k}' é um rótulo de TOTAL/subtotal"
                                  + (f" e a soma excede a receita ({ratio:.3f}x)" if over else "")})

        # Linha de eliminações positiva num período com excesso.
        if over and v is not None and v > 0 and any(
                _has_word(n, t) for t in lex.get("elimination_tokens", [])):
            out.append({"rule": "SEG_ELIMINATION_KEY_PRESENT", "severity": P1,
                        "segmentKey": k, "value": v,
                        "detail": f"'{k}' é linha de eliminações com valor POSITIVO {v:,.0f} "
                                  f"e a soma excede a receita ({ratio:.3f}x)"})

    # NOTA: o SEG_PARENT_ROLLUP NÃO vive aqui. Ver check_parent_rollups(), que é
    # ao nível da EMPRESA — uma hierarquia é uma propriedade estrutural do reporte
    # e repete-se todos os períodos; uma soma coincidente não. Ao nível da linha a
    # regra produzia 3.145 falsos positivos (a 'Services' da AAPL a igualar
    # Mac+iPad, a 'Lupron' da ABBV a igualar Duodopa+Kaletra).

    # Subconjunto que reconcilia — a regra de maior valor do harness.
    if over or (ratio is not None and ratio < 1 - BAND_TOL):
        sub, status, method = find_reconciling_subset(items, revenue, axis_of=axis_of)
        if status == "unique" and sub:
            extra = [k for k in segs if k not in set(sub)]
            reasons = {k: axis_of[k] for k in extra}
            out.append({"rule": "SEG_RECONCILING_SUBSET", "severity": P0,
                        "detail": f"fecha com {len(sub)} chaves via {method} "
                                  f"[{', '.join(sub[:8])}{'…' if len(sub) > 8 else ''}]; "
                                  f"a REMOVER {len(extra)}: "
                                  + ", ".join(f"{k}({reasons[k]})" for k in extra[:8])})
        elif status == "ambiguous":
            out.append({"rule": "SEG_RECONCILING_SUBSET_AMBIGUOUS", "severity": P1,
                        "detail": f"mais que um subconjunto fecha com a receita via {method} — "
                                  f"não se nomeia culpado"})
        elif status == "truncated":
            out.append({"rule": "SEG_SUBSET_SEARCH_TRUNCATED", "severity": P3,
                        "detail": f"{len(segs)} chaves: busca parcial ({method}). "
                                  f"Cobertura desta linha NÃO é exaustiva."})
    return out


# 0,01%. Um rollup verdadeiro fecha EXATAMENTE (o 'Total Hardware' do CDW é
# 15.219,1M = Notebooks 5.089,9 + Desktops 1.111,2 + Other Hardware 2.575,4 +
# Netcomm 2.538,2 + Data Storage 2.133,8 + Collaboration 1.770,6, ao milhão).
# Com 0,2% cabiam VÁRIOS subconjuntos na janela, a busca devolvia "ambíguo" e a
# regra não disparava no caso mais óbvio do corpus.
ROLLUP_TOL = 0.0001
ROLLUP_MIN_PERIODS = 3    # tem de se repetir; uma coincidência não se repete
ROLLUP_MIN_FRAC = 0.5     # em >=50% dos períodos onde o pai aparece
ROLLUP_MIN_SHARE = 0.15   # um pai é substancial, não uma linha marginal


def check_parent_rollups(rows: list[dict], lex: dict) -> list[dict]:
    """Pai contado a par dos próprios filhos — ao nível da EMPRESA.

    ── Porque não é uma regra por linha ─────────────────────────────────────
    A primeira versão testava, em cada linha, se alguma chave igualava a soma de
    um subconjunto dos irmãos. Produziu 3.145 achados P0, quase todos falsos:
    com tolerância de 1% e 5-20 irmãos, existe quase sempre ALGUM par que soma
    ao valor de outra chave por puro efeito de aniversário. Exemplos reais que
    disparavam: AAPL 'Services' = Mac + iPad; AAPL 'Americas' = Europe + Japan +
    Rest of Asia Pacific (são todos PARES no eixo geográfico, não pai e filhos);
    ABBV 'Lupron' = Duodopa + Kaletra.

    O discriminador correto é a PERSISTÊNCIA: o 'Total Hardware' do CDW é a soma
    das suas linhas de hardware em todos os trimestres, porque é assim que a
    empresa estrutura a tabela. Uma coincidência aritmética não sobrevive a três
    períodos com valores diferentes. Somam-se ainda três guardas: tolerância
    apertada (0,2% em vez de 1%), quota mínima do pai (15%), e |filhos| >= 2.
    """
    out = []
    with_segs = [r for r in rows if r.get("segs")]
    if len(with_segs) < ROLLUP_MIN_PERIODS:
        return out

    seen: dict[tuple, list] = defaultdict(list)   # (pai, frozenset(filhos)) -> períodos
    appears: dict[str, int] = defaultdict(int)    # quantas vezes o pai aparece

    for r in with_segs:
        vals = {k: v for k, v in r["segs"].items() if v is not None and v > 0}
        total = sum(vals.values())
        if total <= 0 or len(vals) < 3:
            continue
        for k, v in vals.items():
            appears[k] += 1
            if v / total < ROLLUP_MIN_SHARE:
                continue
            sibs = [(a, b) for a, b in vals.items() if a != k and b > 0]
            if len(sibs) < 2 or v > sum(b for _, b in sibs) * (1 + ROLLUP_TOL):
                continue
            # TODOS os candidatos, não só o único: a persistência entre períodos
            # é que separa a hierarquia real da coincidência aritmética.
            for kids in find_subsets_summing_to(sibs, v, ROLLUP_TOL):
                seen[(k, frozenset(kids))].append(str(r["periodEnd"]))

    for (parent, kids), periods in sorted(seen.items(), key=lambda x: -len(x[1])):
        n = len(periods)
        if n < ROLLUP_MIN_PERIODS or n < ROLLUP_MIN_FRAC * appears[parent]:
            continue
        out.append({"rule": "SEG_PARENT_ROLLUP", "severity": P0, "segmentKey": parent,
                    "periodEnd": periods[-1],
                    "detail": f"'{parent}' = soma de {len(kids)} irmãos "
                              f"[{', '.join(sorted(kids)[:6])}"
                              f"{'…' if len(kids) > 6 else ''}] em {n}/{appears[parent]} "
                              f"períodos — hierarquia PERSISTENTE, pai a par dos filhos"})
    return out


# ═════════════════════════════════════════════════════════════════════════════
# GRUPO C — mistura de eixos
# ═════════════════════════════════════════════════════════════════════════════

def check_axis_mix(segs: dict, revenue: float | None, lex: dict) -> list[dict]:
    """Uma empresa que reporta SÓ geografia está correta. Só o EMPILHAMENTO é
    bug — daí a conjunção com o excesso de soma."""
    out = []
    if len(segs) < 2:
        return out
    axis_of = {k: classify_axis(k, lex) for k in segs}
    present = set(axis_of.values())
    ratio = (sum(segs.values()) / revenue) if (revenue and revenue > 0) else None
    over = ratio is not None and ratio > 1 + BAND_TOL

    def keys_of(a):
        return sorted(k for k, x in axis_of.items() if x == a)

    if over and "GEO" in present and "PRODUCT" in present:
        out.append({"rule": "SEG_AXIS_MIX_GEO", "severity": P0, "ratio": ratio,
                    "detail": f"eixo GEO [{', '.join(keys_of('GEO')[:5])}] empilhado com eixo "
                              f"PRODUCT [{', '.join(keys_of('PRODUCT')[:5])}] — soma {ratio:.3f}x"})

    # TIMING nunca deve coexistir com nada: duplica a receita na íntegra.
    if "TIMING" in present and present - {"TIMING"} - {"TOTAL", "CONSOLIDATION"}:
        out.append({"rule": "SEG_AXIS_MIX_TIMING", "severity": P0, "ratio": ratio,
                    "detail": f"eixo ASC-606 timing [{', '.join(keys_of('TIMING')[:5])}] "
                              f"coexiste com outros eixos — receita contada duas vezes"})

    if over and "CUSTOMER" in present and "PRODUCT" in present:
        out.append({"rule": "SEG_AXIS_MIX_CUSTOMER", "severity": P1, "ratio": ratio,
                    "detail": f"eixo CUSTOMER [{', '.join(keys_of('CUSTOMER')[:4])}] empilhado "
                              f"com eixo PRODUCT — soma {ratio:.3f}x"})

    n_unknown = sum(1 for a in axis_of.values() if a == "UNKNOWN")
    if n_unknown > len(segs) * 0.5:
        out.append({"rule": "SEG_AXIS_UNKNOWN_HEAVY", "severity": P3,
                    "detail": f"{n_unknown}/{len(segs)} chaves sem eixo classificável "
                              f"— métrica de cobertura do léxico"})
    return out


# ═════════════════════════════════════════════════════════════════════════════
# GRUPO E — rótulos
# ═════════════════════════════════════════════════════════════════════════════

def check_labels(segs: dict, lex: dict, chart_visible: bool = False) -> list[dict]:
    """Todas P2 por defeito, PROMOVIDAS a P1 quando o gráfico está visível —
    aí a legenda está no ecrã. Exceção: SEG_LABEL_NON_REVENUE é P0, porque não
    é um nome errado, é um VALOR errado."""
    out = []
    sev = P1 if chart_visible else P2
    ent = re.compile(lex.get("html_entity_pattern", ""))
    foot = re.compile(lex.get("footnote_pattern", ""))
    nonpr = re.compile(lex.get("nonprinting_pattern", ""))
    residue = [re.compile(p) for p in lex.get("xbrl_residue_patterns", [])]
    camel = [re.compile(p) for p in lex.get("camel_artifact_patterns", [])]

    for k, v in sorted(segs.items()):
        n = norm_key(k)

        # ── P0: não é receita, é uma linha de custo/ganho raspada da tabela ──
        hit = next((t for t in lex.get("non_revenue_decisive", []) if _has_word(n, t)), None)
        if hit:
            out.append({"rule": "SEG_LABEL_NON_REVENUE", "severity": P0, "segmentKey": k, "value": v,
                        "detail": f"'{k}' contém '{hit}' — é uma linha de CUSTO/DESPESA, não receita"})
        elif _tokens(n) and _tokens(n)[0] in {norm_key(x) for x in lex.get("non_revenue_prefix_decisive", [])}:
            out.append({"rule": "SEG_LABEL_NON_REVENUE", "severity": P0, "segmentKey": k, "value": v,
                        "detail": f"'{k}' começa por ganho/perda — não é receita"})
        elif any(_has_word(n, t) for t in lex.get("non_revenue_ambiguous", [])) \
                and not _has_word(n, "revenue") and not _has_word(n, "revenues"):
            out.append({"rule": "SEG_LABEL_NON_REVENUE_AMBIGUOUS", "severity": P1,
                        "segmentKey": k, "value": v,
                        "detail": f"'{k}' parece amortização sem menção a receita — verificar"})

        if ent.pattern and ent.search(k):
            out.append({"rule": "SEG_LABEL_HTML_ENTITY", "severity": sev, "segmentKey": k,
                        "detail": f"'{k}' tem entidade HTML literal — falta html.unescape()"})
        if any(p.search(k) for p in residue):
            out.append({"rule": "SEG_LABEL_XBRL_RESIDUE", "severity": sev, "segmentKey": k,
                        "detail": f"'{k}' tem resíduo do nome XBRL cru"})
        if k.rstrip().endswith(":"):
            out.append({"rule": "SEG_LABEL_TABLE_HEADER", "severity": sev, "segmentKey": k,
                        "detail": f"'{k}' termina em ':' — é cabeçalho de secção, não segmento"})
        if foot.pattern and foot.search(k.strip()):
            out.append({"rule": "SEG_LABEL_FOOTNOTE", "severity": sev, "segmentKey": k,
                        "detail": f"'{k}' tem marcador de nota de rodapé colado"})
        if any(p.search(k) for p in camel):
            out.append({"rule": "SEG_LABEL_CAMEL_ARTIFACT", "severity": sev, "segmentKey": k,
                        "detail": f"'{k}' — artefacto do splitter camelCase "
                                  f"(build_segment_map.py:52-59)"})
        if nonpr.pattern and nonpr.search(k):
            out.append({"rule": "SEG_LABEL_NONPRINTING", "severity": sev, "segmentKey": k,
                        "detail": f"'{k}' contém caractere invisível — fragmenta a série sem se ver"})
        elif k != k.strip() or "  " in k:
            out.append({"rule": "SEG_LABEL_WHITESPACE", "severity": P2, "segmentKey": k,
                        "detail": f"'{k}' tem espaços a mais/nas pontas"})
        if re.match(r"^sub-?total\b", n):
            out.append({"rule": "SEG_LABEL_SUBTOTAL_PREFIX", "severity": sev, "segmentKey": k,
                        "detail": f"'{k}' começa por 'subtotal'"})
    return out


def check_label_collisions(rows: list[dict], lex: dict) -> list[dict]:
    """Colisões de rótulo POR EMPRESA (nunca entre empresas).

    Distingue os dois casos, que têm gravidades muito diferentes:
      - as grafias CO-OCORREM na mesma linha → P0, é duplicação a somar duas vezes
      - ocupam períodos DISJUNTOS → P1, é uma série fraturada no gráfico
    """
    stop = {norm_key(w) for w in lex.get("collision_stopwords", [])}
    # canon_key é caro (NFKC + várias regex). Memoizar por chave distinta em vez
    # de a recalcular por grupo × linha × chave — era o gargalo original.
    canon_cache: dict[str, str] = {}

    def canon(k: str) -> str:
        c = canon_cache.get(k)
        if c is None:
            c = canon_cache[k] = canon_key(k, stop)
        return c

    groups: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    for row in rows:
        for k in (row.get("segs") or {}):
            groups[canon(k)][k].add(row["periodEnd"])

    # Conjuntos canónicos que aparecem MAIS QUE UMA VEZ na mesma linha — uma
    # passagem só, em vez de uma varredura por grupo.
    multi_in_row: set[str] = set()
    for row in rows:
        seen = Counter(canon(k) for k in (row.get("segs") or {}))
        multi_in_row |= {c for c, n in seen.items() if n > 1}

    out = []
    for canon_form, variants in groups.items():
        if len(variants) < 2:
            continue
        same_row = canon_form in multi_in_row
        names = sorted(variants)
        # A forma canónica vai no segmentKey: estas regras disparam VÁRIAS vezes
        # por empresa (uma por grupo de colisão) e sem discriminador todas
        # colapsavam na mesma chave de finding, tornando a baseline incapaz de as
        # distinguir e a aritmética do gate inconsistente.
        if same_row:
            out.append({"rule": "SEG_LABEL_COLLISION_SAME_ROW", "severity": P0,
                        "segmentKey": canon_form,
                        "detail": f"{len(names)} grafias do MESMO segmento na mesma linha "
                                  f"[{' | '.join(names)}] — soma duas vezes"})
        else:
            out.append({"rule": "SEG_LABEL_COLLISION_DISJOINT", "severity": P1,
                        "segmentKey": canon_form,
                        "detail": f"{len(names)} grafias do mesmo segmento em períodos "
                                  f"disjuntos [{' | '.join(names)}] — série fraturada"})
    return out


# ═════════════════════════════════════════════════════════════════════════════
# GRUPO G — valores
# ═════════════════════════════════════════════════════════════════════════════

def check_values(segs: dict, revenue: float | None) -> list[dict]:
    out = []
    for k, v in sorted(segs.items()):
        if v is None:
            out.append({"rule": "SEG_VALUE_NULL", "severity": P2, "segmentKey": k,
                        "detail": f"'{k}' tem valor nulo"})
            continue
        if revenue and revenue > 0 and v > revenue * 1.02:
            out.append({"rule": "SEG_VALUE_EXCEEDS_REVENUE", "severity": P0, "segmentKey": k,
                        "value": v, "ratio": v / revenue,
                        "detail": f"'{k}' = {v:,.0f} excede a receita total {revenue:,.0f} "
                                  f"({v/revenue:.2f}x)"})
        if v < 0:
            out.append({"rule": "SEG_VALUE_NEGATIVE", "severity": P1, "segmentKey": k, "value": v,
                        "detail": f"'{k}' = {v:,.0f} negativo — renderiza como barra invertida"})
        if v == 0:
            out.append({"rule": "SEG_VALUE_ZERO", "severity": P2, "segmentKey": k, "value": v,
                        "detail": f"'{k}' = 0"})
        if revenue and revenue > 1e9 and 0 < v < 1e5:
            out.append({"rule": "SEG_VALUE_UNIT_SUSPECT", "severity": P0, "segmentKey": k, "value": v,
                        "detail": f"'{k}' = {v:,.0f} é minúsculo face a receita {revenue:,.0f} "
                                  f"— suspeita de escala (milhares vs unidades)"})
    return out


def value_frequency_report(all_rows: list[dict], top: int = 15) -> list[tuple[float, int]]:
    """Frequência de valores EXATOS entre empresas distintas — diagnóstico, NÃO regra.

    ── Porque não existe um SEG_VALUE_SENTINEL ──────────────────────────────
    A hipótese testada foi: "um valor exato repetido em >=10 empresas não
    relacionadas não é economia, é um sentinela fabricado" — motivada pela
    observação de que 303 dos valores negativos eram exatamente -1.000.000.

    A hipótese foi REJEITADA contra os dados (2026-08-03). A distribuição de
    "nº de empresas por valor" é lisa, sem pico nenhum: 24.885 valores em 1
    empresa, 2.803 em 2, ... 85 em 10, 44 em 16. E os valores mais partilhados
    são 3.000.000 (43 empresas), 5.000.000 (42), 1.000.000 (41), 18.000.000 (40).
    A causa é trivial: os emitentes reportam segmentos em MILHÕES INTEIROS, logo
    valores pequenos colidem entre empresas por puro efeito de aniversário. Os
    "303 × -1.000.000" são arredondamento de contra-receita pequena à unidade de
    reporte, não fabricação.

    Implementar a regra produziria centenas de falsos positivos P0 com uma
    justificação de aparência rigorosa — exatamente o modo de falha que se quer
    evitar. Fica a função de diagnóstico, para o relatório poder mostrar a
    distribuição e justificar a ausência da regra.
    """
    by_val: dict[float, set] = defaultdict(set)
    for row in all_rows:
        for v in (row.get("segs") or {}).values():
            if v is not None and v != 0:
                by_val[v].add(row["ticker"])
    return sorted(((v, len(t)) for v, t in by_val.items()), key=lambda x: -x[1])[:top]


# ═════════════════════════════════════════════════════════════════════════════
# GRUPO D — período / duração
# ═════════════════════════════════════════════════════════════════════════════

def check_period_duplication(rows: list[dict]) -> list[dict]:
    """SEG_Q4_CLONE_OF_ANNUAL — impressão digital exata do `periodType` em falta
    no UPDATE do ingest_segments.py:165-169. Valores float64 idênticos em duas
    linhas não são coincidência: é o mesmo JSON escrito nas duas."""
    out = []
    by_pe: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        if r.get("segs"):
            by_pe[str(r["periodEnd"])][r["periodType"]] = r

    for pe, byt in by_pe.items():
        ann, qtr = byt.get("ANNUAL"), byt.get("QUARTERLY")
        if not ann or not qtr:
            continue
        a, q = ann["segs"], qtr["segs"]
        if set(a) != set(q) or not a:
            continue
        same = sum(1 for k in a
                   if a[k] is not None and q.get(k) is not None
                   and (a[k] == q[k] or abs(a[k] - q[k]) <= 0.001 * max(abs(a[k]), 1)))
        if same >= 0.8 * len(a):
            out.append({"rule": "SEG_Q4_CLONE_OF_ANNUAL", "severity": P0, "periodEnd": pe,
                        "detail": f"periodEnd {pe}: as linhas ANNUAL e QUARTERLY têm o MESMO "
                                  f"dict de segmentos ({same}/{len(a)} chaves idênticas) — "
                                  f"o UPDATE não filtra por periodType"})
    return out


def check_q4_carries_annual(rows: list[dict]) -> list[dict]:
    """Q4 cuja soma de segmentos fecha com a receita ANUAL do mesmo ano fiscal."""
    out = []
    ann_rev = {r["fiscalYear"]: r.get("revenue") for r in rows if r["periodType"] == "ANNUAL"}
    for r in rows:
        if r["periodType"] != "QUARTERLY" or r.get("fiscalQuarter") != 4 or not r.get("segs"):
            continue
        rev, ar = r.get("revenue"), ann_rev.get(r["fiscalYear"])
        if not rev or rev <= 0 or not ar or ar <= 0:
            continue
        s = sum(r["segs"].values())
        if s / rev >= 1.5 and abs(s - ar) <= 0.05 * ar:
            out.append({"rule": "SEG_Q4_CARRIES_ANNUAL", "severity": P0,
                        "periodEnd": str(r["periodEnd"]), "ratio": s / rev,
                        "detail": f"Q4 FY{r['fiscalYear']}: Σ {s:,.0f} = {s/rev:.2f}x a receita "
                                  f"do trimestre mas fecha com a receita ANUAL {ar:,.0f}"})
    return out


def check_quarter_sum(rows: list[dict], tol: float = 0.03) -> list[dict]:
    """Σ dos 4 trimestres vs a anual, por chave. Tolerância 3% porque os
    emitentes reafectam segmentos a meio do ano e os calendários 52/53 semanas
    deixam um período stub."""
    out = []
    annuals = {r["fiscalYear"]: r for r in rows if r["periodType"] == "ANNUAL" and r.get("segs")}
    q_by_fy: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        if r["periodType"] == "QUARTERLY" and r.get("segs"):
            q_by_fy[r["fiscalYear"]].append(r)

    for fy, ann in annuals.items():
        qs = q_by_fy.get(fy, [])
        if len({q.get("fiscalQuarter") for q in qs}) != 4:
            continue
        for k, av in ann["segs"].items():
            if av is None or av == 0:
                continue
            qv = [q["segs"].get(k) for q in qs]
            if any(x is None for x in qv):
                continue
            s = sum(qv)
            if abs(s - av) > tol * abs(av):
                out.append({"rule": "SEG_QSUM_MISMATCH", "severity": P1, "segmentKey": k,
                            "periodEnd": str(ann["periodEnd"]),
                            "detail": f"FY{fy} '{k}': Σ trimestres {s:,.0f} vs anual {av:,.0f} "
                                      f"({s/av:.3f}x)"})
            for q in qs:
                v = q["segs"].get(k)
                if v is not None and av > 0 and v > av * 1.02:
                    out.append({"rule": "SEG_Q_GT_ANNUAL", "severity": P0, "segmentKey": k,
                                "periodEnd": str(q["periodEnd"]),
                                "detail": f"FY{fy}Q{q.get('fiscalQuarter')} '{k}' = {v:,.0f} "
                                          f"excede o valor ANUAL {av:,.0f}"})
    return out


# ═════════════════════════════════════════════════════════════════════════════
# GRUPO F — continuidade entre períodos
# ═════════════════════════════════════════════════════════════════════════════

def check_continuity(rows: list[dict], lex: dict) -> list[dict]:
    """Só séries ANUAIS — a sazonalidade trimestral afogava estes sinais."""
    out = []
    ann = sorted((r for r in rows if r["periodType"] == "ANNUAL" and r.get("segs")),
                 key=lambda r: r["periodEnd"])
    if len(ann) < 2:
        return out

    # Jaccard sobre a forma CANÓNICA, não sobre o rótulo cru. Sem isto, uma
    # empresa que só mudou a grafia de dois segmentos ('Apparel and accessories'
    # → 'Apparel And Accessories') contava como troca de EIXO, misturando duas
    # classes de defeito com correções completamente diferentes. O churn de
    # rótulos tem regra própria (SEG_LABEL_COLLISION_*).
    stop = {norm_key(w) for w in lex.get("collision_stopwords", [])}
    ccache: dict[str, str] = {}

    def ck(k: str) -> str:
        c = ccache.get(k)
        if c is None:
            c = ccache[k] = canon_key(k, stop)
        return c

    def cmap(row: dict) -> dict[str, str]:
        """canónica -> rótulo cru (o último vence; colisões têm regra própria)."""
        return {ck(k): k for k in row["segs"]}

    for prev, cur in zip(ann, ann[1:]):
        pm, cm = cmap(prev), cmap(cur)
        a, b = set(pm), set(cm)
        if len(a) < 2 or len(b) < 2:
            continue
        jac = len(a & b) / len(a | b) if (a | b) else 1.0
        # 0,34: um rename normal toca 1 de 3-5 rótulos → Jaccard 0,6-0,8; uma
        # troca completa de eixo partilha ~0.
        if jac < 0.34:
            out.append({"rule": "SEG_AXIS_SWITCH", "severity": P1,
                        "periodEnd": str(cur["periodEnd"]),
                        "detail": f"FY{prev['fiscalYear']}→FY{cur['fiscalYear']}: Jaccard "
                                  f"{jac:.2f} — o eixo mudou. Saíram [{', '.join(sorted(a-b)[:4])}], "
                                  f"entraram [{', '.join(sorted(b-a)[:4])}]"})

        # Salto de quota, condicionado a variação de receita <30% (a condição é o
        # que impede uma aquisição genuína de disparar).
        pr, cr = prev.get("revenue"), cur.get("revenue")
        if pr and cr and pr > 0 and cr > 0 and abs(cr - pr) / pr < 0.30:
            ps = sum(v for v in prev["segs"].values() if v is not None)
            cs = sum(v for v in cur["segs"].values() if v is not None)
            if ps > 0 and cs > 0:
                for canon_form in a & b:
                    pk, ckey = pm[canon_form], cm[canon_form]
                    pv_, cv_ = prev["segs"].get(pk), cur["segs"].get(ckey)
                    if pv_ is None or cv_ is None:
                        continue
                    d = cv_ / cs - pv_ / ps
                    if abs(d) > 0.20:
                        out.append({"rule": "SEG_SHARE_JUMP", "severity": P1, "segmentKey": ckey,
                                    "periodEnd": str(cur["periodEnd"]),
                                    "detail": f"'{ckey}': quota saltou {d:+.0%} de FY"
                                              f"{prev['fiscalYear']} para FY{cur['fiscalYear']} "
                                              f"com receita quase igual"})

    # Buraco na série: presente antes e depois, ausente no meio, com peso >=5%.
    for i in range(1, len(ann) - 1):
        pv, cu, nx = ann[i - 1], ann[i], ann[i + 1]
        cs_p = sum(v for v in pv["segs"].values() if v is not None)
        cs_n = sum(v for v in nx["segs"].values() if v is not None)
        pmap, nmap, cset = cmap(pv), cmap(nx), {ck(x) for x in cu["segs"]}
        for canon_form in (set(pmap) & set(nmap)) - cset:
            k = nmap[canon_form]
            sp = (pv["segs"].get(pmap[canon_form]) or 0) / cs_p if cs_p else 0
            sn = (nx["segs"].get(k) or 0) / cs_n if cs_n else 0
            if sp >= 0.05 and sn >= 0.05:
                out.append({"rule": "SEG_SERIES_HOLE", "severity": P1, "segmentKey": k,
                            "periodEnd": str(cu["periodEnd"]),
                            "detail": f"'{k}' existe em FY{pv['fiscalYear']} ({sp:.0%}) e "
                                      f"FY{nx['fiscalYear']} ({sn:.0%}) mas falta em "
                                      f"FY{cu['fiscalYear']} — buraco no gráfico"})
    return out


# ═════════════════════════════════════════════════════════════════════════════
# GRUPO H — cobertura
# ═════════════════════════════════════════════════════════════════════════════

def check_coverage(rows: list[dict], sector_median_keys: float | None = None) -> list[dict]:
    out = []
    with_segs = [r for r in rows if r.get("segs")]
    if rows and not with_segs:
        out.append({"rule": "SEG_MISSING_ALL", "severity": P3,
                    "detail": f"{len(rows)} períodos de fundamentais e ZERO segmentos"})
        return out

    for r in with_segs:
        # periodType explícito: a TSCO tem linha ANNUAL E QUARTERLY no MESMO
        # periodEnd (2025-12-27), ambas com uma só chave. Sem o periodType as
        # duas colapsavam na mesma chave de finding.
        if len(r["segs"]) == 1:
            out.append({"rule": "SEG_SINGLE_KEY", "severity": P2,
                        "periodType": r["periodType"], "periodEnd": str(r["periodEnd"]),
                        "detail": f"um único segmento ('{next(iter(r['segs']))}') — "
                                  f"barra empilhada de uma fatia"})
        if r.get("revenue") is None or r.get("revenue") == 0:
            out.append({"rule": "SEG_ORPHAN_ROW", "severity": P2,
                        "periodType": r["periodType"], "periodEnd": str(r["periodEnd"]),
                        "detail": "segmentos presentes mas receita nula — linha NÃO validável "
                                  "por nenhuma regra do grupo A"})

    ann = [r for r in rows if r["periodType"] == "ANNUAL"]
    ann_segs = [r for r in ann if r.get("segs")]
    if ann and ann_segs:
        latest = max(r["fiscalYear"] for r in ann)
        latest_seg = max(r["fiscalYear"] for r in ann_segs)
        if latest - latest_seg >= 2:
            out.append({"rule": "SEG_STALE", "severity": P1,
                        "detail": f"última anual com segmentos é FY{latest_seg} mas há "
                                  f"fundamentais até FY{latest} — {latest-latest_seg} anos atrás"})

    null_years = sorted(r["fiscalYear"] for r in ann if not r.get("segs"))
    if null_years and ann_segs:
        seg_years = {r["fiscalYear"] for r in ann_segs}
        head = [y for y in null_years if y > max(seg_years)]
        tail = [y for y in null_years if y < min(seg_years)]
        if head or tail:
            where = "recentes (staleness — zero cron)" if head else "antigos (backfill — filings[:10])"
            out.append({"rule": "SEG_MISSING_PERIOD", "severity": P2,
                        "detail": f"{len(head or tail)} anos sem segmentos, {where}: "
                                  f"{(head or tail)[:8]}"})

    if sector_median_keys and ann_segs:
        med = sorted(len(r["segs"]) for r in ann_segs)[len(ann_segs) // 2]
        if med < sector_median_keys / 2:
            out.append({"rule": "SEG_PEER_UNDERSEGMENTED", "severity": P2,
                        "detail": f"mediana de {med} segmentos vs {sector_median_keys:.1f} "
                                  f"do setor — provável extração parcial"})
    return out


def check_key_cardinality(rows: list[dict]) -> list[dict]:
    with_segs = [r for r in rows if r.get("segs")]
    if not with_segs:
        return []
    distinct = len({k for r in with_segs for k in r["segs"]})
    med = sorted(len(r["segs"]) for r in with_segs)[len(with_segs) // 2]
    if distinct > 12 and med and distinct > med * 2:
        return [{"rule": "SEG_KEY_CARDINALITY", "severity": P2,
                 "detail": f"{distinct} rótulos distintos na história mas mediana de {med} por "
                           f"período — sintoma agregado de colisões e instabilidade de eixo"}]
    return []


# ═════════════════════════════════════════════════════════════════════════════
# Guard de apresentação — reimplementa StockAnalyst.tsx:174-195
# ═════════════════════════════════════════════════════════════════════════════

def chart_is_suppressed(rows: list[dict]) -> bool:
    """Réplica EXATA do guard do componente, para o harness saber quais empresas
    estão silenciosamente erradas NO ECRÃ vs já escondidas. Não é duplicação
    gratuita: é a diferença entre um defeito visível e um defeito latente, e
    entra na fórmula de impacto."""
    ann = [r for r in rows if r["periodType"] == "ANNUAL" and r.get("segs")]
    if not ann:
        return False
    overlap = 0
    for r in ann:
        rev = r.get("revenue")
        if not rev or rev <= 0:
            continue
        if sum(v for v in r["segs"].values() if v is not None) > rev * 1.1:
            overlap += 1
    return overlap >= math.ceil(len(ann) / 2)
