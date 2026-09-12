#!/usr/bin/env python3
"""
esef_segments_notes.py — repartição da receita das europeias, a partir do BLOCO
DE TEXTO da nota de segmentos do ESEF.

PORQUE É PRECISO ISTO:
  O ESEF só exige etiquetagem detalhada do ROSTO das demonstrações. As notas vão
  como blocos de texto (block-tagging). Medido nas 18 empresas ingeridas: os
  ficheiros têm 490-700 factos (contra milhares num 10-K), e o ÚNICO eixo
  dimensional presente é ifrs-full:ComponentsOfEquityAxis — componentes do
  capital próprio, não segmentos. Portanto:

    - o extrator dimensional (ingest_segments_xbrl) não tem eixos para ler;
    - o truque da Dassault (conceitos próprios no rosto) não generaliza —
      testado nas 18, zero têm repartição de receita no rosto.

  Sobra a nota. O DisclosureOfOperatingSegmentsExplanatory é HTML com a tabela
  lá dentro, e é a única fonte oficial que existe.

PORQUE É QUE ISTO NÃO É ADIVINHAR:
  O HTML é conversão de PDF — cabeçalhos partidos por várias linhas, células
  absolutamente posicionadas, <td> vazios só para alinhar. Um parser assim
  erra, e a regra da casa é "antes NULL que errado".

  A defesa não é parsear melhor: é EXIGIR QUE A PARTIÇÃO FECHE. Só se escreve
  quando a soma dos segmentos bate certo com a receita que já está na base de
  dados, vinda do rosto XBRL (fonte independente do parser). Um parse errado
  não fecha e é descartado. O gate é a validação, não a esperança.

  Duas verificações, ambas obrigatórias:
    1. INTERNA: se a tabela tiver coluna "Total", a soma das outras bate certo.
    2. EXTERNA: o total bate certo com fundamentals.revenue do mesmo exercício.

Uso:
  python scripts/esef_segments_notes.py --tickers SU,DG --dry-run
  python scripts/esef_segments_notes.py --todos
"""
import argparse
import bisect
import datetime as dt
import html
import json
import os
import re
import sys

import requests
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, "..", ".env.dev"))
DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

sys.path.insert(0, HERE)
from ingest_fundamentals import get_fx_series  # noqa: E402

FILES = "https://filings.xbrl.org"
INDICE = "/tmp/esef_index.json"
ALVOS = "/tmp/alvos.json"
TOL = 0.03          # 3% — arredondamentos de "em milhões" acumulam-se

# A linha da receita, nas línguas em que estas notas são publicadas. Deliberada-
# mente ancorado ao INÍCIO do rótulo: "receita de associadas" não é a receita.
RE_RECEITA = re.compile(
    r"^\s*(chiffre d'affaires|ventes hors groupe|total des ventes|"
    r"revenu|revenue|net sales|sales|turnover|"
    r"omzet|opbrengsten|netto-omzet|ricavi|ingresos|cifra de negocios|"
    r"receita|volume de neg|umsatz|external revenue|segment revenue)",
    re.I,
)
# Colunas que são o total da linha, não um segmento.
RE_TOTAL = re.compile(r"^\s*(total|group|groupe|groep|gruppo|consolidat|sous-total|non allou|unallocated|elimina|éliminat)", re.I)

ESCALAS = (1, 1_000, 1_000_000, 1_000_000_000)


# Tags que separam palavras (viram espaço) vs. tags que estão DENTRO de uma
# palavra (têm de desaparecer sem deixar rasto).
RE_BLOCO_TAG = re.compile(r"</?(div|p|br|li|tr|td|th|table)\b[^>]*>", re.I)
RE_TAG = re.compile(r"<[^>]+>")


def texto(fragmento: str) -> str:
    """Tira as tags e normaliza o espaço.

    SUBTILEZA QUE PARTE TUDO: o conversor de PDF insere <span> VAZIOS no meio
    das palavras para reproduzir o kerning — Chif<span class="_ _1"></span>fre.
    Substituir toda a tag por um espaço dá "Chif fre d'affaire s", e nenhum
    rótulo bate certo. Por isso as tags inline desaparecem para "" e só as de
    bloco viram espaço. Os espaços a sério vêm no texto (muitas vezes \xa0
    dentro de um span), portanto não se perdem.
    """
    t = RE_BLOCO_TAG.sub(" ", fragmento)
    t = RE_TAG.sub("", t)
    t = html.unescape(t).replace("\xa0", " ").replace("’", "'")
    return re.sub(r"\s+", " ", t).strip()


def numero(s: str) -> float | None:
    """Aceita '18 227', '(1 234)', '1.234,5' e '1,234.5'. Devolve None para
    tudo o que não seja inequivocamente um número."""
    s = s.strip().replace("\xa0", " ")
    if not s or s in {"-", "–", "—", "n/a", "ns"}:
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(" ", "")
    if not re.fullmatch(r"[-+]?[\d.,]+", s):
        return None
    # Qual dos dois separadores é o decimal: o que aparece por último.
    if "," in s and "." in s:
        dec = "," if s.rfind(",") > s.rfind(".") else "."
        s = s.replace("." if dec == "," else ",", "").replace(dec, ".")
    elif "," in s:
        # Vírgula sozinha: decimal se separar <=2 dígitos finais, senão milhares.
        s = s.replace(",", "." if len(s.split(",")[-1]) <= 2 else "")
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def grelha(tabela: str) -> list[list[str]]:
    """A tabela como matriz de texto, indexada pela POSIÇÃO do <td>.

    Não se trata colspan de propósito: estas tabelas vêm de conversão de PDF e
    usam <td> vazios para alinhar em vez de colspan. Se alguma usar colspan, os
    cabeçalhos desalinham, a partição não fecha e a empresa é descartada — que é
    exatamente o comportamento desejado.
    """
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tabela, re.S | re.I):
        out.append([texto(td) for td in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S | re.I)])
    return out


def cabecalhos(linhas: list[list[str]], i_receita: int) -> dict[int, str]:
    """Junta, por índice de coluna, o texto de todas as linhas acima da receita.

    É isto que reconstrói 'Gestion de' + 'l'énergie' -> 'Gestion de l'énergie',
    que o conversor de PDF partiu em duas linhas.
    """
    partes: dict[int, list[str]] = {}
    for linha in linhas[:i_receita]:
        for j, cel in enumerate(linha):
            if cel and numero(cel) is None and not RE_RECEITA.match(cel):
                partes.setdefault(j, []).append(cel)
    return {j: " ".join(p).strip() for j, p in partes.items()}


def limpar(nome: str) -> str:
    """Rótulo apresentável.

    O conversor de PDF deixa hífenes suaves (\xad) no meio das palavras —
    "Équipe\xadments" aparece partido no site — e os rótulos arrastam
    marcadores de nota de rodapé "(1)", "(2)" que não são parte do nome.
    """
    n = nome.replace("\xad", "").replace("\u00ad", "")
    n = re.sub(r"\s*\(\d+\)", "", n)
    n = re.sub(r"[\s\-–—,;:]+$", "", n).strip()
    return re.sub(r"\s+", " ", n)[:60]


def _transposto(linhas: list[list[str]]) -> dict[str, float] | None:
    """Layout em que os SEGMENTOS SÃO LINHAS e as métricas colunas.

    É o formato da L'Oréal: a primeira linha é o cabeçalho das métricas
    ("Chiffre d'affaires", "Résultat d'exploitation", ...) e cada linha
    seguinte é uma divisão. O layout em colunas — o da LVMH e da Schneider —
    é o outro. Ambos são comuns; suportar só um perde metade das empresas.
    """
    for cab in linhas[:3]:
        col = next((j for j, c in enumerate(cab) if j and RE_RECEITA.match(c)), None)
        if col is None:
            continue
        segs = {}
        for linha in linhas:
            if linha is cab or len(linha) <= col or not linha or not linha[0]:
                continue
            if RE_TOTAL.match(linha[0]) or numero(linha[0]) is not None:
                continue
            v = numero(linha[col])
            if v:
                segs[linha[0]] = v
        if len(segs) >= 2:
            return segs
    return None


def extrair(bloco: str) -> dict[str, float] | None:
    """{segmento: valor} em unidades CRUAS, como estão na tabela.

    A escala ("em milhões", "em milhares") NÃO se deduz aqui. Tentou-se ler a
    legenda do topo e é frágil: a mesma empresa tem dois blocos de nota e a
    legenda só está num deles, o que fazia a Schneider sair 1.000.000x pequena
    sem nenhum sinal de erro. A escala é deduzida no chamador pelo FECHO contra
    a receita da BD — como as escalas diferem por fatores de mil, no máximo uma
    pode fechar a 3%, e uma escala errada é aritmeticamente incapaz de passar.
    """
    for tabela in re.findall(r"<table[^>]*>(.*?)</table>", bloco, re.S | re.I):
        linhas = grelha(tabela)
        for i, linha in enumerate(linhas):
            rotulo = next((c for c in linha if c), "")
            if not RE_RECEITA.match(rotulo):
                continue
            vals = {j: numero(c) for j, c in enumerate(linha)}
            vals = {j: v for j, v in vals.items() if v is not None and v != 0}
            if len(vals) < 3:          # 2 segmentos + total, no mínimo
                continue
            cabs = cabecalhos(linhas, i)

            segs, total = {}, None
            for j, v in vals.items():
                nome = cabs.get(j, "")
                if not nome:
                    continue
                if RE_TOTAL.match(nome):
                    total = v
                else:
                    segs[nome] = v
            if len(segs) < 2:
                continue

            # VERIFICAÇÃO INTERNA: as partes têm de dar o total da própria
            # tabela. É independente da escala, porque ambos os lados a partilham.
            if total is not None and abs(sum(segs.values()) - total) > TOL * abs(total):
                continue
            return segs

    # Nenhuma tabela em colunas serviu — tentar o layout transposto.
    for tabela in re.findall(r"<table[^>]*>(.*?)</table>", bloco, re.S | re.I):
        segs = _transposto(grelha(tabela))
        if segs:
            return segs
    return None


def blocos_de_segmentos(doc: dict) -> list[str]:
    """Todos os blocos de nota que possam conter a tabela de segmentos.

    São dois conceitos distintos e as empresas usam-nos indistintamente:
    DisclosureOfOperatingSegmentsExplanatory e
    DisclosureOfEntitysReportableSegmentsExplanatory. A Vinci e a LVMH só têm o
    segundo — filtrar só pelo primeiro perde-as por inteiro.
    """
    out = []
    for f in (doc.get("facts") or {}).values():
        n = ((f.get("dimensions") or {}).get("concept") or "").split(":")[-1]
        if not (n.startswith("DisclosureOf") and "Segment" in n):
            continue
        v = f.get("value")
        if isinstance(v, str) and "<table" in v.lower():
            out.append(v)
    return out


def ano_do_relatorio(doc: dict) -> int | None:
    """O exercício a que o relatório respeita: a duração anual mais recente."""
    fins = []
    for f in (doc.get("facts") or {}).values():
        p = str((f.get("dimensions") or {}).get("period", ""))
        if "/" not in p:
            continue
        try:
            d1, d2 = [dt.date.fromisoformat(x[:10]) for x in p.split("/")]
        except ValueError:
            continue
        if 350 <= (d2 - d1).days <= 380:
            fins.append(d2)
    if not fins:
        return None
    fim = max(fins)
    # A duração fecha no início do dia seguinte -> desconta-se um dia.
    return (fim - dt.timedelta(days=1)).year


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", help="lista separada por vírgulas")
    ap.add_argument("--todos", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    idx = json.load(open(INDICE))
    alvos = json.load(open(ALVOS))
    if args.tickers:
        want = set(args.tickers.split(","))
        alvos = [a for a in alvos if a[0] in want]
    elif not args.todos:
        sys.exit("usa --tickers ou --todos")

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()
    fx_datas, fx_taxas = get_fx_series("EUR")

    escritas = fechou = falhou = 0
    for tk, lei, isin, mic, nome in alvos:
        ent = idx.get(lei)
        if not ent:
            print(f"{tk:5} sem entidade no índice")
            continue
        cur.execute("SELECT id FROM companies WHERE ticker=%s", (tk,))
        r = cur.fetchone()
        if not r:
            print(f"{tk:5} não está na BD")
            continue
        cid = r[0]

        urls = sorted({x for lst in ent["filings"].values() for x in lst})
        for u in urls:
            try:
                doc = requests.get(FILES + u, timeout=180).json()
            except Exception as e:
                print(f"{tk:5} {u}: {e!r}")
                continue
            blocos = blocos_de_segmentos(doc)
            ano = ano_do_relatorio(doc)
            if not blocos or not ano:
                continue
            segs = next((s for s in (extrair(b) for b in blocos) if s), None)
            if not segs:
                print(f"{tk:5} {ano}  tabela não interpretável")
                falhou += 1
                continue

            # VERIFICAÇÃO EXTERNA — a que decide. A receita da BD vem do ROSTO
            # do XBRL, fonte independente deste parser, e está em USD.
            cur.execute('SELECT id, revenue FROM fundamentals WHERE "companyId"=%s '
                        'AND "periodType"=\'ANNUAL\' AND "fiscalYear"=%s', (cid, ano))
            fr = cur.fetchone()
            if not fr or not fr[1]:
                print(f"{tk:5} {ano}  sem receita na BD para comparar")
                continue
            fid, rev_bd = fr[0], float(fr[1])

            i = bisect.bisect_right(fx_datas, f"{ano}-12-31") - 1
            taxa = fx_taxas[max(i, 0)]

            # A escala sai do fecho, não da legenda. Escolhe-se a que minimiza o
            # desvio; se nenhuma chegar aos 3%, a linha é descartada.
            bruto = sum(segs.values()) * taxa
            escala, desvio = min(
                ((e, abs(bruto * e - rev_bd) / rev_bd) for e in ESCALAS),
                key=lambda x: x[1])

            if desvio > TOL:
                print(f"{tk:5} {ano}  NÃO FECHA: melhor soma {bruto*escala/1e9:,.2f}B vs "
                      f"receita {rev_bd/1e9:,.2f}B ({desvio:.1%}) — descartado")
                falhou += 1
                continue
            seg_usd = {limpar(k): v * taxa * escala for k, v in segs.items()}

            # LINHAS DE RECONCILIAÇÃO, não segmentos. A Saint-Gobain põe as
            # eliminações inter-segmentos em "Autres" (-1,3B) e a Safran a
            # cobertura cambial em "Couverture de change" (-0,16B). Fazem parte
            # da partição — é por isso que ela fecha — mas não são receita de
            # ninguém, e no gráfico saem como barra invertida.
            # Retiram-se, e EXIGE-SE que a partição continue a fechar sem elas:
            # se a reconciliação for grande demais para ser desprezada, o
            # exercício é descartado em vez de ficar com uma soma errada.
            neg = {k: v for k, v in seg_usd.items() if v < 0}
            if neg:
                restante = {k: v for k, v in seg_usd.items() if v >= 0}
                d2 = abs(sum(restante.values()) - rev_bd) / rev_bd
                if d2 > TOL:
                    print(f"{tk:5} {ano}  reconciliação grande demais "
                          f"({', '.join(neg)}): sem ela desvia {d2:.1%} — descartado")
                    falhou += 1
                    continue
                seg_usd, desvio = restante, d2

            fechou += 1
            print(f"{tk:5} {ano}  fecha a {desvio:.2%} — " +
                  " | ".join(f"{k[:26]} {v/1e9:,.2f}B" for k, v in
                             sorted(seg_usd.items(), key=lambda x: -x[1])[:4]))
            if args.dry_run:
                continue
            cur.execute(
                'UPDATE fundamentals SET "revenueSegments"=%s, "revenueSegmentsByAxis"=%s, '
                '"updatedAt"=NOW() WHERE id=%s',
                (Json(seg_usd), Json({"business": seg_usd}), fid))
            escritas += 1

        if not args.dry_run:
            conn.commit()

    print(f"\n{fechou} exercícios fecharam, {falhou} descartados, {escritas} gravados.")
    conn.close()


if __name__ == "__main__":
    main()
