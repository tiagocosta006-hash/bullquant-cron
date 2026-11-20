"""
factos_em_falta.py — Os filings que o companyfacts da SEC não tem.

O motor lê os factos de cada empresa do companyfacts (data.sec.gov/api/xbrl/companyfacts),
que a SEC monta a partir dos filings. Verificado a 20/11/2026: há filings 10-Q/10-K que
NUNCA lá entram — o 10-Q de julho/2026 da EIX, os 10-Q do Q2 e Q3/2026 da XOM e da NEE,
todos os de 2026 da FANG… (249 dos 3.945 filings de 2025-26 das nossas empresas, quase todos
desde julho/2026; a API em direto confirma — não é cache nossa). Sem eles:
  · o trimestre inteiro desaparece da base (78 períodos desde abril/2026);
  · os fluxos de caixa do trimestre SEGUINTE ficam vazios, porque o valor de 3 meses é
    acumulado − acumulado do trimestre anterior, e esse acumulado estava no filing em falta.

Aqui lê-se o XBRL desses filings (edgartools) e convertem-se os factos SEM dimensões das
taxonomias padrão (us-gaap, ifrs-full, dei, srt) para o formato do companyfacts — as mesmas
entradas {start, end, val, accn, fy, fp, form, filed} nas mesmas unidades (USD, shares,
USD/shares, pure). O motor não muda: todas as regras se aplicam igual.

Cache por filing em scripts/.cache/factos_filings/{accn}.json.gz (cada XBRL lê-se uma vez).
"""
from __future__ import annotations

import datetime as dt
import gzip
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTA = os.path.join(AQUI, ".cache", "factos_filings")
FORMS = ("10-K", "10-Q", "10-K/A", "10-Q/A", "20-F", "40-F")
NAMESPACES = ("us-gaap", "ifrs-full", "dei", "srt")
ANOS = 3  # só os filings recentes: os buracos conhecidos são de 2025-26


def _unidade(unit_ref, unidades: dict) -> str | None:
    """unit_ref do instance → chave de unidade do companyfacts (USD, shares, USD/shares, pure)."""
    u = unidades.get(unit_ref) if unit_ref else None
    if not u:
        return None
    def medida(m):
        m = str(m)
        return m.split(":", 1)[1] if ":" in m else m
    if u.get("type") == "divide":
        num, den = u.get("numerator") or [], u.get("denominator") or []
        if len(num) == 1 and len(den) == 1:
            return f"{medida(num[0])}/{medida(den[0])}"
        return None
    m = u.get("measure")
    return medida(m) if m else None


def factos_do_filing(xbrl, accn: str, form: str, filed: str) -> dict:
    """{namespace: {tag: {"units": {unidade: [entrada, ...]}}}} no formato do companyfacts."""
    info = getattr(xbrl, "entity_info", None) or {}
    try:
        fy = int(info.get("fiscal_year")) if info.get("fiscal_year") else None
    except (TypeError, ValueError):
        fy = None
    fp = info.get("fiscal_period") or None
    unidades = getattr(xbrl, "units", None) or {}
    df = xbrl.facts.to_dataframe()
    out: dict = {}
    vistos = set()
    for r in df.itertuples(index=False):
        if getattr(r, "is_dimensioned", False) is True:
            continue
        ns, _, tag = str(r.concept).partition(":")
        if ns not in NAMESPACES or not tag:
            continue
        v = r.numeric_value
        if v is None or v != v:
            continue
        un = _unidade(r.unit_ref, unidades)
        if not un:
            continue
        if r.period_type == "instant":
            fim, ini = str(r.period_instant)[:10], None
        else:
            fim, ini = str(r.period_end)[:10], str(r.period_start)[:10]
        if not fim or fim == "nan" or ini == "nan":
            continue
        chave = (ns, tag, un, ini, fim)
        if chave in vistos:   # o mesmo facto repetido no instance (decimais diferentes)
            continue
        vistos.add(chave)
        e = {"end": fim, "val": int(v) if float(v).is_integer() else float(v), "accn": accn,
             "fy": fy, "fp": fp, "form": form, "filed": filed}
        if ini:
            e["start"] = ini
        out.setdefault(ns, {}).setdefault(tag, {"units": {}})["units"].setdefault(un, []).append(e)
    return out


# ── DPS publicado só com dimensões ─────────────────────────────────────────────
# Muitas empresas dão o dividendo por ação SÓ por classe de ações (BKR, TSN, ERIE, LEN,
# FOXA, STZ, HSY) ou por dividendo declarado (SBAC, TKO, EXE) — o companyfacts descarta
# factos com dimensões e o DPS ficava N/A apesar de impresso (391 filings de 85 empresas
# desde nov/2023). Lê-se o XBRL desses filings (só dos que pagaram dividendos e não têm
# DPS sem dimensões) e escolhe-se, por regra geral:
#   classe de ações  → ação ordinária (CommonStockMember), senão classe A; uma classe B
#                      sozinha não (TKO dá 0 na B, que não cota);
#   dividendo        → soma dos dividendos distintos do período (valores repetidos em
#                      membros diferentes contam uma vez — TKO repete o mesmo 0,79);
#   outra dimensão, ou duas cruzadas → nada (N/A).
DPS_TAGS = ("CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid", "DividendsPerShare")
DIV_TAGS = ("PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "PaymentsOfOrdinaryDividends")
_CLASSE_PREF = ("us-gaap:CommonStockMember", "us-gaap:CommonClassAMember")


def dps_dimensionado(xbrl, accn: str, form: str, filed: str) -> dict:
    """{"us-gaap": {tag: {"units": {"USD/shares": [entrada]}}}} com o DPS escolhido por regra."""
    info = getattr(xbrl, "entity_info", None) or {}
    try:
        fy = int(info.get("fiscal_year")) if info.get("fiscal_year") else None
    except (TypeError, ValueError):
        fy = None
    fp = info.get("fiscal_period") or None
    df = xbrl.facts.to_dataframe()
    dims = [c for c in df.columns if c.startswith("dim_")]
    df = df.assign(ndims=df[dims].notna().sum(axis=1) if dims else 0)
    grupos: dict = {}
    for r in df.itertuples(index=False):
        ns, _, tag = str(r.concept).partition(":")
        if ns != "us-gaap" or tag not in DPS_TAGS or getattr(r, "is_dimensioned", False) is not True:
            continue
        if r.period_type != "duration" or r.numeric_value != r.numeric_value:
            continue
        if r.ndims > 1:
            continue   # duas dimensões cruzadas
        eixo, membro = str(r.dimension or ""), str(r.member or "")
        grupos.setdefault((tag, str(r.period_start)[:10], str(r.period_end)[:10]), []).append(
            (eixo, membro, float(r.numeric_value)))
    out: dict = {}
    for (tag, ini, fim), xs in grupos.items():
        eixos = {e for e, _, _ in xs}
        if len(eixos) != 1:
            continue
        eixo = eixos.pop()
        v = None
        if eixo.endswith("StatementClassOfStockAxis"):
            por = {m: val for _, m, val in xs}
            for m in _CLASSE_PREF:
                if m in por:
                    v = por[m]
                    break
        elif "Dividend" in eixo:
            v = sum({round(val, 6) for _, _, val in xs})
        if v is None:
            continue
        e = {"start": ini, "end": fim, "val": v, "accn": accn, "fy": fy, "fp": fp, "form": form, "filed": filed}
        out.setdefault("us-gaap", {}).setdefault(tag, {"units": {}})["units"].setdefault("USD/shares", []).append(e)
    return out


def _sem_dps_com_dividendos(facts_json: dict, desde: str) -> set:
    """accns de 10-K/10-Q que pagaram dividendos e não têm DPS nenhum sem dimensões."""
    g = (facts_json.get("facts") or {}).get("us-gaap") or {}
    pagaram, com_dps = set(), set()
    for t in DIV_TAGS:
        for es in (g.get(t, {}).get("units") or {}).values():
            for e in es:
                if (e.get("filed") or "") >= desde and (e.get("val") or 0) > 0:
                    pagaram.add(e.get("accn"))
    for t in DPS_TAGS:
        for es in (g.get(t, {}).get("units") or {}).values():
            com_dps.update(e.get("accn") for e in es)
    return pagaram - com_dps


def _accns(facts_json: dict) -> set:
    return {e.get("accn") for ns in (facts_json.get("facts") or {}).values()
            for n in ns.values() for es in (n.get("units") or {}).values() for e in es}


def juntar(facts_json: dict, extra: dict) -> int:
    """Junta os factos de um filing ao companyfacts. Devolve o nº de entradas juntas."""
    facts = facts_json.setdefault("facts", {})
    n = 0
    for ns, tags in extra.items():
        for tag, node in tags.items():
            dst = facts.setdefault(ns, {}).setdefault(tag, {"units": {}}).setdefault("units", {})
            for un, es in node["units"].items():
                dst.setdefault(un, []).extend(es)
                n += len(es)
    return n


def _ler_cache(accn):
    try:
        with gzip.open(os.path.join(PASTA, f"{accn}.json.gz"), "rt") as fh:
            return json.load(fh)
    except (OSError, ValueError, EOFError):
        return None


def _gravar_cache(accn, dados):
    os.makedirs(PASTA, exist_ok=True)
    final = os.path.join(PASTA, f"{accn}.json.gz")
    tmp = final + ".tmp"
    with gzip.open(tmp, "wt") as fh:
        json.dump(dados, fh)
    os.replace(tmp, final)   # atómico: um corte a meio nunca deixa um ficheiro truncado


def completar(cik, facts_json: dict, hoje: dt.date | None = None, log=print) -> list[str]:
    """Junta ao companyfacts os filings recentes (10-K/10-Q…) que lá faltam. Nunca falha:
    sem rede ou sem edgartools devolve [] e o motor segue só com o companyfacts."""
    try:
        from edgar import Company, set_identity
        set_identity(os.getenv("SEC_IDENTITY") or os.getenv("SEC_USER_AGENT") or "BullValue admin@bullocracy.com")
        hoje = hoje or dt.date.today()
        desde = (hoje - dt.timedelta(days=365 * ANOS)).isoformat()
        filings = Company(int(cik)).get_filings(form=list(FORMS), filing_date=f"{desde}:")
    except Exception as e:  # noqa: BLE001
        log(f"    factos_em_falta: sem lista de filings ({e!r})")
        return []
    tem = _accns(facts_json)
    sem_dps = _sem_dps_com_dividendos(facts_json, desde)
    juntos = []
    for f in filings:
        accn = str(f.accession_no)
        if accn in sem_dps and str(f.form) in ("10-K", "10-Q"):
            extra = _ler_cache(accn + ".dps")
            if extra is None:
                try:
                    xbrl = f.xbrl()
                    extra = dps_dimensionado(xbrl, accn, f.form, str(f.filing_date)) if xbrl else {}
                except Exception as e:  # noqa: BLE001
                    log(f"    factos_em_falta: DPS de {accn} ilegível ({e!r})")
                    extra = None
                if extra is not None:
                    _gravar_cache(accn + ".dps", extra)
            if extra:
                juntar(facts_json, extra)
                juntos.append(f"DPS {f.form} {f.filing_date}")
        if accn in tem:
            continue
        if not getattr(f, "is_xbrl", True) and not getattr(f, "is_inline_xbrl", True):
            continue
        extra = _ler_cache(accn)
        if extra is None:
            try:
                xbrl = f.xbrl()
                if xbrl is None:
                    continue
                extra = factos_do_filing(xbrl, accn, f.form, str(f.filing_date))
            except Exception as e:  # noqa: BLE001
                log(f"    factos_em_falta: {accn} ilegível ({e!r})")
                continue
            _gravar_cache(accn, extra)
        if extra:
            juntar(facts_json, extra)
            juntos.append(f"{f.form} {f.filing_date}")
    return juntos
