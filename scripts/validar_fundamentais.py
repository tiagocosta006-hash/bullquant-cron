"""
Validação dos fundamentais ANTES de gravar — a rede de segurança do motor.

Regra de ouro do projeto: antes N/A do que errado. Cada linha que sai do motor
passa por aqui. Há dois níveis:

  anular     o valor é impossível ou contradiz outros valores da mesma empresa de
             forma que se sabe qual está errado → fica None (N/A no site) e o
             motivo vai para o relatório. Ex.: ações ≤ 0, lucro bruto > receita,
             dividendo anual menor do que a soma de três trimestres.

  sinalizar  há uma incoerência mas não se sabe qual dos números está errado
             (ativo ≠ passivo + capital, EPS ≠ lucro/ações, salto ×10 que pode
             ser real) → o valor fica, e o caso vai para o relatório. É a fila
             de revisão (Claude/Gemini com prova no relatório da empresa →
             scripts/correcoes.json).

Corre em process_company depois de build_row e ANTES das correções revistas
(uma correção revista tem prova e passa por cima de tudo). O relatório de cada
corrida fica em scripts/.cache/validacao.json.
"""
from __future__ import annotations

import json
import os
from collections import Counter, defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
RELATORIO = os.path.join(AQUI, ".cache", "validacao.json")

# Campos que nunca podem ser negativos (capex e dividendos guardam-se positivos).
NAO_NEGATIVOS = ("totalAssets", "cash", "totalDebt", "capex", "dividendPerShare",
                 "sharesOutstanding", "inventory", "accountsReceivable")
# Fluxos em que FY tem de ser ≈ Q1+Q2+Q3+Q4 quando os quatro foram extraídos.
FLUXOS = ("revenue", "netIncome", "operatingCashFlow")

_alertas: list[dict] = []


def _a(ticker, row, campo, nivel, motivo, **extra):
    _alertas.append({"ticker": ticker, "periodo": _periodo(row), "campo": campo,
                     "nivel": nivel, "motivo": motivo,
                     # data do filing: o relatório dos filings NOVOS filtra por ela
                     "filed": str(row.get("filedAt") or "")[:10] or None, **extra})


def _periodo(row):
    q = row.get("fiscalQuarter")
    return f"{row.get('fiscalYear')}{'Q' + str(q) if q else 'FY'}"


def _perto(a, b, tol):
    base = max(abs(a), abs(b))
    return base == 0 or abs(a - b) / base <= tol


def _recalcular(row):
    if row.get("operatingCashFlow") is not None and row.get("capex") is not None:
        row["freeCashFlow"] = row["operatingCashFlow"] - row["capex"]
    elif row.get("capex") is None:
        row["freeCashFlow"] = None
    rev = row.get("revenue")
    for m, base in (("grossMargin", "grossProfit"), ("operatingMargin", "operatingIncome"),
                    ("netMargin", "netIncome")):
        if m in row:
            row[m] = (row[base] / rev) if (row.get(base) is not None and rev) else None


def validar(ticker: str, rows: list[dict], setor: str | None = None) -> None:
    """Valida e corrige `rows` no lugar; os alertas acumulam para o relatório."""
    for row in rows:
        mudou = False
        # 1. Impossíveis
        for c in NAO_NEGATIVOS:
            v = row.get(c)
            if v is not None and (v < 0 or (c == "sharesOutstanding" and v == 0)):
                _a(ticker, row, c, "anular", "valor negativo impossível", valor=v)
                row[c] = None
                mudou = True
        rev, gp = row.get("revenue"), row.get("grossProfit")
        if rev is not None and rev < 0 and setor != "Financials":
            _a(ticker, row, "revenue", "anular", "receita negativa", valor=rev)
            row["revenue"] = None
            mudou = True
        if gp is not None and rev and rev > 0 and gp > rev * 1.001:
            _a(ticker, row, "grossProfit", "anular", "lucro bruto maior do que a receita", valor=gp, receita=rev)
            row["grossProfit"] = None
            mudou = True
        if mudou:
            _recalcular(row)

        # 2. Incoerências que se sinalizam
        ta, tl, te = row.get("totalAssets"), row.get("totalLiabilities"), row.get("totalEquity")
        if ta and tl is not None and te is not None:
            # minoritários: o que o motor leu, ou capital total − capital dos acionistas
            mi = row.get("minorityInterest") or row.get("_minoritarios")
            if mi is None and row.get("_capitalTotal") is not None:
                mi = row["_capitalTotal"] - te
            mi = (mi or 0) + max(row.get("_capitalTemporario") or 0, 0)
            if not _perto(ta, tl + te + mi, 0.02):
                _a(ticker, row, "totalLiabilities", "sinalizar",
                   "ativo ≠ passivo + capital próprio + minoritários (>2%)",
                   ativo=ta, soma=tl + te + mi)
        eps, ni, sh = row.get("epsDiluted"), row.get("netIncome"), row.get("sharesOutstanding")
        if eps is not None and ni is not None and sh and abs(eps) >= 0.10:
            implicito = ni / sh
            if not _perto(eps, implicito, 0.5) and abs(eps - implicito) > 0.10:
                _a(ticker, row, "epsDiluted", "sinalizar", "EPS muito diferente de lucro/ações",
                   eps=eps, implicito=round(implicito, 4))

    _dividendos(ticker, rows)
    _soma_trimestres(ticker, rows)
    _saltos(ticker, rows)


def _por_ano(rows):
    d = defaultdict(dict)
    for r in rows:
        d[r["fiscalYear"]][r.get("fiscalQuarter") or 0] = r
    return d


def _dividendos(ticker, rows):
    """Dividendo anual menor do que três trimestres: o anual é um trimestre mal etiquetado
    (IBKR, AMAT, COO tagam o dividendo de um trimestre com o período do ano). O Q4 foi
    derivado dele, por isso também cai. Os trimestres extraídos ficam."""
    for fy, ps in _por_ano(rows).items():
        anual = ps.get(0)
        qs = [ps.get(q) for q in (1, 2, 3)]
        if not anual or any(q is None for q in qs):
            continue
        fv = anual.get("dividendPerShare")
        vals = [q.get("dividendPerShare") for q in qs]
        if fv is None or any(v is None for v in vals):
            continue
        s3 = sum(vals)
        if s3 > 0 and fv < s3 * 0.99:
            _a(ticker, anual, "dividendPerShare", "anular",
               "dividendo anual menor do que a soma de três trimestres", anual=fv, tres_trimestres=s3)
            anual["dividendPerShare"] = None
            if ps.get(4) is not None:
                ps[4]["dividendPerShare"] = None


def _soma_trimestres(ticker, rows):
    for fy, ps in _por_ano(rows).items():
        if 0 not in ps or not all(q in ps for q in (1, 2, 3, 4)):
            continue
        for c in FLUXOS:
            fv = ps[0].get(c)
            qv = [ps[q].get(c) for q in (1, 2, 3, 4)]
            if fv is None or any(v is None for v in qv):
                continue
            if not _perto(fv, sum(qv), 0.02) and abs(fv - sum(qv)) > 1e6:
                _a(ticker, ps[0], c, "sinalizar", "ano ≠ soma dos quatro trimestres (>2%)",
                   ano=fv, soma=sum(qv))


def _saltos(ticker, rows):
    """Um ano 8× acima/abaixo dos DOIS vizinhos, que entre si são parecidos: típico de
    escala errada (milhares vs unidades) ou de uma tag de outra entidade."""
    anuais = sorted((r for r in rows if r.get("periodType") == "ANNUAL"), key=lambda r: r["fiscalYear"])
    for c in ("revenue", "totalAssets", "totalEquity", "netIncome", "sharesOutstanding", "totalDebt", "cash"):
        for a, b, d in zip(anuais, anuais[1:], anuais[2:]):
            x, y, z = a.get(c), b.get(c), d.get(c)
            if not x or not y or not z or x * z <= 0:
                continue
            if 0.5 <= abs(x / z) <= 2 and (abs(y / x) >= 8 or abs(y / x) <= 1 / 8):
                _a(ticker, b, c, "sinalizar", "salto ×8 face aos dois anos vizinhos",
                   antes=x, valor=y, depois=z)


def relatorio(gravar: bool = True) -> dict:
    por_nivel = Counter(a["nivel"] for a in _alertas)
    por_motivo = Counter((a["nivel"], a["motivo"]) for a in _alertas)
    resumo = {"total": len(_alertas), "por_nivel": dict(por_nivel),
              "por_motivo": [{"nivel": n, "motivo": m, "casos": c} for (n, m), c in por_motivo.most_common()]}
    if gravar:
        os.makedirs(os.path.dirname(RELATORIO), exist_ok=True)
        with open(RELATORIO, "w") as fh:
            json.dump({**resumo, "alertas": _alertas}, fh, ensure_ascii=False, indent=1)
    return resumo
