"""
backfill_logos.py — logótipos em falta, pelo Finnhub.

O seed_companies.py vai buscar o logótipo quando a empresa entra na base, mas
quem entrou por outra via — ou para quem a chamada falhou nesse momento —
ficou sem ele para sempre: não havia nada que voltasse a tentar.

Eram 45 das 559 activas, e nota-se: a grelha do dashboard é a primeira coisa
que alguém vê depois de entrar, e ali um logótipo em falta aparece como uma
inicial dentro de um quadrado cinzento ao lado de dezenas de marcas.

Escreve APENAS onde `logoUrl` está a NULL — nunca substitui um que já exista.

Verifica o URL antes de o gravar. Um logótipo partido é pior do que a inicial:
o componente CompanyLogo tem `onError` e cai para a letra, portanto o custo de
gravar um URL morto não é um ícone partido, é um pedido de rede falhado em
cada carregamento de página, para sempre.

Uso: python scripts/backfill_logos.py [--dry-run]
"""

import os
import sys
import time
import requests
import psycopg2
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.join(os.path.dirname(__file__), "..")

if os.environ.get("GITHUB_ACTIONS") == "true":
    pass
else:
    ENV_FILE = os.path.join(ROOT, ".env.dev")
    if os.path.exists(ENV_FILE):
        load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

FINNHUB_KEY = os.getenv("FINNHUB_API_KEY")
if not FINNHUB_KEY:
    sys.exit("FINNHUB_API_KEY não definida")

DRY_RUN = "--dry-run" in sys.argv

# Plano gratuito: 60 chamadas/minuto, e aqui são duas por empresa (perfil +
# verificação do URL).
PAUSA = 1.1


def logo_do_finnhub(ticker: str) -> str | None:
    try:
        r = requests.get(
            "https://finnhub.io/api/v1/stock/profile2",
            params={"symbol": ticker, "token": FINNHUB_KEY},
            timeout=25,
        )
        if r.status_code != 200:
            return None
        url = (r.json() or {}).get("logo") or None
        return url if url and url.startswith("https://") else None
    except Exception:
        return None


def url_serve(url: str) -> bool:
    """Confirma que responde e que é mesmo uma imagem."""
    try:
        r = requests.get(url, timeout=20, stream=True)
        ok = r.status_code == 200 and r.headers.get("content-type", "").startswith("image/")
        r.close()
        return ok
    except Exception:
        return False


def main():
    conn = psycopg2.connect(DIRECT_URL)
    with conn.cursor() as cur:
        cur.execute(
            '''SELECT ticker, id FROM companies
               WHERE "isActive" = TRUE AND "logoUrl" IS NULL
                 AND ticker NOT LIKE '^%'
               ORDER BY ticker''',
        )
        candidatos = cur.fetchall()

    if not candidatos:
        print("Nenhuma empresa activa sem logótipo — nada a fazer.")
        conn.close()
        return

    print(f"{len(candidatos)} empresa(s) sem logótipo.\n")
    escritos = sem_logo = mortos = 0

    for ticker, company_id in candidatos:
        url = logo_do_finnhub(ticker)
        time.sleep(PAUSA)
        if not url:
            print(f"  {ticker}: o Finnhub não tem logótipo")
            sem_logo += 1
            continue

        if not url_serve(url):
            print(f"  {ticker}: URL não serve uma imagem — ignorado ({url})")
            mortos += 1
            continue

        if DRY_RUN:
            print(f"  {ticker}: gravaria {url}")
            escritos += 1
            continue

        with conn.cursor() as cur:
            cur.execute(
                'UPDATE companies SET "logoUrl" = %s, "updatedAt" = NOW() WHERE id = %s',
                (url, company_id),
            )
        conn.commit()
        print(f"  {ticker}: {url}")
        escritos += 1

    conn.close()
    print(f"\n{escritos} logótipo(s) gravado(s), {sem_logo} sem logótipo na fonte, "
          f"{mortos} com URL morto." + (" (dry-run: nada gravado)" if DRY_RUN else ""))


if __name__ == "__main__":
    main()
