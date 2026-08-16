#!/usr/bin/env python3
"""
canonicalize_segment_labels.py — unifica grafias do MESMO rótulo de segmento
que já estão gravadas na BD. NÃO APAGA NADA e NÃO fala com a SEC.

Porquê existir, em vez de re-ingerir:
  O `ingest_segments_xbrl.py` já unifica rótulos (canonicalize_labels), mas só
  sobre os períodos que aquela passagem extraiu. Para corrigir o histórico todo
  seria preciso re-extrair ~10 anos por empresa — horas de rede e risco de
  rate-limit da SEC — quando os VALORES já estão certos: só as CHAVES do JSONB
  é que têm grafias diferentes. Este script reescreve as chaves in loco.

O defeito que corrige (cohort LABEL_CHURN):
  O membro XBRL é estável entre filings mas o texto do label linkbase não. A
  Chipotle escreve "Delivery Service" até 2021 e "Delivery service revenue" a
  partir de 2022, com o mesmo cmg:DeliveryServiceMember por baixo — o gráfico
  desenhava DUAS séries, cada uma com metade do histórico.

Regra: dentro de cada empresa e cada eixo, as grafias que normalizam para a
mesma chave são unificadas na variante do período MAIS RECENTE (a nomenclatura
atual da empresa). Empresas com rótulos estáveis não são tocadas.

Uso:
  python scripts/canonicalize_segment_labels.py                # dry-run
  python scripts/canonicalize_segment_labels.py --tickers CMG,ACN
  python scripts/canonicalize_segment_labels.py --apply
"""
import argparse
import json
import os
import sys
from collections import defaultdict

import psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(HERE, "..", ".env.dev")
if os.path.exists(ENV_FILE):
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida")

# Reutiliza a MESMA normalização do extrator, para os dois caminhos não
# divergirem: se um unificar e o outro não, a churn volta na próxima ingestão.
sys.path.insert(0, HERE)
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "_seg_ing", os.path.join(HERE, "ingest_segments_xbrl.py")
)
_seg = importlib.util.module_from_spec(_spec)
try:
    _spec.loader.exec_module(_seg)
except SystemExit:
    pass
_label_key = _seg._label_key
_escolher_canonico = _seg.escolher_canonico


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", help="lista separada por vírgulas; omitir = todas")
    ap.add_argument("--apply", action="store_true", help="escreve; sem isto só relata")
    args = ap.parse_args()

    conn = psycopg2.connect(DIRECT_URL)
    cur = conn.cursor()

    filtro, params = "", []
    if args.tickers:
        alvos = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
        filtro, params = "AND c.ticker = ANY(%s)", [alvos]

    cur.execute(
        f'''SELECT f.id, c.ticker, f."periodEnd"::date, f."revenueSegments",
                   f."revenueSegmentsByAxis"
            FROM fundamentals f JOIN companies c ON c.id = f."companyId"
            WHERE (f."revenueSegments" IS NOT NULL
                   OR f."revenueSegmentsByAxis" IS NOT NULL) {filtro}
            ORDER BY c.ticker, f."periodEnd"''',
        params,
    )
    linhas = cur.fetchall()
    print(f"{len(linhas)} linhas com segmentos a analisar.")

    por_empresa = defaultdict(list)
    for rid, ticker, pend, seg, axis in linhas:
        por_empresa[ticker].append((rid, pend, seg, axis))

    # Canónico por (empresa, eixo, chave normalizada). O eixo "" é o mapa plano
    # revenueSegments. A escolha entre grafias é a MESMA função do extrator,
    # importada — se as duas divergissem, a churn voltava na próxima ingestão.
    vistas: dict = {}

    def _ver(ticker, eixo, rot):
        k = (ticker, eixo, _label_key(rot))
        vistas.setdefault(k, [])
        if rot not in vistas[k]:
            vistas[k].append(rot)

    for ticker, regs in por_empresa.items():
        # Da mais recente para a mais antiga: é a ordem de desempate.
        for _rid, _pend, seg, axis in sorted(regs, key=lambda r: r[1], reverse=True):
            for rot in (seg or {}):
                _ver(ticker, "", rot)
            for eixo, mapa in (axis or {}).items():
                if isinstance(mapa, dict):
                    for rot in mapa:
                        _ver(ticker, eixo, rot)
    # escolher_canonico já devolve o rótulo limpo, o que também apanha os casos
    # de variante ÚNICA com '[member]' pendurado ou espaço não-quebrável — não
    # é churn, é ruído de exibição, e vale a pena tirá-lo na mesma passagem.
    canonico = {k: _escolher_canonico(v) for k, v in vistas.items()}

    def _reescrever(ticker, eixo, mapa):
        """Devolve (novo_mapa, n_trocas) ou (None, 0) se nada muda."""
        if not isinstance(mapa, dict):
            return None, 0
        novo, trocas = {}, 0
        for rot, val in mapa.items():
            alvo = canonico.get((ticker, eixo, _label_key(rot)), rot)
            if alvo != rot:
                trocas += 1
            # Duas grafias no MESMO período seriam segmentos distintos que
            # colapsaram por engano — ficar com o maior, nunca somar às cegas.
            novo[alvo] = max(novo[alvo], val) if alvo in novo else val
        return (novo, trocas) if trocas else (None, 0)

    updates, tot_trocas = [], 0
    empresas_tocadas = set()
    for ticker, regs in por_empresa.items():
        for rid, _pend, seg, axis in regs:
            nseg, t1 = _reescrever(ticker, "", seg)
            naxis, t2 = None, 0
            if isinstance(axis, dict):
                cand, mud = {}, 0
                for eixo, mapa in axis.items():
                    m, t = _reescrever(ticker, eixo, mapa)
                    cand[eixo] = m if m is not None else mapa
                    mud += t
                if mud:
                    naxis, t2 = cand, mud
            if t1 or t2:
                updates.append((rid, nseg if t1 else None, naxis))
                tot_trocas += t1 + t2
                empresas_tocadas.add(ticker)

    print(f"\nEmpresas a corrigir: {len(empresas_tocadas)}")
    print(f"Linhas a reescrever: {len(updates)}")
    print(f"Rótulos unificados:  {tot_trocas}")

    if empresas_tocadas:
        print("\nExemplos:")
        vistos = set()
        for (tk, eixo, k), alvo in canonico.items():
            if tk in empresas_tocadas and tk not in vistos:
                variantes = {
                    r
                    for _rid, _pe, s, _a in por_empresa[tk]
                    for r in (s or {})
                    if _label_key(r) == k
                }
                if len(variantes) > 1:
                    print(f"  {tk}: {sorted(variantes)} -> {alvo!r}")
                    vistos.add(tk)
            if len(vistos) >= 8:
                break

    if not args.apply:
        print("\nDry-run — nada escrito. Correr com --apply.")
        return

    for rid, nseg, naxis in updates:
        sets, vals = [], []
        if nseg is not None:
            sets.append('"revenueSegments" = %s')
            vals.append(json.dumps(nseg))
        if naxis is not None:
            sets.append('"revenueSegmentsByAxis" = %s')
            vals.append(json.dumps(naxis))
        vals.append(rid)
        cur.execute(f'UPDATE fundamentals SET {", ".join(sets)} WHERE id = %s', vals)
    conn.commit()
    print(f"\nAplicado: {len(updates)} linhas, {tot_trocas} rótulos unificados.")
    conn.close()


if __name__ == "__main__":
    main()
