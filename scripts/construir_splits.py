"""
construir_splits.py — Constrói o catálogo local de stock splits por eventos.

Lê os ficheiros `splits.json.gz` da exportação FMP em:
  ~/Documents/BullValue/Exportacao-FMP-2026-11-18/empresas/<TICKER>/splits.json.gz

Empresas sem ficheiro (ex.: exportação ainda a correr) são ignoradas sem erro.
Apenas eventos com `splitType == "stock-split"` entram no catálogo: na API FMP,
`spin-off`, `stock-dividend` e `adr-change` aparecem neste endpoint para ajustar
preços históricos, mas os fundamentais por ação da própria FMP não são ajustados
por esses eventos.

Escreve `scripts/splits_eventos.json` no formato:
  {ticker: [{"data": "AAAA-MM-DD", "fator": numerator / denominator}]}

Uso:
  python3 scripts/construir_splits.py
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
from collections.abc import Iterable

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

DEFAULT_FMP_DIR = os.path.expanduser("~/Documents/BullValue/Exportacao-FMP-2026-11-18/empresas")
DEFAULT_OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "splits_eventos.json")


def ler_splits_fmp(pasta_empresas: str = DEFAULT_FMP_DIR) -> tuple[dict[str, list[dict]], dict[str, int]]:
    """Lê `splits.json.gz` de cada subpasta `<TICKER>` na exportação FMP.

    Devolve `(eventos_por_ticker, estatisticas)`.
    """
    stats = {
        "pastas_empresas": 0,
        "ficheiros_lidos": 0,
        "sem_ficheiro": 0,
        "eventos_aceites": 0,
        "ignorados_tipo": 0,
        "ignorados_invalidos": 0,
    }
    if not os.path.isdir(pasta_empresas):
        print(f"⚠️ Pasta de exportação FMP não encontrada: {pasta_empresas}")
        return {}, stats

    por_ticker: dict[str, list[dict]] = {}
    for nome in sorted(os.listdir(pasta_empresas)):
        dir_emp = os.path.join(pasta_empresas, nome)
        if not os.path.isdir(dir_emp):
            continue
        stats["pastas_empresas"] += 1
        caminho = os.path.join(dir_emp, "splits.json.gz")
        if not os.path.exists(caminho):
            stats["sem_ficheiro"] += 1
            continue

        try:
            with gzip.open(caminho, "rt", encoding="utf-8") as f:
                dados = json.load(f)
        except Exception as e:
            print(f"⚠️ Erro ao ler {caminho}: {e}")
            continue

        stats["ficheiros_lidos"] += 1
        if not isinstance(dados, list):
            continue

        eventos: list[dict] = []
        for item in dados:
            if not isinstance(item, dict):
                stats["ignorados_invalidos"] += 1
                continue
            if item.get("splitType") != "stock-split":
                stats["ignorados_tipo"] += 1
                continue
            data = item.get("date")
            num = item.get("numerator")
            den = item.get("denominator")
            if (
                not isinstance(data, str)
                or len(data) < 10
                or not isinstance(num, (int, float))
                or not isinstance(den, (int, float))
                or num <= 0
                or den <= 0
            ):
                stats["ignorados_invalidos"] += 1
                continue
            fator = float(num) / float(den)
            if fator == 1.0:
                continue
            eventos.append({"data": data[:10], "fator": fator})

        if eventos:
            eventos.sort(key=lambda ev: ev["data"])
            por_ticker[nome] = eventos
            stats["eventos_aceites"] += len(eventos)

    return por_ticker, stats


def ler_splits_polygon() -> dict[str, list[dict]]:
    """Ponto de extensão reservado para futura fonte Polygon (/v3/reference/splits)."""
    raise NotImplementedError("Fonte Polygon ainda não implementada")


def combinar_fontes(fontes: Iterable[dict[str, list[dict]]]) -> dict[str, list[dict]]:
    """Funde listas de splits de múltiplas fontes, deduplicando por `(ticker, data)`.

    Fontes posteriores na sequência sobrepõem entradas com a mesma data ou
    preenchem tickers ausentes das fontes anteriores.
    """
    combinado: dict[str, dict[str, float]] = {}
    for fonte in fontes:
        for ticker, eventos in fonte.items():
            mapa_datas = combinado.setdefault(ticker, {})
            for ev in eventos:
                data = str(ev["data"])[:10]
                fator = float(ev["fator"])
                if fator <= 0 or fator == 1.0:
                    continue
                mapa_datas[data] = fator

    return {
        ticker: [{"data": d, "fator": mapa[d]} for d in sorted(mapa)]
        for ticker, mapa in sorted(combinado.items())
        if mapa
    }


def construir_splits(
    pasta_fmp: str = DEFAULT_FMP_DIR,
    saida: str = DEFAULT_OUT_PATH,
    fontes_extra: Iterable[dict[str, list[dict]]] = (),
) -> tuple[dict[str, list[dict]], dict[str, int]]:
    """Constrói e grava `splits_eventos.json` combinando FMP e eventuais fontes extra."""
    fmp_eventos, stats = ler_splits_fmp(pasta_fmp)
    eventos = combinar_fontes([fmp_eventos, *fontes_extra])

    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(eventos, f, ensure_ascii=False, indent=2)
        f.write("\n")

    return eventos, stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Constrói scripts/splits_eventos.json a partir da exportação FMP.")
    parser.add_argument("--origem", default=DEFAULT_FMP_DIR, help="Pasta empresas/ da exportação FMP")
    parser.add_argument("--saida", default=DEFAULT_OUT_PATH, help="Caminho JSON de saída")
    args = parser.parse_args()

    eventos, stats = construir_splits(pasta_fmp=args.origem, saida=args.saida)
    total_eventos = sum(len(v) for v in eventos.values())
    print(
        f"Splits construídos: {len(eventos)} empresas com {total_eventos} eventos "
        f"(lidos {stats['ficheiros_lidos']}/{stats['pastas_empresas']} ficheiros FMP; "
        f"{stats['sem_ficheiro']} sem ficheiro; "
        f"{stats['ignorados_tipo']} não stock-split ignorados) -> {args.saida}"
    )


if __name__ == "__main__":
    main()
