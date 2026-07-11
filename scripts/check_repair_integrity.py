"""
check_repair_integrity.py — Sentinela contra mutações silenciosas do pipeline.

Contexto: durante a reparação de 2026-07 detetámos EDIÇÕES CONCORRENTES no
ingest_fundamentals.py feitas pelo agente do IDE (Antigravity) — uma removeu
"dividendPerShare" de SUBTRACTIVE e reintroduziu um tag no bucket errado.
Este script verifica as invariantes load-bearing da reparação em ~1s.

Uso: python scripts/check_repair_integrity.py   (exit 1 se algo falhar)
Correr SEMPRE antes de dry-runs/re-ingest e antes de cada commit.
"""

import os
import re
import sys
import inspect

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(__file__))
import ingest_fundamentals as ing

FAILS = []


def check(name: str, ok: bool, detail: str = ""):
    print(f"  {'✓' if ok else '✗ FALHOU'}  {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        FAILS.append(name)


src_synth = inspect.getsource(ing.synthesize_q4)
sub_block = src_synth[src_synth.find("SUBTRACTIVE"):src_synth.find("]", src_synth.find("SUBTRACTIVE"))]

check("SUBTRACTIVE contém dividendPerShare (síntese Q4 de DPS)",
      '"dividendPerShare"' in sub_block, "removido — paradoxo da Apple volta")

check("derive_q4_dps existe e alinha bases de split",
      hasattr(ing, "derive_q4_dps") and abs(ing.derive_q4_dps(0.75, [0.73, 0.73, 0.77]) - 0.1925) < 1e-9)

check("NoncurrentLiabilities FORA de longTermDebt (IFRS ≠ dívida)",
      "NoncurrentLiabilities" not in ing.INSTANT_TAGS["longTermDebt"])

capex = ing.DURATION_TAGS["capex"]
check("capex: ConstructionInProcess ANTES de ProductiveAssets (AEP 7.6B vs 0.4B)",
      capex.index("PaymentsForConstructionInProcess") < capex.index("PaymentsToAcquireProductiveAssets"))

check("capex sem tags de buyback/treasury",
      not any(re.search(r"Treasury|RepurchaseOfCommonStock|OrRedeem", t) for t in capex))

check("VALID_CURRENCIES inclui DKK/SEK/NOK (NVO/ERIC)",
      all(c in ing.VALID_CURRENCIES for c in ("DKK", "SEK", "NOK")))

check("FX é Frankfurter/BCE (sem yfinance no câmbio)",
      "frankfurter" in inspect.getsource(ing.apply_fx_conversion).lower()
      or "get_fx_series" in inspect.getsource(ing.apply_fx_conversion))

check("compute_company_evidence com as 3 flags",
      all(k in ing.compute_company_evidence({}) for k in ("is_dividend_payer", "has_rnd_ever", "has_ltd_ever")))

check("build_row aceita evidence",
      "evidence" in inspect.signature(ing.build_row).parameters)

src_build = inspect.getsource(ing.build_row)
check("política DPS: payer em falta → NULL (sem força-0.0 cega)",
      'evidence["is_dividend_payer"]' in src_build)
check("guard JPM-class no totalDebt (has_ltd_ever)",
      'has_ltd_ever' in src_build)
check("EBITDA de Financials é NULL estrutural",
      'elif sector == "Financials":' in src_build)
check("fabricação grossProfit=revenue de bancos REMOVIDA",
      "gross_profit is None and revenue is not None" not in src_build.split('sector == "Financials"')[1][:600]
      if 'sector == "Financials"' in src_build else False)

check("eps por-share BasicAndDiluted mapeado (WDAY/WBD)",
      "EarningsPerShareBasicAndDiluted" in ing.DURATION_TAGS["epsDiluted"])

check("assert_local_db ativo",
      hasattr(ing, "assert_local_db"))

src_pc = inspect.getsource(ing.process_company)
check("FX falhado aborta escrita da empresa",
      "return 0" in src_pc.split("if not apply_fx_conversion")[1][:600])
check("namespace escolhido por tamanho (BTI/DEO-class)",
      "len(ns_us) >= len(ns_ifrs)" in src_pc)

if FAILS:
    print(f"\n✗ {len(FAILS)} invariante(s) violada(s): {FAILS}")
    sys.exit(1)
print("\n✓ Integridade OK — pipeline seguro para correr.")
