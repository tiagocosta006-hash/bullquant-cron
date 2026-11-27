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

IDENTITY = os.getenv("SEC_IDENTITY") or os.getenv("SEC_USER_AGENT") or "BullValue admin@bullocracy.com"

# Cache por filing (19/11): cada 10-K/10-Q é lido UMA vez e o resultado fica em
# scripts/.cache/segmentos/<cik>.json. Antes, cada sábado voltava a descarregar
# os mesmos ~11 XBRL por empresa (≈5 800 downloads) e, por isso mesmo, só se
# lia o fim do histórico (3 10-K → ~5 anos). Com a cache, a primeira passagem
# vai buscar 10 anos e as seguintes só leem os filings novos.
# A cache guarda os FACTOS de cada filing (snapshot_filing), não o resultado:
# mudar a lógica das partições não obriga a descarregar nada outra vez. Só
# mudar o que snapshot_filing guarda exige subir EXTRATOR_VERSAO.
EXTRATOR_VERSAO = 2
CACHE_SEG = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "segmentos")


def _cache_ler(cik) -> dict:
    p = os.path.join(CACHE_SEG, f"{int(cik)}.json.gz")
    try:
        import gzip
        d = json.load(gzip.open(p, "rt"))
        if d.get("versao") == EXTRATOR_VERSAO:
            return d.get("filings", {})
    except (OSError, ValueError):
        pass
    return {}


def _cache_gravar(cik, filings: dict) -> None:
    os.makedirs(CACHE_SEG, exist_ok=True)
    import gzip
    p = os.path.join(CACHE_SEG, f"{int(cik)}.json.gz")
    tmp = p + ".tmp"
    with gzip.open(tmp, "wt") as fh:
        json.dump({"versao": EXTRATOR_VERSAO, "filings": filings}, fh, separators=(",", ":"))
    os.replace(tmp, p)

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
# Fatia com OUTRO eixo fixado num membro (UNH: clientes externos; NFLX: streaming):
# é aí que aparecem coincidências — a CAT 2023 juntou as parcelas da América do
# Norte com o total da América do Norte e deu 67,7 contra 67,1 mM de receita
# (0,9%). Uma repartição verdadeira numa fatia destas fecha quase exata.
RECONCILE_TOL_FATIA = 0.005
# Membros que são agregados de outros e nunca uma fatia: "Reportable segment net
# sales" (MDT), "Segments Excluding All Other Segments" (CAT), "Total ...".
_AGREGADO = _re.compile(r"\bexcluding\b|\breportable segments?\b.*\b(sales|revenues?)\b|^\s*total\b|"
                        r"\ball segments\b|\bsegments? total\b", _re.I)

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


_NS_PADRAO = ("us-gaap:", "srt:", "country:", "ifrs-full:", "dei:", "stpr:", "currency:")


def _rotulos_do_xbrl(xbrl, membros) -> dict:
    """{membro: {"terse": ..., "plain": ...}} tirado do label linkbase do filing."""
    out = {}
    cat = xbrl.element_catalog or {}
    for mid in membros:
        el = cat.get((mid or "").replace(":", "_", 1))
        labels = getattr(el, "labels", None) or {}
        out[mid] = {"terse": labels.get(_TERSE), "plain": labels.get(_PLAIN)}
    return out


def _member_label(rotulos: dict, member_id: str) -> str:
    """Rótulo humano de um membro, tirado do label linkbase do próprio filing.

    Não se usa a coluna `dimension_member_label` do dataframe porque, quando um
    facto tem dois eixos (segmento + consolidação), ela traz o rótulo do eixo
    errado — no JPM os três segmentos vinham todos como "Operating Segments".

    Membros da taxonomia PADRÃO (country:US, srt:EuropeMember) usam o rótulo
    normal: o "terse" deles é partilhado por todas as tabelas do filing e pode
    vir de outra — a CAT tinha country:US com terse "U.S. pensions". Nos membros
    próprios da empresa o terse é o mais limpo ("Americas" vs "Americas Segment").
    """
    labels = (rotulos or {}).get(member_id) or {}
    # Só os PAÍSES (country:US) — nos membros us-gaap/srt o terse é o que a
    # empresa escolheu ("Other revenue" na Visa; o rótulo padrão é "Service, Other").
    ordem = ("plain", "terse") if (member_id or "").startswith("country:") else ("terse", "plain")
    for role in ordem:
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
    # Primeiro, sem os membros que são agregados: pelo rótulo, ou porque o valor
    # é a soma de dois ou mais irmãos (subtotal de um grupo de segmentos).
    agregados = {k for k in plain if _AGREGADO.search(k)}
    outros = [k for k in plain if k not in agregados]
    if 3 <= len(outros) <= 12 and total > 0:
        from itertools import combinations
        for k in outros:
            resto = [j for j in outros if j != k]
            for n in range(2, len(resto) + 1):
                if any(abs(sum(plain[j] for j in comb) - plain[k]) <= 0.005 * abs(plain[k])
                       for comb in combinations(resto, n)):
                    agregados.add(k)
                    break
    if agregados:
        limpo = {k: v for k, v in plain.items() if k not in agregados}
        if allowed:
            dom = {k: v[0] for k, v in vals.items() if v[1] in allowed and k not in agregados}
            if len(dom) >= 2:
                cands.append(dom)
        if len(limpo) >= 2:
            cands.append(limpo)
        plain = limpo
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

        # MEMBRO TRANSVERSAL: não é rollup dos irmãos nem é o total sozinho, mas
        # sobrepõe-se a eles. A Visa acrescentou v:ValueAddedServicesMember
        # (10,9 mil M$) ao ProductOrServiceAxis no 10-K de 2025 — receita de
        # serviços de valor acrescentado que já está distribuída pelos outros
        # membros. Os cinco verdadeiros somam exatamente os 40,0 mil M$ de
        # receita; com o sexto vão a 1,27x e a partição era rejeitada inteira,
        # deixando 2025 sem repartição de produto.
        #
        # Testa-se remover UM membro de cada vez e fica-se com o que faz o resto
        # reconciliar. Só se aceita quando a solução é ÚNICA: se dois membros
        # diferentes servirem, não há como saber qual é o intruso e não se
        # arrisca. É seguro por construção — numa partição verdadeira, tirar um
        # membro real deixa a soma em total-membro, que não reconcilia.
        if total > 0 and len(plain) >= 3:
            unicos = [k for k in plain
                      if abs(sum(v for j, v in plain.items() if j != k) - total)
                      / total <= RECONCILE_TOL]
            if len(unicos) == 1:
                trimmed = {k: v for k, v in plain.items() if k != unicos[0]}
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
    todos = grp[grp[axis_col].notna()]
    # Uma fatia por membro de CONSOLIDAÇÃO, nunca misturadas (19/11): a CAT
    # publica cada segmento duas vezes — com vendas intersegmento
    # (OperatingSegmentsMember) e só externas (...ExcludingIntersegmentElimination).
    # Juntá-las e ficar "com o maior de cada" dava uma repartição que não era
    # nenhuma das duas. Ordem: só externas, sem qualificador, com intersegmento.
    cons_cols = [c for c in CONSOLIDATION_AXES if c in todos.columns]
    fatias_cons = []
    if cons_cols:
        cc = cons_cols[0]
        valores = [None] + sorted({v for v in todos[cc].dropna().unique() if "OperatingSegments" in str(v)},
                                  key=lambda v: (0 if "Excluding" in str(v) or "External" in str(v) else 1, str(v)))
        for v in valores:
            sub = todos[todos[cc].isna()] if v is None else todos[todos[cc] == v]
            for o in cons_cols[1:]:
                sub = sub[sub[o].isna()]
            if len(sub):
                fatias_cons.append(sub)
    else:
        fatias_cons = [todos]

    for base in fatias_cons:
        if not others:
            yield base, False
            continue
        # 1) fatia sem qualquer outro eixo preenchido — o caso simples e mais comum.
        strict = base[base[others].isna().all(axis=1)]
        if len(strict):
            yield strict, False
        # 2) fixar UM outro eixo num valor e exigir os restantes vazios.
        for c in others:
            for v in base[c].dropna().unique():
                rest = [o for o in others if o != c]
                sub = base[base[c] == v]
                if rest:
                    sub = sub[sub[rest].isna().all(axis=1)]
                if len(sub):
                    yield sub, True


def _itens_reconciliacao(grp, axis_col, dim_cols):
    """Factos de reconciliação PUBLICADOS (itens corporativos, eliminações), sem
    o eixo de segmento: só eixo de consolidação, nada mais. Servem para fechar
    uma repartição que a empresa fecha com eles (CAT: segmentos externos +
    "Corporate items" = receita). Nunca se inventa um resíduo."""
    cons_cols = [c for c in CONSOLIDATION_AXES if c in grp.columns]
    if not cons_cols or axis_col not in grp.columns:
        return grp.iloc[0:0]
    outros = [c for c in dim_cols if c not in cons_cols]
    r = grp[grp[outros].isna().all(axis=1)] if outros else grp
    cc = cons_cols[0]
    return r[r[cc].notna() & ~r[cc].map(lambda v: "OperatingSegments" in str(v)).astype(bool)]


def _maior_subconjunto(vals: dict, total: float, tol: float):
    """Quando o eixo traz DUAS repartições sobrepostas (CAT: EUA + resto do mundo
    E quatro regiões, todas no mesmo eixo), nenhuma soma do conjunto fecha.
    Procura o maior subconjunto que fecha com o total; só aceita se for único
    nesse tamanho (senão não há como saber qual é a repartição certa)."""
    from itertools import combinations
    ks = list(vals)
    if not (3 <= len(ks) <= 14) or total <= 0:
        return None
    for n in range(len(ks) - 1, 1, -1):
        hits = [c for c in combinations(ks, n) if abs(sum(vals[k] for k in c) - total) / total <= tol]
        if len(hits) == 1:
            return {k: vals[k] for k in hits[0]}
        if len(hits) > 1:
            return None
    return None


def _fatia_juntada(grp, axis_col, dim_cols):
    """A fatia como era antes de 19/11: sem qualificador de consolidação e
    "segmentos operacionais" juntos, outros eixos vazios. Último recurso — há
    empresas que põem um membro numa e os restantes na outra (MDT 2023: os
    quatro segmentos com OperatingSegmentsMember e "Other" sem qualificador)."""
    base = grp[grp[axis_col].notna()]
    for cc in CONSOLIDATION_AXES:
        if cc in base.columns:
            c = base[cc]
            base = base[(c.isna() | c.map(lambda v: "OperatingSegments" in str(v))).astype(bool)]
    outros = [c for c in dim_cols if c != axis_col and c not in CONSOLIDATION_AXES]
    return base[base[outros].isna().all(axis=1)] if outros else base


def _partition_for_axis(rotulos, grp, axis_col, dim_cols, domain_members, total):
    """Melhor partição que reconcilia neste eixo, ou None.

    Duas passagens por TODAS as fatias: primeiro só repartições exatas (±0,5%),
    depois a melhor aproximada. Uma aproximada numa fatia já não tapa uma
    exata noutra."""
    if axis_col not in grp.columns:
        return None
    recon = _itens_reconciliacao(grp, axis_col, dim_cols)
    allowed = domain_members.get(axis_col)
    variantes = list(_axis_row_variants(grp, axis_col, dim_cols)) + [(_fatia_juntada(grp, axis_col, dim_cols), False)]
    variantes = [(sub[sub["concept"].map(_is_revenue_concept)], f) for sub, f in variantes]
    variantes = [(sub, f) for sub, f in variantes if len(sub)]
    for so_exata in (True, False):
        for sub, fatia in variantes:
            got = _best_partition(rotulos, sub, axis_col, allowed, total,
                                  RECONCILE_TOL_FATIA if fatia else RECONCILE_TOL,
                                  None if fatia else recon, so_exata)
            if got:
                return got
    return None


# Nomes fixos para as linhas de reconciliação: o rótulo da taxonomia muda de
# ano para ano ("Corporate, Non-Segment" / "Segment Reporting, Reconciling Item,
# Corporate Nonsegment") e partia a série no gráfico.
_NOME_RECONCILIACAO = (
    ("CorporateNonSegment", "Corporate"),
    ("IntersegmentElimination", "Intersegment eliminations"),
    ("EliminationsAndReconciling", "Eliminations and reconciling items"),
    ("ReconcilingItems", "Reconciling items"),
)


def _nome_reconciliacao(rotulos, mid):
    for chave, nome in _NOME_RECONCILIACAO:
        if chave in (mid or ""):
            return nome
    return _member_label(rotulos, mid)


def _best_partition(rotulos, sub, axis_col, allowed, total, tol=RECONCILE_TOL, recon=None, so_exata=False):
    """Duas passagens por TODOS os conceitos de receita: primeiro só aceita uma
    repartição que fecha exata (±0,5%) — sozinha, com itens de reconciliação
    publicados, ou como o maior subconjunto que fecha —, depois aceita a melhor
    aproximada (±tol). Antes, a aproximada de um conceito ganhava à exata do
    conceito seguinte (MDT 2023 perdia "Other Segments")."""
    from itertools import combinations
    aproximadas = []
    for concept in sorted(sub["concept"].unique(), key=_concept_rank):
        c_rows = sub[sub["concept"] == concept]
        vals = {}
        for _, r in c_rows.iterrows():
            mid = _norm(r[axis_col])
            label = _member_label(rotulos, mid)
            v = float(r["numeric_value"])
            # Membro repetido: fica o maior (o outro costuma ser fatia parcial).
            prev = vals.get(label)
            if prev is None or abs(v) > abs(prev[0]):
                vals[label] = (v, mid)
        # Dois membros com EXATAMENTE o mesmo valor (≠ 0) são o mesmo número
        # taggado duas vezes — MDT 2025: AllOtherSegments e OtherSegment, ambos
        # 495 M. Sem isto, tirar um ou outro fechava a conta e a ambiguidade
        # fazia rejeitar a repartição inteira.
        vistos = {}
        for k in sorted(vals):
            v0 = vals[k][0]
            if v0 != 0 and v0 in vistos:
                del vals[k]
            else:
                vistos[v0] = k
        cands = _candidate_partitions(vals, allowed, total)
        for cand in cands:
            if abs(sum(cand.values()) - total) / total <= min(tol, RECONCILE_TOL_FATIA):
                return cand
        aproximadas += [c for c in cands if abs(sum(c.values()) - total) / total <= tol]
        # Segmentos + itens de reconciliação publicados (o menor número deles).
        if recon is not None and len(recon):
            r_rows = recon[recon["concept"] == concept]
            itens = {}
            cc = next((c for c in CONSOLIDATION_AXES if c in r_rows.columns), None) if len(r_rows) else None
            for _, r in r_rows.iterrows():
                itens[_nome_reconciliacao(rotulos, _norm(r[cc]))] = float(r["numeric_value"])
            for cand in cands[:2]:
                for k in range(1, min(len(itens), 3) + 1):
                    for comb in combinations(itens, k):
                        if any(x in cand for x in comb):
                            continue
                        soma = sum(cand.values()) + sum(itens[x] for x in comb)
                        if abs(soma - total) / total <= RECONCILE_TOL_FATIA:
                            return {**cand, **{x: itens[x] for x in comb}}
        # Duas repartições sobrepostas no mesmo eixo: a maior que fecha.
        plain = {k: v[0] for k, v in vals.items() if not _AGREGADO.search(k)}
        sub_ok = _maior_subconjunto(plain, total, RECONCILE_TOL_FATIA)
        if sub_ok:
            return sub_ok
    if aproximadas and not so_exata:
        return min(aproximadas, key=lambda c: abs(sum(c.values()) - total))
    return None


_LABEL_SUFFIXES = (
    " revenue", " revenues", " net revenue", " net revenues",
    " sales", " net sales", " revenue net", " segment",
)


def _limpa_marcadores(s: str) -> str:
    """Tira '[member]' / '[domain]' do rótulo. O _member_label já os remove, mas
    só na grafia '[Member]' — a Autodesk publica 'Media And Entertainment
    [member]' em minúsculas e o marcador ia parar à legenda do gráfico."""
    return _re.sub(r"\[\s*(member|domain)\s*\]", " ", s, flags=_re.I)


def _label_key(label: str) -> str:
    """Chave de comparação de rótulos: minúsculas, sem marcadores XBRL, sem
    sufixo de receita e sem pontuação. 'Delivery service revenue' e 'Delivery
    Service' colapsam; 'Health & Public Service' e 'Health And Public Service
    Segment' também (a Accenture usa as duas grafias)."""
    s = " ".join(_limpa_marcadores((label or "").lower()).split())
    # '&' e 'and' são a mesma palavra para efeitos de identidade do segmento —
    # tem de ser ANTES de tirar a pontuação, senão '&' desaparece e as duas
    # grafias deixam de casar.
    s = s.replace("&", " and ")
    s = " ".join(s.split())
    changed = True
    while changed:
        changed = False
        for suf in _LABEL_SUFFIXES:
            if s.endswith(suf) and len(s) > len(suf) + 1:
                s = s[: -len(suf)].strip()
                changed = True
    # singular/plural é a mesma série ("Other Operating Segment(s)", MDT)
    s = _re.sub(r"(?<=[a-z]{3})s\b", "", s)
    return _re.sub(r"[^a-z0-9]+", "", s)


def _tem_sufixo_redundante(rotulo: str) -> bool:
    """'Gas segment' / 'Consulting Revenue' num gráfico chamado "Receitas por
    Segmento" — o sufixo não acrescenta nada e só rouba espaço à legenda.
    Um marcador '[member]' pendurado conta como o mesmo tipo de ruído."""
    low = " ".join((rotulo or "").lower().split())
    if _re.search(r"\[\s*(member|domain)\s*\]", low):
        return True
    return any(low.endswith(suf) for suf in _LABEL_SUFFIXES)


def limpar_display(rotulo: str) -> str:
    """Normaliza o rótulo para exibição, sem lhe mudar o sentido.

    Tira marcadores XBRL pendurados e troca espaços Unicode (a Accenture
    publica 'Health\\xa0& Public Service' com espaço não-quebrável) por espaço
    normal: invisível ao ler, mas parte a pesquisa e a comparação de strings.
    """
    s = _limpa_marcadores(rotulo or "")
    s = _re.sub(r"[      - ]", " ", s)
    return " ".join(s.split())


def escolher_canonico(variantes: list) -> str:
    """Qual das grafias fica, dada a lista JÁ ordenada da mais recente para a
    mais antiga.

    Preferir a mais recente parecia o mais fiel (é como a empresa lhe chama
    hoje), mas medido sobre a BD toda deixava 94 rótulos com sufixo redundante
    — 'Gas segment', 'Corporate Segment', 'Energy generation and storage
    segment'. Preferir a mais limpa baixa isso para 27, e nesses 27 nenhuma
    variante existe sem sufixo. Desempate pela mais recente, que é a ordem em
    que a lista chega.
    """
    return limpar_display(min(variantes, key=lambda r: (_tem_sufixo_redundante(r), len(r))))


def canonicalize_labels(merged: dict) -> int:
    """Unifica variantes do MESMO rótulo dentro da mesma empresa.

    O membro XBRL é estável entre filings, mas o texto do label linkbase não:
    a Chipotle chama 'Delivery Service' ao segmento até 2021 e 'Delivery
    service revenue' a partir de 2022, com o mesmo cmg:DeliveryServiceMember
    por baixo. Sem unificar, o gráfico desenha DUAS séries para o mesmo
    segmento, cada uma com metade do histórico e um buraco na outra metade —
    é o cohort LABEL_CHURN da auditoria.

    Só toca onde há de facto duas grafias da mesma chave: uma empresa com
    rótulos estáveis fica byte a byte igual.
    """
    # Da mais recente para a mais antiga: é a ordem que escolher_canonico usa
    # para desempatar.
    ordem = sorted(merged.keys(), key=lambda k: str(k[1]), reverse=True)
    vistas: dict[tuple, list] = {}
    for chave in ordem:
        for eixo, seg in merged[chave].items():
            for rotulo in seg:
                vistas.setdefault((eixo, _label_key(rotulo)), [])
                if rotulo not in vistas[(eixo, _label_key(rotulo))]:
                    vistas[(eixo, _label_key(rotulo))].append(rotulo)
    canonico = {k: escolher_canonico(v) for k, v in vistas.items()}

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


TOL_RECEITA_GRAVADA = 0.10
_LINHA_RECONCILIACAO = _re.compile(r"\bcorporate\b|eliminat|reconcil|intersegment|unallocated", _re.I)


def eixos_coerentes(by_axis, receita):
    """Só os eixos que se podem mostrar AO LADO da receita gravada.

    O filing reconcilia a partição com o seu próprio total, mas esse total pode
    ser outro: vendas antes de eliminar as vendas entre segmentos (RSG, COP,
    SRE: +10–15%), receita com impostos especiais (MO, DEO), ou uma "partição"
    feita quase só de linhas de reconciliação (TRGP: 'Reconciling items' 22 mM
    e 'Corporate and Eliminations' −4,9 mM). Um gráfico cuja soma não é a
    receita que o utilizador vê ao lado engana, por isso:
      · a soma tem de ficar a ±10% da receita gravada;
      · linhas corporativas/eliminações/reconciliação não podem pesar >25%.
    Sem receita gravada não há com que comparar e o eixo passa como está.
    """
    if not receita or receita <= 0:
        return by_axis
    out = {}
    for eixo, membros in by_axis.items():
        if not membros:
            continue
        soma = sum(membros.values())
        if abs(soma / receita - 1) > TOL_RECEITA_GRAVADA:
            continue
        recon = sum(abs(v) for k, v in membros.items() if _LINHA_RECONCILIACAO.search(k))
        if recon > 0.25 * receita:
            continue
        out[eixo] = membros
    # Uma "geografia" com exatamente os mesmos membros de outro eixo é esse
    # eixo repetido, não uma repartição por regiões: a Arch Capital punha
    # Mortgage/Insurance/Reinsurance e a Healthpeak Lab/Senior Housing no
    # gráfico de geografia (o XBRL marca os mesmos membros nos dois eixos).
    geo = out.get("geography")
    if geo and any(out.get(e) and set(out[e]) == set(geo) for e in ("segment", "product")):
        del out["geography"]
    return out


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


_EIXOS_NEGOCIO = ("segment", "product")


def eixo_da_empresa(periodos: dict) -> str | None:
    """O eixo do gráfico "Receitas por Segmento" — UM por empresa, igual em
    todos os períodos.

    O pick_primary decidia período a período, e em 154 de 513 empresas o
    gráfico saltava de eixo ao longo dos anos: Coca-Cola com segmentos até 2021
    e produtos depois, Home Depot com geografia até 2021 e segmentos depois,
    Netflix com produto em 2019-21 e geografia desde 2022. Barras de anos
    diferentes deixavam de ser comparáveis e a legenda misturava regiões com
    produtos (reportado pelo Costa a 2026-11-27).

    `periodos`: {(periodType, periodEnd): by_axis já filtrado por
    eixos_coerentes}. Decide-se pelos anuais (pelos trimestrais se não houver):
      1. Só conta um eixo que exista no último período com segmentos — o
         gráfico tem de chegar ao presente, não acabar em 2021.
      2. Entre segmento e produto, a regra do pick_primary nesse último período
         (segmento, salvo se for geográfico e houver produto)...
      3. ...exceto se o escolhido cobrir menos de 60% dos períodos que o outro
         cobre: a Coca-Cola tem produto só desde 2022 e segmentos desde 2016.
      4. Geografia só quando não há segmento nem produto no último período (a
         Netflix e a ABNB só reportam regiões): fica geografia em todos os anos,
         nunca às fatias.
    """
    if not periodos:
        return None
    def tem_dados(k):
        return any(periodos[k].get(e) for e in AXES)
    # Anuais com dados; se nenhum tiver (todos caíram no eixos_coerentes), os
    # trimestrais — senão a empresa perdia o gráfico com trimestres válidos.
    base = [k for k in periodos if k[0] == "ANNUAL" and tem_dados(k)] or \
           [k for k in periodos if tem_dados(k)]
    base.sort(key=lambda k: str(k[1]))
    com_dados = base
    if not com_dados:
        return None
    ultimo = periodos[com_dados[-1]]
    cobertura = {e: sum(1 for k in base if periodos[k].get(e)) for e in AXES}

    candidatos = [e for e in _EIXOS_NEGOCIO if ultimo.get(e)]
    if not candidatos:
        return "geography" if ultimo.get("geography") else None
    if len(candidatos) == 1:
        return candidatos[0]
    preferido = pick_primary({e: ultimo[e] for e in _EIXOS_NEGOCIO})
    eixo = "segment" if preferido is ultimo["segment"] else "product"
    outro = "product" if eixo == "segment" else "segment"
    if cobertura[eixo] < 0.6 * cobertura[outro]:
        return outro
    return eixo


def snapshot_filing(filing) -> dict | None:
    """Os factos de RECEITA de um filing (com e sem dimensões), os rótulos dos
    membros, os domínios dos eixos e os totais do calculation linkbase — tudo o
    que a repartição precisa, num dicionário pequeno que vai para a cache.

    Separar a LEITURA (lenta: descarrega e processa o XBRL inteiro) do CÁLCULO
    deixa mudar a lógica das partições e recalcular 10 anos de 530 empresas
    sem voltar a pedir nada à SEC.
    """
    xbrl = filing.xbrl()
    if xbrl is None:
        return None
    df = xbrl.query().with_dimensions().to_dataframe()
    if df is None or len(df) == 0:
        return None
    dim_cols = [c for c in df.columns if c.startswith("dim_")]
    if not dim_cols:
        return None
    df = df[df["numeric_value"].notna()]
    if "period_start" not in df.columns:
        return None
    df = df[df["period_start"].notna() & df["period_end"].notna()]
    calc = sorted(_total_concepts_from_calculation(xbrl))
    calc_set = set(calc)
    df = df[df["concept"].map(lambda c: _is_revenue_concept(c) or _is_total_revenue_concept(c)
                              or _norm(c) in calc_set)]
    if len(df) == 0:
        return None
    moedas = df["currency"].value_counts() if "currency" in df.columns else None
    linhas, membros = [], set()
    for _, r in df.iterrows():
        dims = {c: str(r[c]) for c in dim_cols if r[c] is not None and str(r[c]) not in ("", "nan", "None")}
        membros.update(_norm(v) for v in dims.values())
        linhas.append({"c": r["concept"], "s": str(r["period_start"])[:10], "e": str(r["period_end"])[:10],
                       "v": float(r["numeric_value"]), "m": r.get("currency") if "currency" in df.columns else None,
                       "d": dims})
    dominios = {}
    for axis_id, axis in (xbrl.axes or {}).items():
        dom = (xbrl.domains or {}).get(axis.domain_id) if axis.domain_id else None
        if dom is not None:
            dominios[f"dim_{axis_id}"] = sorted({_norm(m) for m in (dom.members or [])})
    return {"linhas": linhas, "rotulos": _rotulos_do_xbrl(xbrl, membros), "dominios": dominios,
            "calc": calc, "moedas": {str(k): int(v) for k, v in moedas.items()} if moedas is not None else {}}


def extract_segments_from_filing(filing):
    """Compatibilidade: lê o filing e calcula logo as partições."""
    snap = snapshot_filing(filing)
    return segments_from_snapshot(snap) if snap else ({}, None)


def segments_from_snapshot(snap: dict, receitas: dict | None = None):
    """Devolve ({(period_type, period_end): {axis_name: {segmento: valor}}}, moeda).

    A moeda é a do filing (SEK na Ericsson, DKK na Novo Nordisk, GBP na Diageo),
    NÃO USD. Quem chama tem de converter antes de gravar, porque a coluna
    `revenue` da BD já está em USD — ver apply_fx_to_segments em main().
    """
    import pandas as pd
    rows = []
    for l in snap["linhas"]:
        rows.append({"concept": l["c"], "period_start": l["s"], "period_end": l["e"],
                     "numeric_value": l["v"], "currency": l.get("m"), **l["d"]})
    df = pd.DataFrame(rows)
    if len(df) == 0:
        return {}, None
    dim_cols = sorted({k for l in snap["linhas"] for k in l["d"]})
    for c in dim_cols:
        if c not in df.columns:
            df[c] = None
    df[dim_cols] = df[dim_cols].astype(object).where(df[dim_cols].notna(), None)
    rotulos = snap["rotulos"]

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
    domain_members = {k: set(v) for k, v in snap["dominios"].items()}

    calc_totals = set(snap["calc"])
    out = {}
    for (pstart, pend), grp in df.groupby(["period_start", "period_end"]):
        try:
            days = (
                _dt.date.fromisoformat(str(pend)[:10])
                - _dt.date.fromisoformat(str(pstart)[:10])
            ).days
        except Exception:
            continue
        # 80 dias, não 85: os calendários 4-4-5 fecham trimestres de 12 semanas
        # (84 dias) e a Costco chega a 83. Com o limite em 85 ficavam de fora
        # por dois dias — e a COST, PEP e WM apareciam com ZERO segmentos
        # trimestrais apesar de os publicarem no 10-Q. É a MESMA janela que o
        # is_quarterly_duration do ingest_fundamentals já usa (:716); tê-las
        # diferentes fazia a linha existir na BD sem o segmento nunca lhe chegar.
        if 80 <= days <= 119:   # Q1 de 16 semanas (KR) — mesma janela do ingest_fundamentals
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
        # ...mas o subtotal tem de ser MATERIAL. Sem este piso, os bancos
        # reconciliavam contra o total de COMISSÕES e gravavam uma partição que
        # cobre 13-19% da receita: a Citizens Financial mostrava 227 M de
        # segmentos contra 1.750 M de receita. Para quem olha o gráfico, isso
        # não é "a repartição do banco" — é uma fatia estreita a fingir que é o
        # todo. A AstraZeneca (55,6 de 58,7 mM = 95%) continua a passar.
        totais = [t for t in totais if t >= 0.5 * totais[0]]
        # Com a receita GRAVADA conhecida (filings em USD), testa-se primeiro o total
        # mais perto dela: a Republic Services publica a repartição BRUTA (Revenues
        # 19,03 mM, antes de eliminar vendas entre segmentos) e a EXTERNA (receita de
        # contratos 16,59 mM = a consolidada). Começar pelo maior dava a bruta, que
        # depois não fecha com a receita e o ano ficava sem repartição.
        rev = (receitas or {}).get((ptype, str(pend)[:10])) if filing_currency == "USD" else None
        if rev:
            totais.sort(key=lambda t: abs(t - rev))
        total = totais[0]

        by_axis = {}
        for name, axis_cols in AXES.items():
            found = None
            for axis_col in axis_cols:
                for cand_total in totais:
                    part = _partition_for_axis(rotulos, grp, axis_col, dim_cols,
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
    # 10 anos: com a cache por filing, só a 1.ª passagem paga o histórico todo.
    ap.add_argument("--tenks", type=int, default=11,
                    help="quantos 10-K buscar (cada um traz ~3 anos de anuais)")
    ap.add_argument("--tenqs", type=int, default=40, help="quantos 10-Q buscar")
    ap.add_argument("--twentyfs", type=int, default=11,
                    help="quantos 20-F buscar — emitentes estrangeiros (ASML, SAP, "
                         "SHEL, UBS...) não entregam 10-K e ficavam sem segmentos")
    ap.add_argument("--dry-run", action="store_true", help="não escreve na BD")
    ap.add_argument("--wipe-first", action="store_true",
                    help="limpa revenueSegments da empresa antes de reescrever — sem isto, "
                         "os valores do parser antigo sobrevivem nos períodos que o novo não cobre")
    ap.add_argument("--sleep", type=float, default=0.2)
    ap.add_argument("--cache-limit-gb", type=float, default=3.0,
                    help="purga a cache do edgartools acima deste tamanho")
    # O GitHub mata a tarefa às 6 h e aí os passos seguintes (guardar a cache,
    # derivar o Q4) não correm. Com um limite próprio o script pára a tempo e
    # a corrida seguinte continua pela cache, sem repetir o que já leu.
    ap.add_argument("--max-minutes", type=float, default=0,
                    help="pára de pegar em empresas novas ao fim de N minutos (0 = sem limite)")
    args = ap.parse_args()
    inicio = time.monotonic()

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
        if args.max_minutes and (time.monotonic() - inicio) / 60 >= args.max_minutes:
            print(f"\nLimite de {args.max_minutes:g} min atingido: paro em {ticker} "
                  f"({i - 1}/{total_co} feitas). A próxima corrida continua pela cache.",
                  flush=True)
            stats["por_fazer"] = total_co - i + 1
            break
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
            # Receita GRAVADA por período (USD): ordena os totais candidatos de cada
            # filing — ver segments_from_snapshot(receitas=...).
            cur.execute('SELECT "periodType"::text, "periodEnd"::date, revenue FROM fundamentals '
                        'WHERE "companyId" = %s AND revenue IS NOT NULL', (company_id,))
            receitas = {(pt, str(pe)[:10]): float(rv) for pt, pe, rv in cur.fetchall()}

            def _fdate(f):
                return str(getattr(f, "filing_date", "") or getattr(f, "period_of_report", "") or "")

            cache = _cache_ler(cik)
            novos = 0
            merged = {}
            for f in sorted(filings, key=_fdate):
                acc = str(getattr(f, "accession_no", "") or getattr(f, "accession_number", ""))
                if acc and acc in cache:
                    snap = cache[acc]["snap"]
                else:
                    try:
                        snap = snapshot_filing(f)
                    except Exception as e:
                        # erro NÃO entra na cache: tenta-se outra vez na próxima corrida
                        print(f"    {ticker} {getattr(f,'form','?')}: erro {e!r}", flush=True)
                        continue
                    if acc:
                        cache[acc] = {"data": _fdate(f), "snap": snap}
                        novos += 1
                    time.sleep(args.sleep)
                try:
                    got, fcur = segments_from_snapshot(snap, receitas) if snap else ({}, None)
                except Exception as e:
                    print(f"    {ticker} {getattr(f,'form','?')}: erro no cálculo {e!r}", flush=True)
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
            if novos:
                _cache_gravar(cik, cache)
                stats["filings_novos"] += novos
            stats["filings_da_cache"] += len(filings) - novos

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
            coerentes = {}
            for (ptype, pend), by_axis in merged.items():
                # A partição reconcilia dentro do FILING, mas a receita da
                # nossa BD pode ser outro conceito. Nos bancos é: o XBRL
                # reparte só as comissões e a BD guarda a receita com margem
                # financeira incluída — a Citizens Financial ficava com
                # 227 M de segmentos contra 1.750 M de receita (13%). Um
                # gráfico assim não é a repartição do banco, é uma fatia
                # estreita a fingir que é o todo. Verificar contra o valor
                # REALMENTE gravado, que é o que o utilizador vê ao lado.
                cur.execute(
                    'SELECT revenue FROM fundamentals WHERE "companyId" = %s '
                    'AND "periodType" = %s::"period_type" AND "periodEnd"::date = %s::date',
                    (company_id, ptype, pend),
                )
                _row = cur.fetchone()
                _rev = float(_row[0]) if _row and _row[0] else None
                coerentes[(ptype, pend)] = eixos_coerentes(by_axis, _rev)

            # Um eixo para a empresa toda (ver eixo_da_empresa): decidido
            # depois de filtrar TODOS os períodos, senão a escolha via
            # eixos que nunca chegam a ser gravados.
            eixo = eixo_da_empresa(coerentes)
            if args.dry_run or eixo != "segment":
                print(f"    {ticker}: eixo do gráfico de segmentos = {eixo}", flush=True)
            if not args.dry_run:
                if args.wipe_first:
                    cur.execute(
                        'UPDATE fundamentals SET "revenueSegments" = NULL, '
                        '"revenueSegmentsByAxis" = NULL WHERE "companyId" = %s',
                        (company_id,),
                    )
                for (ptype, pend), by_axis in coerentes.items():
                    if not by_axis:
                        stats["cobertura_insuficiente"] += 1
                        cur.execute(
                            'UPDATE fundamentals SET "revenueSegments" = NULL, "revenueSegmentsByAxis" = NULL '
                            'WHERE "companyId" = %s AND "periodType" = %s::"period_type" '
                            'AND "periodEnd"::date = %s::date',
                            (company_id, ptype, pend),
                        )
                        continue
                    # Período sem o eixo da empresa: fica sem barra no gráfico
                    # de segmentos (um buraco é verdade; outro eixo era mentira),
                    # mas os eixos que tem continuam gravados — a geografia
                    # desse ano ainda serve o gráfico circular.
                    primary = by_axis.get(eixo) if eixo else None
                    cur.execute(
                        'UPDATE fundamentals SET "revenueSegments" = %s, '
                        '"revenueSegmentsByAxis" = %s '
                        'WHERE "companyId" = %s AND "periodType" = %s::"period_type" '
                        'AND "periodEnd"::date = %s::date',
                        (json.dumps(primary) if primary else None, json.dumps(by_axis),
                         company_id, ptype, pend),
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
