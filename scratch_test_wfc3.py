from scripts.ingest_fundamentals import build_row
row = build_row("wfc", 2025, "ANNUAL", "2025-12-31", "2026-02-01", {}, {}, "Financials")
print(f"Sector Financials, capex: {row['capex']}")
