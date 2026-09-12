#!/usr/bin/env python3
"""
ingest_prices_euronext.py — histórico de cotações da FONTE OFICIAL: a Euronext.

PORQUÊ ESTA FONTE:
  A Euronext é a bolsa onde estas ações efetivamente negoceiam, portanto é o
  dado primário — não uma redistribuição. O site expõe um botão "Download
  historical data" para qualquer utilizador, e é esse mesmo endpoint que se usa
  aqui, com os mesmos parâmetros que o browser envia.

  As alternativas foram testadas e descartadas: a Stooq protege-se com um
  desafio de prova de trabalho (contorná-lo seria furar um controlo
  deliberado), a Boerse Frankfurt exige pedidos assinados, e a Finnhub só dá
  histórico em plano pago. As agregadoras com chave gratuita (Twelve Data,
  Alpha Vantage) funcionam mas são intermediários — a bolsa é melhor.

DUAS SUBTILEZAS que custaram a descobrir:
  1. O parâmetro `format` tem de ir na QUERY STRING. Enviado só no corpo, o
     servidor responde "No format specified" — e é fácil concluir, por engano,
     que o endpoint não funciona.
  2. É preciso COOKIE DE SESSÃO. Visita-se primeiro a página do produto para o
     obter; sem ele o download é recusado.

  O ficheiro vem com BOM, cabeçalho de três linhas antes da linha de colunas,
  ponto e vírgula como separador e datas em dd/mm/aaaa.

JANELA — LIMITE REAL DA FONTE: o download devolve SEMPRE as últimas ~2 anos
(508 sessões) e IGNORA qualquer parâmetro de datas. Testados sem efeito:
startdate/enddate, from/to, dateFrom/dateTo, startDate/endDate — o cabeçalho do
CSV continua a dizer a mesma janela. O gráfico da própria Euronext tem
seletores de 5 e 10 anos, mas esse endpoint devolve payload CIFRADO (campos
ct/iv/s), ou seja é protegido de propósito.

  Conclusão honesta: por esta via oficial há dois anos de histórico diário, não
  mais. Para séries longas seria preciso uma licença de dados de mercado da
  bolsa, ou um agregador. Dois anos chegam para contexto de cotação e múltiplos
  correntes; não chegam para gráficos de 10 anos.

Uso:
  python scripts/ingest_prices_euronext.py --isin FR0014003TT8 --ticker DSY --dry-run
  python scripts/ingest_prices_euronext.py --isin FR0014003TT8 --ticker DSY --anos 10
"""
import argparse
import csv
import datetime as dt
import io
import os
import sys

import bisect

import requests
import psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, "..", ".env.dev"))
DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

sys.path.insert(0, HERE)
from ingest_fundamentals import get_fx_series  # noqa: E402

BASE = "https://live.euronext.com"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")


def sessao(isin: str, mic: str) -> requests.Session:
    """Sessão com o cookie que o download exige."""
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    s.get(f"{BASE}/en/product/equities/{isin}-{mic}/market-information", timeout=60)
    return s


def descarregar(s: requests.Session, isin: str, mic: str,
                inicio: dt.date | None = None, fim: dt.date | None = None) -> str:
    corpo = {"format": "csv", "decimal_separator": ".", "date_form": "d/m/Y", "op": "Download"}
    if inicio and fim:
        corpo["startdate"] = inicio.isoformat()
        corpo["enddate"] = fim.isoformat()
    r = s.post(
        f"{BASE}/en/ajax/AwlHistoricalPrice/getFullDownloadAjax/{isin}-{mic}",
        params={"format": "csv"},          # <- TEM de ir na query string
        data=corpo,
        headers={"X-Requested-With": "XMLHttpRequest"},
        timeout=120,
    )
    r.raise_for_status()
    return r.content.decode("utf-8-sig", errors="replace")


def parse(texto: str) -> dict:
    """{data: (open, high, low, close, volume)} — ignora o cabeçalho de 3 linhas."""
    linhas = texto.splitlines()
    inicio = next((i for i, l in enumerate(linhas) if l.startswith("Date;")), None)
    if inicio is None:
        return {}
    out = {}
    for row in csv.DictReader(io.StringIO("\n".join(linhas[inicio:])), delimiter=";"):
        try:
            d = dt.datetime.strptime(row["Date"].strip(), "%d/%m/%Y").date()
        except (ValueError, KeyError, AttributeError):
            continue

        def num(campo):
            v = (row.get(campo) or "").strip().replace(" ", "")
            try:
                return float(v) if v and v != "-" else None
            except ValueError:
                return None

        fecho = num("Close") if num("Close") is not None else num("Last")
        if fecho is None:
            continue          # sem fecho a linha não serve (a coluna é NOT NULL)
        vol = num("Number of Shares")
        out[d] = (num("Open"), num("High"), num("Low"), fecho,
                  int(vol) if vol is not None else None)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--isin", required=True)
    ap.add_argument("--ticker", required=True)
    ap.add_argument("--mic", default="XPAR", help="XPAR Paris, XAMS Amesterdão, XBRU Bruxelas, XLIS Lisboa")
    ap.add_argument("--moeda", default="EUR",
                    help="moeda de cotação da praça (EUR na Euronext continental)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    s = sessao(args.isin, args.mic)
    # Um único pedido: paginar por datas não serve de nada porque o endpoint
    # ignora os parâmetros de intervalo (ver nota da JANELA no cabeçalho).
    tudo = parse(descarregar(s, args.isin, args.mic))

    if not tudo:
        sys.exit("nenhuma cotação obtida")

    # A Euronext cota em EUR e TODOS os fundamentais da BD estão em USD. Sem
    # converter, a capitalização (ações x preço) e o P/E misturavam moedas —
    # a Dassault ficava ~15% mais barata do que é. Converte-se à taxa do dia.
    if args.moeda != "USD":
        fx_datas, fx_taxas = get_fx_series(args.moeda)
        if not fx_datas:
            sys.exit(f"sem série FX para {args.moeda}")
        conv = {}
        for d, (o, h, l, c, v) in tudo.items():
            i = bisect.bisect_right(fx_datas, d.isoformat()) - 1
            t = fx_taxas[max(i, 0)]
            conv[d] = (o * t if o else None, h * t if h else None,
                       l * t if l else None, c * t, v)
        tudo = conv
        print(f"convertido de {args.moeda} para USD à taxa diária do BCE")

    datas = sorted(tudo)
    print(f"\n{len(tudo)} sessões, de {datas[0]} a {datas[-1]}")
    print(f"  primeira: {tudo[datas[0]]}")
    print(f"  última:   {tudo[datas[-1]]}")

    if args.dry_run:
        print("\nDry-run — nada escrito.")
        return

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    for d in datas:
        o, h, l, c, v = tudo[d]
        cur.execute(
            """INSERT INTO prices (ticker, date, open, high, low, close, volume)
               VALUES (%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (ticker, date) DO UPDATE SET
                 open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
                 close=EXCLUDED.close, volume=EXCLUDED.volume""",
            (args.ticker, d, o, h, l, c, v),
        )
    conn.commit()
    cur.execute('UPDATE companies SET "lastPriceUpdate" = NOW() WHERE ticker = %s', (args.ticker,))
    conn.commit()
    print(f"\n{len(datas)} sessões gravadas para {args.ticker}.")
    conn.close()


if __name__ == "__main__":
    main()
