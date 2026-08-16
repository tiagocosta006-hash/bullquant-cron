"""
ingest_segments_xbrl.py — Extração de revenueSegments via XBRL dimensional (edgartools)

Substitui o parsing manual de ingest_segments.py. Diferenças de raiz:

1. EIXO EXPLÍCITO. O parser antigo olhava só para o TEXTO do membro e ignorava o
   atributo @dimension, pelo que misturava partições independentes. A AAPL, por
   exemplo, publica TRÊS partições que reconciliam a 100% cada uma (produto,
   segmento operacional, geografia); somadas dão ~3x a receita. Aqui cada eixo é
   extraído em separado e validado contra o total não-dimensionado.

2. MEMBROS-FOLHA VIA DOMÍNIO. O domínio do eixo (ex. srt_ProductsAndServicesDomain)
   lista as folhas da partição e EXCLUI os pais/rollup — na AAPL lista
   iPhone/Mac/iPad/Wearables/Service mas não "Products", que é a soma dos quatro
   primeiros. O domínio é preferência, não filtro rígido: o JPM declara
   CCB/CIB/AWM e omite o Corporate, pelo que a partição do domínio não fecha.

3. SEM TAGS HARDCODED. O conceito de receita é descoberto por eixo, não adivinhado
   numa lista de 5 tags — o JPM reporta segmentos em RevenuesNetOfInterestExpense,
   que não estava na lista antiga (daí os bancos virem truncados).

4. PERÍODO PELA DURAÇÃO REAL, não por igualdade de string de data, e o UPDATE
   filtra por periodType — senão a linha ANNUAL e a Q4 com o mesmo periodEnd
   recebiam ambas o valor anual.

Escreve DUAS colunas:
  - revenueSegments      : partição principal, mapa plano (shape antiga, intacta
                           para validate_segments.py e para o frontend existente)
  - revenueSegmentsByAxis: {"segment": {...}, "product": {...}, "geography": {...}}
                           com todas as partições que reconciliam, para desenhar
                           um gráfico por eixo.

NOTA sobre Q4: não existe 10-Q do quarto trimestre, logo não há facto XBRL com
duração trimestral para Q4. Este script não inventa esse valor — deixa-o vazio.
"""

import os
import re as _re
import sys
import time
import json
import bisect as _bisect
import argparse
import datetime as _dt
from collections import defaultdict

import psycopg2
from dotenv import load_dotenv

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENV_FILE = os.path.join(ROOT, ".env.dev")
if os.path.exists(ENV_FILE):
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

IDENTITY = os.getenv("SEC_IDENTITY", "Tiago Costa costa@engimov.pt")

import edgar  # noqa: E402  (set_identity tem de correr antes de qualquer fetch)
edgar.set_identity(IDENTITY)


def purge_edgar_cache_if_big(limit_gb: float) -> bool:
    """Esvazia a cache HTTP do edgartools se passar de `limit_gb`.

    O edgartools guarda tudo o que descarrega em ~/.edgar/_tcache e nunca limpa.
    Numa passagem por 527 empresas chegou a 22 GB e encheu o disco a meio — e a
    falha apareceu como "sem filings", ou seja, buracos silenciosos em vez de um
    erro. A cache é só um espelho de sec.gov: apagá-la custa re-descarregar.
    """
    import shutil
    from pathlib import Path
    from edgar.httpclient import get_cache_directory
    try:
        cache = get_cache_directory()
        total = sum(f.stat().st_size for f in Path(cache).rglob("*") if f.is_file())
        if total > limit_gb * 1024 ** 3:
            shutil.rmtree(cache, ignore_errors=True)
            print(f"    (cache do edgar tinha {total/1024**3:.1f} GB — limpa)", flush=True)
            return True
    except Exception as e:
        print(f"    (aviso: não consegui medir/limpar a cache: {e!r})", flush=True)
    return False

# Nome lógico -> colunas dimensionais candidatas, por ordem de preferência.
# Os emitentes ESTRANGEIROS entregam 20-F em IFRS e usam a taxonomia ifrs-full,
# não a us-gaap: a SAP publica ifrs-full_SegmentsAxis. Sem estas entradas, 23 das
# 43 empresas sem segmentos eram estrangeiras (AZN, BP, SAP, SHEL, UBS, NVS...)
# e falhavam por o eixo simplesmente não ser procurado.
# ⚠️ NÃO acrescentar dim_us-gaap_ProductOrServiceAxis nem
# dim_us-gaap_StatementGeographicalAxis aqui. A tentação é óbvia — a SEC moveu
# estes eixos de `us-gaap` para `srt` por volta de 2018, e parece que se ganha
# o histórico anterior. Testado a 2026-08-16: não se ganha, estraga.
#   · A Chipotle declara us-gaap:ProductOrServiceAxis em 2016/2017, mas o único
#     membro é NonChipotleRestaurantsMember com NumberOfRestaurants=23 — não há
#     receita nenhuma lá. Os anos vazios no gráfico são ausência real de
#     divulgação (a repartição só começa com a adoção do ASC 606 em 2018).
#   · Em contrapartida a KKR 2017/2019 passou a apanhar uma repartição por tipo
#     de comissão que soma 43% da receita: reconcilia contra o subtotal de
#     comissões e não contra o total, logo passa o guard e grava uma partição
#     falsa onde antes não havia nenhuma.
AXES = {
    "segment": ("dim_us-gaap_StatementBusinessSegmentsAxis",
                "dim_ifrs-full_SegmentsAxis",
                "dim_ifrs-full_OperatingSegmentsAxis"),
    "product": ("dim_srt_ProductOrServiceAxis",
                "dim_ifrs-full_ProductsAndServicesAxis"),
    "geography": ("dim_srt_StatementGeographicalAxis",
                  "dim_ifrs-full_GeographicalAreasAxis"),
}

# Eixos de consolidação: distinguem segmentos operacionais de eliminações
# intersegmento e da reconciliação com o consolidado.
CONSOLIDATION_AXES = ("dim_srt_ConsolidationItemsAxis",
                      "dim_ifrs-full_SegmentConsolidationItemsAxis")
OPERATING_MEMBER = "us-gaap:OperatingSegmentsMember"

# Conceitos aceites como TOTAL consolidado (denominador da reconciliação).
# Lista estrita de propósito: um match por substring apanhava
# PaymentsToAcquireAvailableForSaleSecurities ("...ForSale|Sec..." contém
# "sales") e punha 309 mil M de fluxos de caixa como se fosse receita do JPM.
TOTAL_REVENUE_CONCEPTS = {
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "RevenuesNetOfInterestExpense",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "SalesRevenueServicesNet",
    "RevenuesExcludingInterestAndDividends",
    # IFRS (emitentes estrangeiros em 20-F)
    "Revenue",
    "RevenueFromContractsWithCustomers",
    "RevenueFromSaleOfGoods",
    "RevenueFromRenderingOfServices",
}

# Ordena candidatos a receita por segmento (não é allowlist — ver _is_revenue_concept).
REVENUE_HINTS = (
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "RevenuesNetOfInterestExpense",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "SalesRevenueServicesNet",
)

# Prefixos de conceitos que NUNCA são receita, mesmo contendo "revenue"/"sales"
# (fluxos de caixa, valorizações, rubricas de balanço).
_NON_REVENUE_PREFIXES = (
    "PaymentsTo", "PaymentsFor", "ProceedsFrom", "IncreaseDecrease",
    "FairValue", "DeferredRevenue", "ContractWithCustomerLiability",
    "ContractWithCustomerAsset", "AccountsReceivable",
    "CostOf",  # CostOfRevenue contém "revenue" e passava o teste
)

# Tokens que denunciam um conceito IFRS que NÃO é receita externa comparável,
# mesmo tendo "revenue" no nome — apanhados na BP e na Novartis, cujo eixo de
# segmento reportava o dobro/1,3x a receita consolidada:
#   bp:RevenueAndOtherOperatingIncomeGross — "Gross" + inclui outro rendimento
#     operacional, não é receita pura, e é ANTES da eliminação intersegmento.
#   bp:RevenueAndOtherOperatingIncomeIntersegment — a própria eliminação.
#   nvs:RevenueFromSaleOfGoodsSalesToOtherSegments — vendas intersegmento; por
#     definição não entra numa reconciliação com a receita externa consolidada.
# Isto é o mesmo padrão já coberto por _NON_REVENUE_PREFIXES, só que a marca
# vem a meio do nome do conceito (Gross/Intersegment), não no prefixo.
_NON_REVENUE_TOKENS = ("gross", "intersegment", "toothersegments")

# Rótulos que denunciam uma linha de custo/despesa. A Autodesk reutiliza o mesmo
# membro para a receita e para o respetivo custo, e o terseLabel do linkbase vem
# na versão de custo ("Cost of subscription and maintenance revenue") — o VALOR
# está certo, o rótulo é que engana.
_COST_LABEL_TOKENS = ("cost of", "cost and expense", "expense")

# Tokens que denunciam um eixo geográfico disfarçado de segmento operacional.
# A Apple reporta os segmentos ASC 280 por região, pelo que o eixo "segment"
# traz Americas/Europe/Greater China — nesse caso o eixo de produto é mais
# informativo e passa a ser a partição principal.
_GEO_TOKENS = (
    "america", "europe", "china", "japan", "asia", "pacific", "emea", "apac",
    "united states", "u.s.", "us ", "international", "domestic", "foreign",
    "north", "south", "east", "west", "germany", "france", "canada", "mexico",
    "brazil", "india", "korea", "africa", "middle east", "latin", "emerging",
    "rest of world", "row", "overseas", "country", "countries", "region",
)

RECONCILE_TOL = 0.02  # ±2%, igual ao componente R do SDQI em validate_segments.py

_TERSE = "http://www.xbrl.org/2003/role/terseLabel"
_PLAIN = "http://www.xbrl.org/2003/role/label"


def _norm(mid) -> str:
    """Normaliza ids de membro: us-gaap_FooMember == us-gaap:FooMember.

    Só o PRIMEIRO underscore é separador de namespace — há membros com
    underscores no nome (aapl_A0.000Notesdue2025Member).
    """
    if mid is None or not isinstance(mid, str):
        return ""
    s = mid.strip()
    if ":" in s:
        return s
    return s.replace("_", ":", 1)


def _is_total_revenue_concept(concept: str) -> bool:
    return concept.split(":")[-1] in TOTAL_REVENUE_CONCEPTS


def _is_revenue_concept(concept: str) -> bool:
    """Candidato a receita POR SEGMENTO (mais lato que o total, porque emitentes
    usam conceitos próprios — o JPM segmenta em RevenuesNetOfInterestExpense)."""
    c = concept.split(":")[-1]
    if c.startswith(_NON_REVENUE_PREFIXES):
        return False
    cl = c.lower()
    if any(tok in cl for tok in _NON_REVENUE_TOKENS):
        return False
    return "revenue" in cl or cl.startswith("sales") or "netsales" in cl


def _concept_rank(concept: str) -> int:
    c = concept.split(":")[-1]
    for i, h in enumerate(REVENUE_HINTS):
        if c == h:
            return i
    return len(REVENUE_HINTS)


def _total_concepts_from_calculation(xbrl):
    """Conceitos de receita total declarados pela própria empresa.

    O calculation linkbase da demonstração de resultados diz que conceito entra
    no cálculo do resultado — é a fonte autoritária para o total DAQUELA empresa,
    em vez de uma lista global adivinhada. Usa-se só como recurso quando nenhum
    conceito de TOTAL_REVENUE_CONCEPTS aparece sem dimensões (empresas de
    sectores que usam conceitos próprios).

    Nota: o calculation linkbase relaciona CONCEITOS, não membros dimensionais —
    não serve para detetar membros rollup (Products ⊃ iPhone). Para isso é o
    domínio do eixo que manda, ver _candidate_partitions.
    """
    out = set()
    for role, tree in (getattr(xbrl, "calculation_trees", None) or {}).items():
        rl = role.lower()
        if not any(w in rl for w in ("statementsofoperations", "incomestatement",
                                     "statementsofincome", "statementofoperations")):
            continue
        for nid, node in (getattr(tree, "all_nodes", None) or {}).items():
            # Só filhos diretos de um total (parent != None) que sejam receita.
            n = nid.split("_", 1)[-1]
            nl = n.lower()
            if "cost" in nl or "deferred" in nl or "expense" in nl:
                continue
            if "revenue" in nl or nl.startswith("sales"):
                if getattr(node, "weight", 1.0) and float(getattr(node, "weight", 1.0)) > 0:
                    out.add(_norm(nid))
    return out


def _member_label(xbrl, member_id: str) -> str:
    """Rótulo humano de um membro, tirado do label linkbase do próprio filing.

    Não se usa a coluna `dimension_member_label` do dataframe porque, quando um
    facto tem dois eixos (segmento + consolidação), ela traz o rótulo do eixo
    errado — no JPM os três segmentos vinham todos como "Operating Segments".
    """
    key = (member_id or "").replace(":", "_", 1)
    el = (xbrl.element_catalog or {}).get(key)
    labels = getattr(el, "labels", None) or {}
    for role in (_TERSE, _PLAIN):
        lab = labels.get(role)
        if not lab:
            continue
        lab = lab.replace("[Member]", "").replace("[Domain]", "").strip()
        # Não aceitar um rótulo de custo para uma fatia de RECEITA.
        if any(t in lab.lower() for t in _COST_LABEL_TOKENS):
            continue
        return lab
    # Sem linkbase: separar camelCase por palavras (o parser antigo separava
    # caractere a caractere e transformava "USA" em "U S A").
    name = (member_id or "").split(":")[-1]
    name = _re.sub(r"Member$|Segment$|SegmentMember$", "", name)
    return _re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name).strip() or name


def _looks_geographic(labels) -> bool:
    """True se a maioria dos rótulos da partição forem lugares."""
    if not labels:
        return False
    hits = sum(1 for l in labels if any(t in l.lower() for t in _GEO_TOKENS))
    return hits >= max(2, (len(labels) + 1) // 2)


def _candidate_partitions(vals, allowed, total):
    """Gera partições candidatas por ordem de preferência.

    `vals` é {label: (valor, member_id)}. O domínio do XBRL costuma listar as
    folhas certas, mas nem sempre está completo — o JPM declara CCB/CIB/AWM e
    omite o Corporate, pelo que a partição do domínio fica a faltar uma fatia.
    Por isso o domínio é PREFERÊNCIA: se não reconciliar, tenta-se o conjunto
    completo e o conjunto sem membros-total/rollup.
    """
    plain = {k: v[0] for k, v in vals.items()}

    cands = []
    if allowed:
        dom = {k: v[0] for k, v in vals.items() if v[1] in allowed}
        if len(dom) >= 2:
            cands.append(dom)
    if len(plain) >= 2:
        cands.append(plain)
        s_all = sum(plain.values())
        # Membro-rollup: o seu valor iguala a soma dos restantes (ex.: "Products"
        # ao lado de iPhone/Mac/iPad/Wearables) — mantê-lo duplicaria tudo.
        rollups = {
            k for k, v in plain.items()
            if total > 0 and abs(v - (s_all - v)) / total <= RECONCILE_TOL
        }
        if rollups:
            trimmed = {k: v for k, v in plain.items() if k not in rollups}
            if len(trimmed) >= 2:
                cands.append(trimmed)
        # Membro que sozinho é o total consolidado.
        totals = {k for k, v in plain.items() if total > 0 and abs(v - total) / total <= RECONCILE_TOL}
        if totals:
            trimmed = {k: v for k, v in plain.items() if k not in totals}
            if len(trimmed) >= 2:
                cands.append(trimmed)
    return cands


def _axis_row_variants(grp, axis_col, dim_cols):
    """Gera as FATIAS candidatas do eixo, da mais agregada à mais específica.

    O mesmo eixo costuma vir repetido em várias fatias qualificadas por OUTRO
    eixo, e só uma delas é a repartição da receita consolidada:

      UNH — os quatro segmentos aparecem TRÊS vezes, distinguidos por
      srt:MajorCustomersAxis: ExternalCustomers (443,6 mM, a que queremos),
      Intersegment, e sem qualificador (621,0 mM, que inclui o intersegmento).

      NFLX — as regiões vêm qualificadas por ProductOrService=Streaming, e a
      fatia sem qualificador tem só uma linha country:US, que não serve.

    Colapsar isto por "fica o maior valor de cada membro" misturava fatias e não
    reconciliava nunca. Devolve-se cada fatia coerente em separado e é a
    reconciliação com o total que decide qual vale.
    """
    others = [c for c in dim_cols if c != axis_col and c not in CONSOLIDATION_AXES]
    base = grp[grp[axis_col].notna()]
    for cons_col in CONSOLIDATION_AXES:
        if cons_col in base.columns:
            cons = base[cons_col]
            # Aceita sem qualificador ou explicitamente "segmentos operacionais";
            # exclui eliminações intersegmento e itens de reconciliação.
            base = base[cons.isna()
                        | (cons.map(_norm) == _norm(OPERATING_MEMBER))
                        | cons.map(lambda v: "OperatingSegments" in str(v))]
    if len(base) == 0:
        return
    if not others:
        yield base
        return

    # 1) fatia sem qualquer outro eixo preenchido — o caso simples e mais comum.
    strict = base[base[others].isna().all(axis=1)]
    if len(strict):
        yield strict

    # 2) fixar UM outro eixo num valor e exigir os restantes vazios.
    for c in others:
        for v in base[c].dropna().unique():
            rest = [o for o in others if o != c]
            sub = base[base[c] == v]
            if rest:
                sub = sub[sub[rest].isna().all(axis=1)]
            if len(sub):
                yield sub


def _partition_for_axis(xbrl, grp, axis_col, dim_cols, domain_members, total):
    """Melhor partição que reconcilia neste eixo, ou None."""
    if axis_col not in grp.columns:
        return None
    allowed = domain_members.get(axis_col)

    for sub in _axis_row_variants(grp, axis_col, dim_cols):
        sub = sub[sub["concept"].map(_is_revenue_concept)]
        if len(sub) == 0:
            continue
        got = _best_partition(xbrl, sub, axis_col, allowed, total)
        if got:
            return got
    return None


def _best_partition(xbrl, sub, axis_col, allowed, total):

    for concept in sorted(sub["concept"].unique(), key=_concept_rank):
        c_rows = sub[sub["concept"] == concept]
        vals = {}
        for _, r in c_rows.iterrows():
            mid = _norm(r[axis_col])
            label = _member_label(xbrl, mid)
            v = float(r["numeric_value"])
            # Membro repetido: fica o maior (o outro costuma ser fatia parcial).
            prev = vals.get(label)
            if prev is None or abs(v) > abs(prev[0]):
                vals[label] = (v, mid)
        for cand in _candidate_partitions(vals, allowed, total):
            if abs(sum(cand.values()) - total) / total <= RECONCILE_TOL:
                return cand
    return None


_LABEL_SUFFIXES = (
    " revenue", " revenues", " net revenue", " net revenues",
    " sales", " net sales", " revenue net", " segment",
)


def _label_key(label: str) -> str:
    """Chave de comparação de rótulos: minúsculas, sem sufixo de receita e sem
    pontuação. 'Delivery service revenue' e 'Delivery Service' colapsam."""
    s = " ".join((label or "").lower().split())
    changed = True
    while changed:
        changed = False
        for suf in _LABEL_SUFFIXES:
            if s.endswith(suf) and len(s) > len(suf) + 1:
                s = s[: -len(suf)].strip()
                changed = True
    return _re.sub(r"[^a-z0-9]+", "", s)


def canonicalize_labels(merged: dict) -> int:
    """Unifica variantes do MESMO rótulo dentro da mesma empresa.

    O membro XBRL é estável entre filings, mas o texto do label linkbase não:
    a Chipotle chama 'Delivery Service' ao segmento até 2021 e 'Delivery
    service revenue' a partir de 2022, com o mesmo cmg:DeliveryServiceMember
    por baixo. Sem unificar, o gráfico desenha DUAS séries para o mesmo
    segmento, cada uma com metade do histórico e um buraco na outra metade —
    é o cohort LABEL_CHURN da auditoria.

    Escolhe a variante do período MAIS RECENTE (a nomenclatura atual da
    empresa) e reescreve as antigas. Só toca onde há de facto duas grafias da
    mesma chave: uma empresa com rótulos estáveis fica byte a byte igual.
    """
    # Da mais recente para a mais antiga, para a primeira grafia vista ganhar.
    ordem = sorted(merged.keys(), key=lambda k: str(k[1]), reverse=True)
    canonico: dict[tuple, str] = {}
    for chave in ordem:
        for eixo, seg in merged[chave].items():
            for rotulo in seg:
                canonico.setdefault((eixo, _label_key(rotulo)), rotulo)

    trocas = 0
    for chave in merged:
        for eixo, seg in list(merged[chave].items()):
            novo: dict = {}
            for rotulo, valor in seg.items():
                alvo = canonico.get((eixo, _label_key(rotulo)), rotulo)
                if alvo != rotulo:
                    trocas += 1
                # Duas grafias no MESMO período seriam segmentos distintos que
                # colapsaram por engano — manter a maior e não somar às cegas.
                if alvo in novo:
                    novo[alvo] = max(novo[alvo], valor)
                else:
                    novo[alvo] = valor
            merged[chave][eixo] = novo
    return trocas


def pick_primary(by_axis):
    """Partição principal para a coluna revenueSegments (mapa plano).

    Regra híbrida: o segmento operacional (ASC 280) manda, EXCETO quando os seus
    membros são geográficos e existe eixo de produto — nesse caso o produto diz
    muito mais sobre o negócio (Apple: iPhone/Mac/Services em vez de
    Americas/Europe/Greater China).
    """
    seg, prod, geo = by_axis.get("segment"), by_axis.get("product"), by_axis.get("geography")
    if seg and not (_looks_geographic(seg.keys()) and prod):
        return seg
    return prod or seg or geo


def extract_segments_from_filing(filing):
    """Devolve ({(period_type, period_end): {axis_name: {segmento: valor}}}, moeda).

    A moeda é a do filing (SEK na Ericsson, DKK na Novo Nordisk, GBP na Diageo),
    NÃO USD. Quem chama tem de converter antes de gravar, porque a coluna
    `revenue` da BD já está em USD — ver apply_fx_to_segments em main().
    """
    xbrl = filing.xbrl()
    if xbrl is None:
        return {}, None

    df = xbrl.query().with_dimensions().to_dataframe()
    if df is None or len(df) == 0:
        return {}, None

    dim_cols = [c for c in df.columns if c.startswith("dim_")]
    if not dim_cols:
        return {}, None

    # Só factos de duração (receita é fluxo, não saldo) e numéricos.
    df = df[df["numeric_value"].notna()]

    # UMA moeda só. Um 20-F traz o relato em moeda local mais um punhado de
    # factos em USD/EUR (a Ericsson: 3475 SEK, 30 USD, 4 EUR); sem este filtro
    # somavam-se grandezas de moedas diferentes na mesma partição.
    filing_currency = None
    if "currency" in df.columns and len(df):
        counts = df["currency"].value_counts()
        if len(counts):
            filing_currency = counts.index[0]
            df = df[df["currency"] == filing_currency]
    if "period_start" in df.columns:
        df = df[df["period_start"].notna() & df["period_end"].notna()]
    if len(df) == 0:
        return {}, None

    # Membros-folha legítimos por eixo, lidos do domínio do XBRL.
    domain_members = {}
    for axis_id, axis in (xbrl.axes or {}).items():
        dom = (xbrl.domains or {}).get(axis.domain_id) if axis.domain_id else None
        if dom is not None:
            domain_members[f"dim_{axis_id}"] = {_norm(m) for m in (dom.members or [])}

    calc_totals = None  # calculado à cabeça só se a lista estrita falhar
    out = {}
    for (pstart, pend), grp in df.groupby(["period_start", "period_end"]):
        try:
            days = (
                _dt.date.fromisoformat(str(pend)[:10])
                - _dt.date.fromisoformat(str(pstart)[:10])
            ).days
        except Exception:
            continue
        if 85 <= days <= 100:
            ptype = "QUARTERLY"
        elif 340 <= days <= 380:
            ptype = "ANNUAL"
        else:
            continue  # semestres, 9 meses, YTD — não são períodos da nossa BD

        # Total consolidado do período: facto de receita SEM qualquer dimensão.
        undim_all = grp[grp[dim_cols].isna().all(axis=1)]
        undim = undim_all[undim_all["concept"].map(_is_total_revenue_concept)]
        if len(undim) == 0:
            # Recurso: conceito de total declarado pela empresa no calc linkbase.
            if calc_totals is None:
                calc_totals = _total_concepts_from_calculation(xbrl)
            if calc_totals:
                undim = undim_all[undim_all["concept"].map(lambda c: _norm(c) in calc_totals)]
        if len(undim) == 0:
            continue
        # Vários candidatos a total, do maior para o menor. Uma partição pode
        # reconciliar com um subtotal em vez do total consolidado: a AstraZeneca
        # reparte por área terapêutica e isso soma à receita de PRODUTOS
        # (55,6 mM), não à receita total (58,7 mM), que inclui alianças. Testar
        # só o maior descartava a repartição inteira.
        totais = sorted({float(v) for v in undim["numeric_value"] if float(v) > 0},
                        reverse=True)[:3]
        if not totais:
            continue
        total = totais[0]

        by_axis = {}
        for name, axis_cols in AXES.items():
            found = None
            for axis_col in axis_cols:
                for cand_total in totais:
                    part = _partition_for_axis(xbrl, grp, axis_col, dim_cols,
                                               domain_members, cand_total)
                    if part:
                        found = part
                        break
                if found:
                    break
            if found:
                by_axis[name] = found
        if not by_axis:
            continue

        key = (ptype, str(pend)[:10])
        # Um filing pode repetir o mesmo período; fica a versão mais desagregada.
        prev = out.get(key)
        if prev is None or sum(len(v) for v in by_axis.values()) > sum(len(v) for v in prev.values()):
            out[key] = by_axis

    return out, filing_currency


def apply_fx_to_segments(by_axis: dict, currency: str, period_end) -> dict:
    """Converte uma partição da moeda do filing para USD, à taxa BCE mais próxima
    anterior ao periodEnd — exatamente o critério do apply_fx_conversion dos
    fundamentais, para que os segmentos e a `revenue` fiquem na mesma base.

    A reconciliação a montante corre em moeda nativa (segmentos e total vêm do
    mesmo filing), por isso a conversão tem de ser feita SÓ aqui, à saída.
    """
    if not currency or currency == "USD":
        return by_axis
    # Import tardio: reutiliza a série do BCE e a cache em disco do ingestor de
    # fundamentais, para que segmentos e receita usem exatamente a mesma taxa.
    from ingest_fundamentals import get_fx_series
    dates, rates = get_fx_series(currency)
    if not dates:
        raise RuntimeError(f"série FX vazia para {currency}USD")
    iso = period_end if isinstance(period_end, str) else period_end.isoformat()
    i = _bisect.bisect_right(dates, iso[:10]) - 1
    rate = rates[max(i, 0)]
    return {
        axis: {k: float(v) * rate for k, v in seg.items()}
        for axis, seg in by_axis.items()
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", help="lista separada por vírgulas; omitir = todas")
    ap.add_argument("--limit-companies", type=int, default=0)
    ap.add_argument("--tenks", type=int, default=3,
                    help="quantos 10-K buscar (cada um traz ~3 anos de anuais)")
    ap.add_argument("--tenqs", type=int, default=8, help="quantos 10-Q buscar")
    ap.add_argument("--twentyfs", type=int, default=3,
                    help="quantos 20-F buscar — emitentes estrangeiros (ASML, SAP, "
                         "SHEL, UBS...) não entregam 10-K e ficavam sem segmentos")
    ap.add_argument("--dry-run", action="store_true", help="não escreve na BD")
    ap.add_argument("--wipe-first", action="store_true",
                    help="limpa revenueSegments da empresa antes de reescrever — sem isto, "
                         "os valores do parser antigo sobrevivem nos períodos que o novo não cobre")
    ap.add_argument("--sleep", type=float, default=0.2)
    ap.add_argument("--cache-limit-gb", type=float, default=3.0,
                    help="purga a cache do edgartools acima deste tamanho")
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()

    if args.tickers:
        wanted = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        cur.execute(
            'SELECT id, ticker, cik FROM companies WHERE cik IS NOT NULL AND ticker = ANY(%s) ORDER BY ticker',
            (wanted,),
        )
    else:
        cur.execute('SELECT id, ticker, cik FROM companies WHERE cik IS NOT NULL ORDER BY ticker')
    companies = cur.fetchall()
    if args.limit_companies:
        companies = companies[: args.limit_companies]

    total_co = len(companies)
    print(f"{total_co} empresas com CIK. dry-run={args.dry_run}", flush=True)

    stats = defaultdict(int)
    seguidas_sem_filings = 0

    for i, (company_id, ticker, cik) in enumerate(companies, 1):
        try:
            co = edgar.Company(int(cik))
            filings = []
            for form, n in (("10-K", args.tenks), ("10-Q", args.tenqs),
                            ("20-F", args.twentyfs)):
                if n <= 0:
                    continue
                try:
                    got = co.get_filings(form=form).latest(n)
                except Exception:
                    continue
                if got is None:
                    continue
                # latest(1) devolve um Filing; latest(n>1) devolve uma coleção.
                filings += list(got) if hasattr(got, "__len__") else [got]
            if not filings:
                print(f"[{i}/{total_co}] {ticker}: sem filings", flush=True)
                stats["sem_filings"] += 1
                # Muitas seguidas = falha de ambiente (disco, rede, rate limit),
                # não ausência real de dados. Abortar em vez de criar buracos.
                seguidas_sem_filings += 1
                if seguidas_sem_filings >= 10:
                    sys.exit(f"ABORTADO: {seguidas_sem_filings} empresas seguidas sem "
                             f"filings — provável falha de ambiente, não de dados.")
                continue
            seguidas_sem_filings = 0

            # Processar do filing MAIS ANTIGO para o mais recente, para que o
            # mais recente sobreponha. Um filing antigo pode reportar o mesmo
            # período com uma composição de segmentos já obsoleta: a Baxter
            # reportava "Kidney Care" em 2023 e depois passou-a a operação
            # descontinuada — a versão antiga somava 14,7 mM contra uma receita
            # reapresentada de 10,4 mM. Preferir "quem tem mais segmentos"
            # escolhia justamente a versão errada.
            def _fdate(f):
                return str(getattr(f, "filing_date", "") or getattr(f, "period_of_report", "") or "")

            merged = {}
            for f in sorted(filings, key=_fdate):
                try:
                    got, fcur = extract_segments_from_filing(f)
                except Exception as e:
                    print(f"    {ticker} {getattr(f,'form','?')}: erro {e!r}", flush=True)
                    continue
                for k, v in got.items():
                    # (period_type, period_end) → converter já aqui, para que o
                    # merge entre filings de moedas diferentes (um 10-K em USD e
                    # um 20-F em SEK) nunca misture bases.
                    try:
                        v = apply_fx_to_segments(v, fcur, k[1])
                    except Exception as e:
                        # Falha de FX NÃO pode gravar em moeda crua — foi assim
                        # que a GSK ficou meses em GBP. Salta o período.
                        print(f"    {ticker}: FX {fcur}→USD falhou em {k[1]}: {e!r}", flush=True)
                        stats["fx_falhou"] += 1
                        continue
                    merged.setdefault(k, {}).update(v)
                time.sleep(args.sleep)

            # Depois de juntar TODOS os filings da empresa (só aqui se vê a
            # série completa e, com ela, as grafias que mudaram ao longo dos
            # anos).
            trocas = canonicalize_labels(merged)
            if trocas:
                stats["rotulos_unificados"] += trocas
                print(f"    {ticker}: {trocas} rótulos unificados (grafia mudou entre filings)", flush=True)

            if not merged:
                print(f"[{i}/{total_co}] {ticker}: 0 períodos que reconciliem", flush=True)
                stats["sem_segmentos"] += 1
                continue

            written = 0
            if not args.dry_run:
                if args.wipe_first:
                    cur.execute(
                        'UPDATE fundamentals SET "revenueSegments" = NULL, '
                        '"revenueSegmentsByAxis" = NULL WHERE "companyId" = %s',
                        (company_id,),
                    )
                for (ptype, pend), by_axis in merged.items():
                    primary = pick_primary(by_axis)
                    if not primary:
                        continue
                    cur.execute(
                        'UPDATE fundamentals SET "revenueSegments" = %s, '
                        '"revenueSegmentsByAxis" = %s '
                        'WHERE "companyId" = %s AND "periodType" = %s::"period_type" '
                        'AND "periodEnd"::date = %s::date',
                        (json.dumps(primary), json.dumps(by_axis), company_id, ptype, pend),
                    )
                    written += cur.rowcount
                conn.commit()
            axes_seen = {a for v in merged.values() for a in v}
            print(f"[{i}/{total_co}] {ticker}: {len(merged)} períodos, {written} linhas, "
                  f"eixos={sorted(axes_seen)}", flush=True)
            stats["ok"] += 1
            stats["periodos"] += len(merged)
            stats["linhas"] += written
        except Exception as e:
            conn.rollback()
            print(f"[{i}/{total_co}] {ticker}: ERRO {e!r}", flush=True)
            stats["erro"] += 1
        if i % 15 == 0:
            purge_edgar_cache_if_big(args.cache_limit_gb)

    cur.close()
    conn.close()
    print(f"\nResumo: {dict(stats)}")


if __name__ == "__main__":
    main()
