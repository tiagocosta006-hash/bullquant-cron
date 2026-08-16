"""
validate_prices.py — Primeiro gate de qualidade da tabela `prices`.

A tabela tem 2 058 782 linhas e NUNCA foi validada. Os preços alimentam tudo:
gráficos, capitalização bolsista, todos os múltiplos, retornos e valuation. Um
preço errado não fica contido — propaga-se para o P/E, o EV/EBITDA e o valor
intrínseco de uma empresa.

Regras (todas verificáveis sem fonte externa):

  CLOSE_NAO_POSITIVO  — fecho ≤ 0. Não existe.
  OHLC_INCOERENTE     — máximo abaixo do mínimo, ou fecho fora do intervalo
                        [mínimo, máximo]. Contradição interna da própria linha.
  SALTO_ABSURDO       — variação diária acima de 60% sem ser dia de split.
                        Um salto destes costuma ser um split por ajustar ou um
                        preço com a casa decimal trocada.
  VOLUME_NEGATIVO     — volume negativo.
  SERIE_DESATUALIZADA — sem cotação há mais de 7 dias de calendário num ticker
                        ativo. Apanha o cron parado, que de outra forma só se
                        nota quando um utilizador repara.
  DUPLICADO           — mais de uma linha para o mesmo (ticker, data).

Segue o padrão dos outros gates: compara com uma baseline e só falha com achados
NOVOS, para poder entrar no CI sem bloquear com a dívida já conhecida.
"""

import os
import sys
import json
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

BASELINE = os.path.join(os.path.dirname(__file__), "out", "prices_baseline.json")

# Pseudo-tickers de séries macro (^T10Y2Y, ^CPI_YOY...) não são cotações: têm
# valores negativos legítimos e não têm OHLC nem volume.
FILTRO_REAL = "ticker NOT LIKE '^%'"

REGRAS = {
    "CLOSE_NAO_POSITIVO": f"""
        SELECT ticker, date::text FROM prices
        WHERE {FILTRO_REAL} AND close <= 0""",

    "OHLC_INCOERENTE": f"""
        SELECT ticker, date::text FROM prices
        WHERE {FILTRO_REAL} AND high IS NOT NULL AND low IS NOT NULL
          AND (high < low OR close > high * 1.001 OR close < low * 0.999)""",

    "VOLUME_NEGATIVO": f"""
        SELECT ticker, date::text FROM prices
        WHERE {FILTRO_REAL} AND volume < 0""",

    "DUPLICADO": f"""
        SELECT ticker, date::text FROM prices
        WHERE {FILTRO_REAL} GROUP BY ticker, date HAVING COUNT(*) > 1""",

    # Variação diária extrema. 60% é folgado de propósito: quedas de 40-50% em
    # dia de resultados acontecem; acima de 60% é quase sempre split por ajustar.
    "SALTO_ABSURDO": f"""
        WITH s AS (
          SELECT ticker, date, close,
                 LAG(close) OVER (PARTITION BY ticker ORDER BY date) ant
          FROM prices WHERE {FILTRO_REAL} AND close > 0)
        SELECT ticker, date::text FROM s
        WHERE ant > 0 AND (close / ant > 1.6 OR close / ant < 0.4)""",

    # Cron parado. Compara com a data mais recente da tabela, não com hoje, para
    # não acusar tudo em fins de semana e feriados.
    "SERIE_DESATUALIZADA": f"""
        WITH m AS (SELECT MAX(date) d FROM prices WHERE {FILTRO_REAL}),
             u AS (SELECT ticker, MAX(date) d FROM prices
                   WHERE {FILTRO_REAL} GROUP BY ticker)
        SELECT u.ticker, u.d::text FROM u, m
        WHERE u.d < m.d - INTERVAL '7 days'""",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true",
                    help="grava o estado atual como baseline")
    ap.add_argument("--limit-print", type=int, default=15)
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    achados = []
    contagem = {}
    with conn.cursor() as cur:
        for regra, sql in REGRAS.items():
            cur.execute(sql)
            linhas = cur.fetchall()
            contagem[regra] = len(linhas)
            achados += [f"{t}|{d}|{regra}" for t, d in linhas]
    conn.close()

    print("Achados por regra:")
    for regra, n in sorted(contagem.items(), key=lambda x: -x[1]):
        print(f"  {regra:22s} {n}")

    chaves = sorted(set(achados))
    if args.baseline:
        os.makedirs(os.path.dirname(BASELINE), exist_ok=True)
        with open(BASELINE, "w", encoding="utf-8") as f:
            json.dump({"keys": chaves}, f, indent=0)
        print(f"\nBaseline gravada: {len(chaves)} achados em {BASELINE}")
        return

    base = set()
    if os.path.exists(BASELINE):
        with open(BASELINE, encoding="utf-8") as f:
            base = set(json.load(f)["keys"])
    else:
        print("\n(aviso: sem baseline — todos os achados contam como novos)")

    novos = [k for k in chaves if k not in base]
    resolvidos = len(base - set(chaves))
    print(f"\nTotal: {len(chaves)} | na baseline: {len(chaves) - len(novos)} | "
          f"NOVOS: {len(novos)} | resolvidos vs baseline: {resolvidos}")
    if novos:
        print(f"\nAchados NOVOS (até {args.limit_print}):")
        for k in novos[: args.limit_print]:
            print(f"  {k}")
        sys.exit(1)
    print("✓ Gate passado: zero achados novos.")


if __name__ == "__main__":
    main()
