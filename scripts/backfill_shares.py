"""
backfill_shares.py — Nº de ações para empresas que a SEC não expõe.

A API `companyfacts` da SEC devolve apenas factos SEM dimensões. Empresas de
classes múltiplas taggam as ações e o EPS por classe (Visa A/B/C, Berkshire
A/B, Constellation A/B), e esses factos saem todos dimensionados — logo, são
descartados. O resultado é que a Visa, a Berkshire, a BP, a Erie e a
Constellation não têm UMA ÚNICA linha com sharesOutstanding em 52 períodos.

Sem ações não há capitalização bolsista, e o screener ordena-a por
`shares × preço`: a Visa, que é das dez maiores empresas cotadas do mundo,
aparecia no fundo da lista de maiores empresas.

Isto não é um defeito de extração — é um limite da API. A solução é outra
fonte, e a escolhida é o Finnhub, que já alimenta cotações e logótipos no
pipeline.

## O guarda contra a unidade errada

O `shareOutstanding` do Finnhub NEM SEMPRE está na unidade do ticker que temos:

  - BRK.B → 1,44 M ações. São as de classe A. Multiplicadas pelo preço da
    classe B davam 720 M de capitalização em vez de 982 mil milhões.
  - BP → 15.703 M ações ordinárias, mas o ADR cotado em Nova Iorque vale seis
    ordinárias. O produto dava seis vezes a mais.

O Finnhub devolve também a capitalização, e isso permite validar o número
contra si próprio: se `ações × preço` não bater com a capitalização que a
mesma resposta declara, a unidade não é a nossa e o valor é rejeitado. Um N/A
é melhor do que uma capitalização seis vezes errada.

Escreve APENAS no período mais recente e APENAS em empresas sem nenhuma ação
em todo o histórico — não inventa série histórica nenhuma, só o número de hoje,
que é o que a capitalização precisa.

Corre DEPOIS de ingest_fundamentals.py: a re-ingestão apaga e reescreve as
linhas da empresa, levando estes valores à frente.

Uso: python scripts/backfill_shares.py [--dry-run]
"""

import os
import sys
import time
import requests
import psycopg2
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.join(os.path.dirname(__file__), "..")

if os.environ.get("GITHUB_ACTIONS") == "true":
    pass
else:
    ENV_FILE = os.path.join(ROOT, ".env.dev")
    if not os.path.exists(ENV_FILE):
        sys.exit(
            "ERRO: ficheiro .env.dev não encontrado.\n"
            "NUNCA uses .env.local — estes scripts só correm contra a BD de desenvolvimento."
        )
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

FINNHUB_KEY = os.getenv("FINNHUB_API_KEY")
if not FINNHUB_KEY:
    sys.exit("FINNHUB_API_KEY não definida")

DRY_RUN = "--dry-run" in sys.argv

# O desvio mede-se como RÁCIO SIMÉTRICO — max(a/b, b/a) — e não como diferença
# relativa. A diferença relativa satura: com o produto muito abaixo da
# capitalização dá sempre ~100%, e por isso a Berkshire (1344× ao lado) ficava
# indistinguível de um ADR a 2×, que é um erro bem mais subtil e igualmente
# fatal.
#
# O limiar separa duas coisas de escalas diferentes. Erros de unidade são
# múltiplos inteiros: um ADR vale 2, 4 ou 6 ordinárias; as ações de classe A da
# Berkshire valem 1500 das de classe B. Desfasamento de preço é outra ordem de
# grandeza: a capitalização do Finnhub é um instantâneo que pode estar umas
# horas ou dias atrás do nosso fecho, e 1,5× cobre isso com folga sem chegar
# perto do ADR mais pequeno que existe.
RACIO_MAXIMO = 1.5

# Free tier: 60 chamadas/minuto. Só se pedem as empresas sem ações nenhumas
# (cinco, na base atual), mas a pausa fica para o caso de a lista crescer.
PAUSA = 1.1


def perfil_finnhub(ticker: str) -> dict | None:
    try:
        r = requests.get(
            "https://finnhub.io/api/v1/stock/profile2",
            params={"symbol": ticker, "token": FINNHUB_KEY},
            timeout=25,
        )
        if r.status_code != 200:
            print(f"  {ticker}: Finnhub devolveu HTTP {r.status_code}")
            return None
        return r.json() or None
    except Exception as e:
        print(f"  {ticker}: Finnhub falhou ({type(e).__name__}: {e})")
        return None


def main():
    conn = psycopg2.connect(DIRECT_URL)
    candidatos = []

    with conn.cursor() as cur:
        # Empresas ativas SEM uma única linha com ações, e com preço para
        # validar. O preço é condição: sem ele não há como testar a unidade,
        # e escrever um número por validar é o que este script existe para
        # evitar.
        cur.execute(
            '''
            SELECT c.ticker, c.id, p.close
            FROM companies c
            JOIN LATERAL (
                SELECT close FROM prices WHERE ticker = c.ticker
                ORDER BY date DESC LIMIT 1
            ) p ON true
            WHERE c."isActive" = TRUE
              AND c.ticker NOT LIKE '^%'
              AND COALESCE(c.exchange, '') <> 'MACRO'
              AND NOT EXISTS (
                  SELECT 1 FROM fundamentals f
                  WHERE f."companyId" = c.id AND f."sharesOutstanding" > 0
              )
            ORDER BY c.ticker
            ''',
        )
        candidatos = [(t, cid, float(px)) for t, cid, px in cur.fetchall()]

    if not candidatos:
        print("Nenhuma empresa sem nº de ações — nada a fazer.")
        conn.close()
        return

    print(f"{len(candidatos)} empresa(s) sem nº de ações: "
          f"{', '.join(t for t, _, _ in candidatos)}\n")

    escritas = 0
    rejeitadas = 0

    for ticker, company_id, preco in candidatos:
        perfil = perfil_finnhub(ticker)
        time.sleep(PAUSA)
        if not perfil:
            rejeitadas += 1
            continue

        acoes_m = perfil.get("shareOutstanding")
        cap_m = perfil.get("marketCapitalization")
        if not acoes_m or not cap_m or acoes_m <= 0 or cap_m <= 0:
            print(f"  {ticker}: Finnhub sem ações/capitalização — ignorado")
            rejeitadas += 1
            continue

        # Ambos vêm em milhões, por isso ações(M) × preço dá capitalização(M)
        # diretamente — a comparação é entre grandezas da mesma escala.
        implicita = acoes_m * preco
        racio = max(implicita / cap_m, cap_m / implicita)
        if racio > RACIO_MAXIMO:
            print(f"  {ticker}: REJEITADO — {acoes_m:,.2f}M ações × {preco:,.2f} "
                  f"= {implicita:,.0f}M, mas o Finnhub declara {cap_m:,.0f}M "
                  f"({racio:.1f}× ao lado). Unidade não é a do nosso ticker.")
            rejeitadas += 1
            continue

        acoes = acoes_m * 1e6

        if DRY_RUN:
            print(f"  {ticker}: escreveria {acoes:,.0f} ações "
                  f"({racio:.2f}× face à capitalização declarada)")
            escritas += 1
            continue

        with conn.cursor() as cur:
            # Só o período mais recente: este é o número de HOJE, não um facto
            # histórico, e espalhá-lo pela série inventava uma história que não
            # aconteceu (a Visa recomprou ações todos os anos).
            cur.execute(
                '''
                UPDATE fundamentals SET "sharesOutstanding" = %s, "updatedAt" = NOW()
                WHERE id = (
                    SELECT id FROM fundamentals
                    WHERE "companyId" = %s
                    ORDER BY "periodEnd" DESC
                    LIMIT 1
                )
                ''',
                (acoes, company_id),
            )
            afetadas = cur.rowcount
        conn.commit()

        if afetadas:
            print(f"  {ticker}: {acoes:,.0f} ações escritas "
                  f"({racio:.2f}× face à capitalização declarada)")
            escritas += 1
        else:
            print(f"  {ticker}: sem períodos para escrever")
            rejeitadas += 1

    corrigir_unidades_de_adr(conn)

    conn.close()
    print(f"\n{escritas} empresa(s) com nº de ações preenchido, "
          f"{rejeitadas} rejeitada(s)."
          + (" (dry-run: nada gravado)" if DRY_RUN else ""))



# ── ADR: ações ordinárias a multiplicar por um preço de ADS ─────────────────

# Acima deste rácio, a nossa capitalização e a do Finnhub não podem estar a
# falar da mesma coisa. Um ADR britânico vale tipicamente 2, 4 ou 5 ordinárias,
# portanto o erro aparece em múltiplos — bem acima de qualquer diferença de
# preço ou de momento de leitura.
RACIO_QUE_DENUNCIA_UNIDADE = 1.5

# Um ADS representa entre 1 e 20 ordinárias. Uma correção que implique um rácio
# fora disto não é um ADR, é outra coisa qualquer — e aí não se escreve.
ADR_MIN, ADR_MAX = 1.0, 20.0


def corrigir_unidades_de_adr(conn) -> None:
    """Corrige o nº de ações onde ele está em ORDINÁRIAS e o preço é o do ADS.

    A capitalização é calculada como `ações x preco` no momento em que a página
    carrega (nunca guardada — ver CLAUDE.md §5). Isso exige que as duas
    grandezas estejam na MESMA unidade, e nos ADR britânicos não estavam: o
    XBRL dá as ordinárias de Londres e o preço é o do recibo de Nova Iorque,
    que vale várias delas.

    Medido a 2026-09-13, no topo da lista de maiores empresas:

        HSBC   1.835.063 M   contra   262.369 M      7,0x
        BCS      376.790 M   contra    64.943 M      5,8x
        DEO      196.130 M   contra    35.650 M      5,5x
        SHEL     570.053 M   contra   202.348 M      2,8x
        GSK      194.975 M   contra    71.145 M      2,7x

    Os rácios são os rácios de ADR destas empresas (1:5, 1:4, 1:4, 1:2, 1:2)
    mais o efeito da libra. A HSBC aparecia como a SÉTIMA maior empresa cotada
    do mundo, à frente da Broadcom e da Meta, no primeiro ecrã que alguém vê
    depois de entrar.

    Guarda-se o equivalente em ADS, que é a unidade do preço — e também a
    unidade do ticker que se negoceia aqui.
    """
    with conn.cursor() as cur:
        # Só as de fora dos Estados Unidos: é onde os ADR vivem. Poupa ~480
        # chamadas ao Finnhub por passagem, e o problema não existe nas
        # domésticas — confirmado comparando as 70 maiores.
        cur.execute(
            '''
            SELECT c.ticker, c.id, lf.s, lp.close
            FROM companies c
            JOIN LATERAL (
                SELECT f."sharesOutstanding" s FROM fundamentals f
                WHERE f."companyId" = c.id AND f."sharesOutstanding" > 0
                ORDER BY f."periodEnd" DESC LIMIT 1
            ) lf ON true
            JOIN LATERAL (
                SELECT close FROM prices WHERE ticker = c.ticker
                ORDER BY date DESC LIMIT 1
            ) lp ON true
            WHERE c."isActive" = TRUE
              AND COALESCE(c.country, 'US') <> 'US'
              AND c.ticker NOT LIKE '^%'
            ORDER BY c.ticker
            ''',
        )
        candidatos = [(t, cid, float(s), float(px)) for t, cid, s, px in cur.fetchall()]

    if not candidatos:
        return

    print(f"\nA verificar a unidade do nº de ações em {len(candidatos)} empresa(s) fora dos EUA...")
    corrigidas = 0

    for ticker, company_id, acoes, preco in candidatos:
        perfil = perfil_finnhub(ticker)
        time.sleep(PAUSA)
        if not perfil:
            continue
        cap_ref_m = perfil.get("marketCapitalization")
        if not cap_ref_m or cap_ref_m <= 0:
            continue

        nossa_m = acoes * preco / 1e6
        if nossa_m <= 0:
            continue
        racio = max(nossa_m / cap_ref_m, cap_ref_m / nossa_m)
        if racio <= RACIO_QUE_DENUNCIA_UNIDADE:
            continue

        # Só se corrige para BAIXO, e só quando o rácio implícito é o de um
        # ADR. A nossa capitalização MAIOR do que a de referência é o sintoma
        # de contar ordinárias a preço de ADS; o caso inverso é outra coisa e
        # fica por resolver em vez de ser adivinhado.
        implicito = nossa_m / cap_ref_m
        if not (ADR_MIN <= implicito <= ADR_MAX):
            print(f"  {ticker}: {racio:.1f}x ao lado mas o rácio implícito ({implicito:.2f}) não é de um ADR — não corrigido.")
            continue

        corrigido = cap_ref_m * 1e6 / preco

        if DRY_RUN:
            print(f"  {ticker}: {acoes/1e6:,.0f}M -> {corrigido/1e6:,.0f}M ações (cap {nossa_m/1e3:,.0f} mM -> {cap_ref_m/1e3:,.0f} mM)")
            corrigidas += 1
            continue

        with conn.cursor() as cur:
            cur.execute(
                '''
                UPDATE fundamentals SET "sharesOutstanding" = %s, "updatedAt" = NOW()
                WHERE id = (
                    SELECT id FROM fundamentals
                    WHERE "companyId" = %s AND "sharesOutstanding" > 0
                    ORDER BY "periodEnd" DESC LIMIT 1
                )
                ''',
                (corrigido, company_id),
            )
        conn.commit()
        print(f"  {ticker}: {acoes/1e6:,.0f}M -> {corrigido/1e6:,.0f}M ações (cap {nossa_m/1e3:,.0f} mM -> {cap_ref_m/1e3:,.0f} mM)")
        corrigidas += 1

    print(f"  {corrigidas} unidade(s) de ADR corrigida(s)." + (" (dry-run)" if DRY_RUN else ""))

if __name__ == "__main__":
    main()
