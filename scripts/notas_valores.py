"""
Notas por valor dos fundamentais — o "mini aviso" que o site mostra junto a um número.

Decisão do produto (Costa, 2026-11-18): mostramos sempre o valor correto; cada
valor que não é o publicado tal e qual leva uma nota com o motivo e o link do
relatório. Dois tipos:

  reexpressao  a empresa voltou a publicar o número mais tarde (spin-off,
               alteração contabilística). Mostramos o mais recente; a nota diz
               qual era o original e quando foi publicado. Automático: o XBRL
               da SEC tem as duas versões com data — não há IA nenhuma aqui.

  correcao     a fonte estava errada e corrigimos. Só entra o que está em
               scripts/correcoes.json com "revisto": true — cada correção
               levou citação do relatório oficial e revisão humana/Claude.
               Um palpite sem fonte nunca chega ao site.

Usado por ingest_fundamentals.process_company: as correções aplicam-se às
linhas antes de gravar; as notas gravam-se na MESMA transação das linhas.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import uuid

AQUI = os.path.dirname(os.path.abspath(__file__))
CORRECOES_PATH = os.path.join(AQUI, "correcoes.json")

# Campos monetários em que a reexpressão é detetável com segurança: o valor da
# linha tem de ser exatamente o de UMA tag no filing mais recente. Somas
# (caixa + aplicações, dívida) não casam com nenhuma tag e ficam sem nota — é
# preferível a uma nota errada.
CAMPOS_REEXPRESSAO = {
    "duracao": ["revenue", "grossProfit", "operatingIncome", "netIncome", "operatingCashFlow", "capex"],
    "instante": ["totalAssets", "totalLiabilities", "totalEquity"],
}
FORMS = ("10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F")
TOL = 0.005


# ── utilitários ────────────────────────────────────────────────────────────
def _d(s) -> dt.date:
    return s if isinstance(s, dt.date) else dt.date.fromisoformat(str(s)[:10])


def _fmt(v: float) -> str:
    a = abs(v)
    if a >= 1e9:
        return f"{v / 1e9:,.2f} mil M".replace(",", " ").replace(".", ",")
    if a >= 1e6:
        return f"{v / 1e6:,.0f} M".replace(",", " ")
    return f"{v:,.2f}".replace(",", " ").replace(".", ",")


def _fmt_en(v: float) -> str:
    a = abs(v)
    if a >= 1e9:
        return f"{v / 1e9:,.2f}B"
    if a >= 1e6:
        return f"{v / 1e6:,.0f}M"
    return f"{v:,.2f}"


def _url_filing(cik: str, accn: str | None) -> str | None:
    if not accn:
        return None
    return f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accn.replace('-', '')}/"


def _chave(row) -> tuple:
    return (row["periodType"], row["fiscalYear"], row.get("fiscalQuarter"))


# ── correções revistas ─────────────────────────────────────────────────────
def carregar_correcoes() -> list[dict]:
    try:
        with open(CORRECOES_PATH, encoding="utf-8") as f:
            dados = json.load(f)
    except (OSError, ValueError):
        return []
    return [c for c in dados if isinstance(c, dict) and c.get("revisto") is True]


def _recalcular_derivados(row: dict) -> None:
    """Margens e FCF dependem dos campos corrigíveis — recalcular depois de corrigir."""
    rev = row.get("revenue")

    def div(a, b):
        return a / b if a is not None and b not in (None, 0) else None

    if rev:
        for campo, base in (("grossMargin", "grossProfit"), ("operatingMargin", "operatingIncome"),
                            ("netMargin", "netIncome")):
            if row.get(base) is not None:
                row[campo] = div(row[base], rev)
    if row.get("operatingCashFlow") is not None and row.get("capex") is not None:
        row["freeCashFlow"] = row["operatingCashFlow"] - row["capex"]


def aplicar_correcoes(ticker: str | None, rows: list[dict]) -> list[dict]:
    """Aplica às linhas as correções revistas deste ticker; devolve as notas."""
    if not ticker:
        return []
    minhas = [c for c in carregar_correcoes() if c.get("ticker") == ticker]
    if not minhas:
        return []
    por_chave = {_chave(r): r for r in rows}
    notas = []
    for c in minhas:
        row = por_chave.get((c.get("periodType"), c.get("fiscalYear"), c.get("fiscalQuarter")))
        campo = c.get("field")
        if row is None or not campo or c.get("valor") is None:
            continue
        antes = row.get(campo)
        row[campo] = float(c["valor"])
        _recalcular_derivados(row)
        notas.append({
            "periodType": row["periodType"], "fiscalYear": row["fiscalYear"],
            "fiscalQuarter": row.get("fiscalQuarter"), "field": campo, "kind": "correcao",
            "valueSource": antes, "valueShown": row[campo],
            "reasonPt": c.get("motivoPt") or "", "reasonEn": c.get("motivoEn") or "",
            "sourceUrl": c.get("fonteUrl"), "accession": c.get("accession"), "reviewed": True,
        })
    return notas


# ── reexpressões (automáticas) ─────────────────────────────────────────────
def _factos_periodo(linhas: list, fim: dt.date, duracao_dias: tuple | None):
    out = []
    for f in linhas:
        if f.get("form") not in FORMS:
            continue
        try:
            if abs((_d(f["end"]) - fim).days) > 5:
                continue
            if duracao_dias:
                if "start" not in f:
                    continue
                dias = (_d(f["end"]) - _d(f["start"])).days
                if not duracao_dias[0] <= dias <= duracao_dias[1]:
                    continue
            elif "start" in f:
                continue
            out.append(f)
        except (KeyError, ValueError):
            continue
    return out


def notas_reexpressao(facts_json: dict, cik: str, rows: list[dict], tags: dict[str, list[str]],
                      moeda: str | None) -> list[dict]:
    """Uma nota por (período, campo) em que o valor mostrado é uma reexpressão.

    Só empresas que reportam em USD: com câmbio, o valor da linha já não é o
    da tag e a comparação deixaria de ser fiável. (O motor não guarda a taxa
    por linha.)
    """
    if (moeda or "USD") != "USD":
        return []
    facts = facts_json.get("facts") or {}
    ns = facts.get("us-gaap") or {}
    notas = []
    for row in rows:
        try:
            fim = _d(row["periodEnd"])
        except (KeyError, ValueError, TypeError):
            continue
        anual = row["periodType"] == "ANNUAL"
        for grupo, campos in CAMPOS_REEXPRESSAO.items():
            dur = ((340, 380) if anual else (80, 100)) if grupo == "duracao" else None
            for campo in campos:
                valor = row.get(campo)
                if valor is None or valor == 0:
                    continue
                for tag in tags.get(campo, []):
                    linhas = ((ns.get(tag) or {}).get("units") or {}).get("USD") or []
                    fs = _factos_periodo(linhas, fim, dur)
                    if len(fs) < 2:
                        continue
                    fs.sort(key=lambda f: f.get("filed") or "")
                    ultimo, primeiro = fs[-1], fs[0]
                    v_ult, v_pri = float(ultimo["val"]), float(primeiro["val"])
                    # o valor mostrado tem de ser o desta tag no filing mais recente
                    # (capex: o motor guarda-o positivo)
                    if not any(abs(abs(valor) - abs(x)) <= abs(x) * TOL for x in (v_ult,)):
                        continue
                    if v_pri == 0 or abs(v_ult - v_pri) <= abs(v_pri) * TOL:
                        break  # é esta tag, e não houve reexpressão
                    sinal = 1 if (valor >= 0) == (v_ult >= 0) else -1
                    original = v_pri * sinal
                    d_ult, d_pri = ultimo.get("filed"), primeiro.get("filed")
                    notas.append({
                        "periodType": row["periodType"], "fiscalYear": row["fiscalYear"],
                        "fiscalQuarter": row.get("fiscalQuarter"), "field": campo, "kind": "reexpressao",
                        "valueSource": original, "valueShown": valor,
                        "reasonPt": (f"Valor reexpresso pela empresa no relatório entregue a {d_ult}. "
                                     f"O valor publicado originalmente ({d_pri}) era {_fmt(original)}."),
                        "reasonEn": (f"Value restated by the company in the filing of {d_ult}. "
                                     f"The originally reported value ({d_pri}) was {_fmt_en(original)}."),
                        "sourceUrl": _url_filing(cik, ultimo.get("accn")), "accession": ultimo.get("accn"),
                        "reviewed": True,
                    })
                    break
    return notas


# ── gravação ───────────────────────────────────────────────────────────────
DEFINICOES = {
    ("capex", "inclui_aquisicoes"): (
        "Neste REIT o capex inclui compras de imóveis já existentes: o relatório não separa o "
        "investimento em desenvolvimento e melhorias. O free cash flow fica por isso mais baixo do que "
        "o de REITs que o separam.",
        "For this REIT, capex includes purchases of existing properties: the filing does not separate "
        "development and improvement spending. Free cash flow is therefore lower than for REITs that do."),
}


def notas_definicao(rows: list[dict]) -> list[dict]:
    """Avisos de definição marcados pelo motor nas linhas (chaves "_nota<Campo>")."""
    notas = []
    for row in rows:
        for chave, motivo in list(row.items()):
            if not chave.startswith("_nota") or not motivo:
                continue
            campo = chave[5].lower() + chave[6:]
            textos = DEFINICOES.get((campo, motivo))
            if not textos:
                continue
            notas.append({
                "periodType": row["periodType"], "fiscalYear": row["fiscalYear"],
                "fiscalQuarter": row.get("fiscalQuarter"), "field": campo, "kind": "definicao",
                "valueSource": None, "valueShown": row.get(campo),
                "reasonPt": textos[0], "reasonEn": textos[1], "sourceUrl": None, "accession": None,
                "reviewed": True,
            })
    return notas


def gravar_notas(cur, company_id: str, notas: list[dict]) -> None:
    """Apaga e regrava as notas da empresa (chamar dentro da transação das linhas). Sem RETURNING."""
    cur.execute('DELETE FROM fundamental_notes WHERE "companyId" = %s', (company_id,))
    agora = dt.datetime.utcnow()
    for n in notas:
        cur.execute(
            '''INSERT INTO fundamental_notes (id, "companyId", "periodType", "fiscalYear", "fiscalQuarter",
                   field, kind, "valueSource", "valueShown", "reasonPt", "reasonEn", "sourceUrl",
                   accession, reviewed, "createdAt", "updatedAt")
               VALUES (%s, %s, %s::"period_type", %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)''',
            (uuid.uuid4().hex, company_id, n["periodType"], n["fiscalYear"], n.get("fiscalQuarter"),
             n["field"], n["kind"], n.get("valueSource"), n.get("valueShown"), n["reasonPt"],
             n["reasonEn"], n.get("sourceUrl"), n.get("accession"), bool(n.get("reviewed")), agora, agora),
        )
