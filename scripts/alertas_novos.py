"""
Alertas do validador SÓ dos filings novos — o termómetro do motor daqui para a frente.

A pergunta que interessa depois de cancelar a FMP não é "quantos alertas há na base"
(os antigos já foram vistos), é "os filings que chegaram esta semana extraíram bem?".
Cada alerta é triado:

  padrão   o mesmo motivo em ≥3 empresas novas → provável regra geral em falta no motor
           (corrige-se no motor, com teste, e beneficia todas as empresas)
  isolado  uma ou duas empresas → caso da empresa (N/A, ou correção com prova)

  python3 scripts/alertas_novos.py                 # filings dos últimos 8 dias
  python3 scripts/alertas_novos.py --desde 2026-10-15
Em GitHub Actions escreve o resumo em $GITHUB_STEP_SUMMARY.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
RELATORIO = os.path.join(AQUI, ".cache", "validacao.json")
PADRAO_MIN_EMPRESAS = 3


def alertas_desde(desde: str, caminho: str = RELATORIO) -> list[dict]:
    try:
        dados = json.load(open(caminho))
    except (OSError, ValueError):
        return []
    return [a for a in dados.get("alertas", []) if (a.get("filed") or "") >= desde]


def triar(alertas: list[dict]) -> list[dict]:
    """[{motivo, nivel, empresas, casos, tipo, exemplos}] ordenado por nº de empresas."""
    grupos: dict = collections.defaultdict(list)
    for a in alertas:
        grupos[(a["nivel"], a["motivo"])].append(a)
    out = []
    for (nivel, motivo), xs in grupos.items():
        emp = sorted({a["ticker"] for a in xs})
        out.append({"motivo": motivo, "nivel": nivel, "empresas": len(emp), "casos": len(xs),
                    "tipo": "padrão" if len(emp) >= PADRAO_MIN_EMPRESAS else "isolado",
                    "exemplos": [f"{a['ticker']} {a['periodo']} ({a['campo']})" for a in xs[:6]]})
    return sorted(out, key=lambda g: (-g["empresas"], -g["casos"]))


def markdown(desde: str, grupos: list[dict], n_alertas: int) -> str:
    linhas = [f"### Alertas do validador — filings desde {desde}", ""]
    if not grupos:
        return "\n".join(linhas + ["Nenhum alerta nos filings novos.", ""])
    padroes = [g for g in grupos if g["tipo"] == "padrão"]
    linhas.append(f"{n_alertas} alertas · {len(padroes)} padrão(ões) a rever no motor · "
                  f"{len(grupos) - len(padroes)} motivo(s) isolado(s)")
    linhas += ["", "| tipo | motivo | empresas | casos | exemplos |", "|---|---|---|---|---|"]
    for g in grupos:
        linhas.append(f"| {g['tipo']} | {g['motivo']} ({g['nivel']}) | {g['empresas']} | {g['casos']} | "
                      f"{', '.join(g['exemplos'])} |")
    return "\n".join(linhas + [""])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", default=(dt.date.today() - dt.timedelta(days=8)).isoformat())
    args = ap.parse_args()
    al = alertas_desde(args.desde)
    md = markdown(args.desde, triar(al), len(al))
    print(md)
    resumo = os.getenv("GITHUB_STEP_SUMMARY")
    if resumo:
        with open(resumo, "a") as fh:
            fh.write(md + "\n")


if __name__ == "__main__":
    main()
