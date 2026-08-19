#!/usr/bin/env python3
"""
fix_segment_axis_consistency.py — uma empresa, um eixo.

O DEFEITO, visível no site:
  revenueSegmentsByAxis guarda a repartição por vários eixos (segment, product,
  geography, business). revenueSegments é a coluna PLANA que o gráfico
  "Receitas por Segmento" desenha, e é preenchida ano a ano com o eixo que
  calhou existir nesse ano.

  Na Visa, 2017-2024 têm o eixo de produto (Service revenue, Data processing,
  ...) e 2025 só tem o geográfico. O gráfico empilha as duas partições lado a
  lado: dez barras de produto e uma barra de "International / UNITED STATES".
  Não é um erro de valores — cada barra está certa — é a série a trocar de
  pergunta a meio. Medido: 146 das 524 empresas com segmentos (28%).

A CORREÇÃO:
  Escolhe-se UM eixo por empresa e reescreve-se a coluna plana só a partir
  dele. O critério é a COBERTURA — o eixo presente em mais exercícios — porque
  é o que deixa a série mais longa. Empate desfaz-se por informatividade:
  a repartição de negócio diz mais ao investidor do que a geográfica.

  Nos anos em que o eixo escolhido não existe, a coluna fica a NULL. Um buraco
  no gráfico é honesto; uma barra de outra partição finge continuidade que não
  há. É a regra da casa: antes NULL que errado.

  Linhas sem revenueSegmentsByAxis (extrações antigas) não se tocam — sem os
  eixos não há como saber de qual vieram.

Uso:
  python scripts/fix_segment_axis_consistency.py --dry-run
  python scripts/fix_segment_axis_consistency.py --tickers V --dry-run
  python scripts/fix_segment_axis_consistency.py --apply
"""
import argparse
import collections
import os
import re
import sys

import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, "..", ".env.dev"))
DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

# Ordem de INFORMATIVIDADE. "segment" é o StatementBusinessSegmentsAxis, a
# repartição operacional que a própria empresa gere; "geography" é a que menos
# diz sobre o negócio — duas linhas, International e US, não explicam nada.
PREFERENCIA = {"segment": 0, "business": 1, "product": 2, "geography": 3}

# Um eixo mais informativo ganha desde que cubra pelo menos esta fração dos
# exercícios do eixo mais completo. Sem este piso, a cobertura mandava sozinha e
# a Visa ficava com geografia (9 anos) em vez de produto (8) — trocar a
# repartição de produto por "International/US" para ganhar UM ano é mau negócio.
# Com o piso, um eixo residual (2 anos contra 12) continua a perder.
PISO_COBERTURA = 0.70

# GUARDAS DE QUALIDADE DO EIXO ESCOLHIDO. Escolher um eixo consistente não o
# torna correto: alguns eixos têm defeitos próprios que a coluna plana, ao
# saltar de eixo, escondia por acidente.
#   - Baxter 2022: as sub-linhas somam 1,503x a receita (dupla contagem).
#     Sempra 1,190x, NRG 1,165x, GE 1,084x — todos sobreposições.
# NÃO se testa "o eixo mistura geografia com negócio". Tentou-se e foi retirado:
# exige uma lista de países que nunca está completa (falhava em Chile, Egito,
# Indonésia, Filipinas, Singapura, Suíça, o que fazia os 16 países da Freeport
# parecerem 56% mistura), e o caso que motivava a regra afinal não é defeito
# nenhum — Americas, EMEA, Asia Pacific, Global Investment Management e
# Development Services SÃO os cinco segmentos reportáveis da CBRE.
# Um eixo que falhe estes testes na MAIORIA dos seus exercícios é desqualificado
# como candidato, e a empresa cai no eixo seguinte em vez de perder a série. A
# Sempra é o caso: o eixo de segmentos soma 1,06-1,19x a receita em todos os
# anos (as subsidiárias reportam antes de eliminações intersegmentos), mas o
# eixo geográfico dela é limpo e cobre 10 exercícios. Anular oito anos quando
# existe uma partição boa ao lado seria destruir dados por teimosia na regra.
# O limiar de mistura poupa a Freeport, cujos
# 16 rótulos são países mais um "Other" (94% geográfico) e soma 1,029x — essa é
# uma partição geográfica legítima.
SOMA_MAXIMA = 1.10   # o mesmo limiar de segment_checks.py:337 (P0)

# O NOME DO EIXO NÃO DIZ O QUE ELE CONTÉM. Os segmentos reportáveis da Apple no
# StatementBusinessSegmentsAxis são "Americas / Europe / Greater China / Japan"
# — geográficos — enquanto o iPhone/Mac/Serviços vive no ProductOrServiceAxis.
# Ordenar por nome de eixo trocava o split de produto da Apple por continentes.
# Por isso classifica-se pelos RÓTULOS: se a maioria são lugares, o eixo é
# geográfico, chame-se ele como se chamar.
RE_GEO = re.compile(
    r"^(americ|europ|asia|pacific|afric|japan|china|india|brazil|mexico|canada|"
    r"korea|australia|germany|france|spain|italy|netherland|belgium|nordic|"
    r"united states|u\.?s\.?|uk|united kingdom|domestic|foreign|international|"
    r"emea|apac|latin|north|south|east|west|middle east|rest of|other countr|"
    r"outside|overseas|greater )", re.I)


def e_geografico(rotulos) -> bool:
    """Um eixo é geográfico se a maioria dos seus rótulos forem lugares."""
    if not rotulos:
        return False
    geo = sum(1 for r in rotulos if RE_GEO.match(str(r).strip()))
    return geo / len(rotulos) >= 0.6


def problema(alvo: dict, rev) -> str:
    """Porque é que esta partição não serve — string vazia se servir."""
    if not alvo:
        return "eixo ausente"
    soma = sum(float(v) for v in alvo.values() if v is not None)
    if rev and float(rev) > 0 and soma / float(rev) > SOMA_MAXIMA:
        return f"soma {soma / float(rev):.3f}x a receita"
    return ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not (args.apply or args.dry_run):
        sys.exit("usa --dry-run ou --apply")

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    sql = ('SELECT c.ticker, f.id, f."fiscalYear", f."revenueSegments", '
           'f."revenueSegmentsByAxis", f.revenue '
           'FROM fundamentals f JOIN companies c ON c.id=f."companyId" '
           "WHERE f.\"periodType\"='ANNUAL' AND f.\"revenueSegmentsByAxis\" IS NOT NULL")
    params = ()
    if args.tickers:
        sql += " AND c.ticker = ANY(%s)"
        params = (args.tickers.split(","),)
    cur.execute(sql + ' ORDER BY c.ticker, f."fiscalYear"', params)

    por_empresa = collections.defaultdict(list)
    for tk, fid, fy, plano, eixos, rev in cur.fetchall():
        por_empresa[tk].append((fid, fy, plano, eixos or {}, rev))

    reescritas = anuladas = empresas = 0
    for tk, linhas in sorted(por_empresa.items()):
        cobertura = collections.Counter()
        geo_votos = collections.defaultdict(list)
        for _, _, _, eixos, _ in linhas:
            for k, v in eixos.items():
                if v:
                    cobertura[k] += 1
                    geo_votos[k].append(e_geografico(list(v)))
        # O eixo é geográfico se o for na maioria dos exercícios.
        geo = {k: sum(v) > len(v) / 2 for k, v in geo_votos.items()}
        # Desqualificar eixos que falham na maioria dos seus exercícios.
        maus = collections.Counter()
        for _, _, _, eixos, rev in linhas:
            for k, v in eixos.items():
                if v and problema(v, rev):
                    maus[k] += 1
        sadios = {k: n for k, n in cobertura.items() if maus[k] <= n / 2}
        if sadios:
            cobertura = collections.Counter(sadios)
        if len(cobertura) < 2:
            # Sobrou um só eixo utilizável — ainda assim vale a pena unificar.
            if not cobertura:
                continue

        maxc = max(cobertura.values())
        viaveis = [k for k, n in cobertura.items() if n >= PISO_COBERTURA * maxc]
        escolhido = min(viaveis, key=lambda k: (geo.get(k, False),
                                                PREFERENCIA.get(k, 9), -cobertura[k]))

        mudou = []
        for fid, fy, plano, eixos, rev in linhas:
            alvo = eixos.get(escolhido) or None
            motivo = problema(alvo, rev)
            if motivo:
                alvo = None
            atual = plano or None
            # Comparar por conjunto de rótulos: os valores são os mesmos objetos.
            if (sorted(alvo) if alvo else None) == (sorted(atual) if atual else None):
                continue
            mudou.append((fid, fy, alvo, sorted(atual or [])[:2], motivo))

        if not mudou:
            continue
        empresas += 1
        print(f"{tk:6} eixo -> {escolhido:9} ({dict(cobertura)}"              f"{'  geo=' + ','.join(k for k, g in geo.items() if g) if any(geo.values()) else ''})")
        for fid, fy, alvo, antes, motivo in mudou:
            if alvo:
                print(f"        {fy}: {', '.join(sorted(alvo)[:3])}")
                reescritas += 1
            else:
                print(f"        {fy}: ANULADO — {motivo or 'eixo ausente'} "
                      f"(tinha {', '.join(antes)})")
                anuladas += 1
            if args.apply:
                cur.execute('UPDATE fundamentals SET "revenueSegments"=%s, "updatedAt"=NOW() '
                            'WHERE id=%s', (Json(alvo) if alvo else None, fid))
        if args.apply:
            conn.commit()

    print(f"\n{empresas} empresas | {reescritas} linhas reescritas | {anuladas} anuladas")
    if not args.apply:
        print("Dry-run — nada escrito.")
    conn.close()


if __name__ == "__main__":
    main()
