"""
normalize_share_basis.py — Põe toda a série de ações na MESMA base de split.

O PROBLEMA: a Arista fez dois desdobramentos de 4 para 1 (2021 e 2024). Na nossa
base, umas linhas têm zero ajustes aplicados, outras um, outras dois:

    2019 Q1  81,2 M      2019 Q2  81,3 M      2019 Q3  80,8 M
    2019 Q4 323,5 M   ← 4x
    2024 Q1 1 279,4 M ← 16x

Cada linha é internamente COERENTE (ações × EPS = resultado líquido, e todas
passam nesse teste). O que está errado é a série: a base muda a meio, e isso
contamina o P/E histórico, a capitalização e qualquer múltiplo por ação.

A CORREÇÃO: tomar o período mais recente como referência e recuar. Onde o rácio
entre períodos consecutivos for próximo de um fator de split plausível, é
descontinuidade de base — não emissão nem recompra. Uma empresa não quadruplica
as ações em circulação de um trimestre para o outro; recompras e emissões movem
poucos por cento.

As ações e o EPS são escalados em SENTIDOS OPOSTOS pelo mesmo fator, para que
`EPS × ações = resultado líquido` continue a verificar-se em cada linha.

Não precisa de dados externos de splits — o que evita depender do yfinance, cujos
termos proíbem uso comercial.
"""

import os
import sys
import argparse
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

# Só fatores de split LIMPOS e comuns. Deliberadamente conservador: alargar a
# lista gera falsos positivos que corrompem dados corretos —
#   IBKR aparecia com 0,444 / 0,556 / 0,667, que é a conversão gradual de acções
#     Classe A ao longo dos anos, não splits;
#   AMCR com 0,057, que é a fusão com a Bemis em 2019.
# Nenhum dos dois é descontinuidade de base, e reescalá-los estragaria a série.
FATORES = [2, 3, 4, 5, 10]
TOL = 0.015      # 1,5%: um split é exato; a folga só cobre recompras no período
MIN_SALTO = 1.8  # abaixo de 1,8x não se assume split — pode ser emissão real


def fator_split(anterior, atual):
    """Fator de split que explica o salto, ou None se for movimento normal."""
    if not anterior or not atual or anterior <= 0 or atual <= 0:
        return None
    r = atual / anterior
    if MIN_SALTO > r > 1 / MIN_SALTO:
        return None
    for f in FATORES:
        for cand in (f, 1 / f):
            if abs(r - cand) <= TOL * cand:
                return cand
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    if args.tickers:
        wanted = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        cur.execute('SELECT id, ticker FROM companies WHERE ticker = ANY(%s)', (wanted,))
    else:
        cur.execute('SELECT id, ticker FROM companies')
    empresas = cur.fetchall()

    stats = defaultdict(int)
    updates = []

    for cid, tic in empresas:
        # Série trimestral por ordem cronológica: é nela que a descontinuidade
        # se vê. As anuais são reescaladas pelo fator do trimestre respetivo.
        cur.execute(
            'SELECT id, "periodEnd"::date, "sharesOutstanding", "epsDiluted", "netIncome" '
            'FROM fundamentals WHERE "companyId" = %s AND "periodType" = %s::"period_type" '
            'AND "sharesOutstanding" IS NOT NULL AND "sharesOutstanding" > 0 '
            'ORDER BY "periodEnd"', (cid, "QUARTERLY"))
        serie = cur.fetchall()
        if len(serie) < 3:
            continue

        # Recuar a partir do fim: o fator acumulado que cada período precisa
        # para ficar na base do período MAIS RECENTE.
        acumulado = [1.0] * len(serie)
        for i in range(len(serie) - 1, 0, -1):
            f = fator_split(float(serie[i - 1][2]), float(serie[i][2]))
            # DISTINGUIR SPLIT DE FUSÃO. Num desdobramento o número de acções
            # muda e o RESULTADO LÍQUIDO fica igual — a empresa é a mesma. Numa
            # fusão ou cisão mudam os dois. A Viatris saltou de 601 M para
            # 1 207 M acções (exatamente 2x) ao nascer da fusão Mylan+Upjohn:
            # reescalar isso destruiria o histórico real da Mylan.
            if f is not None:
                ni_ant, ni_at = serie[i - 1][4], serie[i][4]
                if ni_ant and ni_at and abs(float(ni_ant)) > 1e6:
                    r_ni = abs(float(ni_at)) / abs(float(ni_ant))
                    if r_ni > 1.6 or r_ni < 0.625:
                        f = None  # o negócio mudou de tamanho: não é split
            # Se houve salto de `f` entre i-1 e i, tudo até i-1 tem de ser
            # multiplicado por f para chegar à base de i.
            acumulado[i - 1] = acumulado[i] * (f if f else 1.0)

        if all(abs(a - 1.0) < 1e-9 for a in acumulado):
            continue  # série já coerente

        # GUARDA DE RESULTADO: só escrever se a série FICAR limpa. Reescalar por
        # um fator detetado não chega — a AMCR oscila 1 593 M → 289 M → 1 444 M
        # → 463 M, que não é um split mas várias bases misturadas, e nenhum fator
        # único a arruma. Se ainda sobrarem saltos grandes, é caso para revisão
        # humana, não para correção automática.
        ajustadas = [float(sh) * f for (_, _, sh, _, _), f in zip(serie, acumulado)]
        pior = max((max(a, b) / min(a, b) for a, b in zip(ajustadas, ajustadas[1:])
                    if a > 0 and b > 0), default=1.0)
        if pior > 1.25:
            stats["rejeitadas_serie_suja"] += 1
            print(f"  {tic}: REJEITADA — após reescalar ainda salta {pior:.1f}x")
            continue

        for (rid, pend, sh, eps, _ni), fator in zip(serie, acumulado):
            if abs(fator - 1.0) < 1e-9:
                continue
            novo_sh = float(sh) * fator
            novo_eps = (float(eps) / fator) if eps is not None else None
            updates.append((novo_sh, novo_eps, rid))
            stats["linhas"] += 1
        stats["empresas"] += 1
        if len(updates) and stats["empresas"] <= 5:
            print(f"  {tic}: fatores {sorted({round(a,3) for a in acumulado})}")

    print(f"\n{stats['empresas']} empresas com base inconsistente | "
          f"{stats['linhas']} linhas a reescalar")
    if updates and args.apply:
        cur.executemany(
            'UPDATE fundamentals SET "sharesOutstanding"=%s, '
            '"epsDiluted"=COALESCE(%s,"epsDiluted") WHERE id=%s', updates)
        conn.commit()
        print(f"{len(updates)} linhas escritas.")
    else:
        print("dry-run: nada escrito (usar --apply).")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
