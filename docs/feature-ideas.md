# BullVision — Feature Ideas

Curated roadmap of features that fit a **value-investing** platform (Qualtrim-inspired) and the existing **0€ data sources** (SEC EDGAR, Finnhub, Polygon, Gemini). Each notes **value · effort · data source**.

> ✅ **Insider Activity** — *shipped this pass.* SEC Form 4 buys/sells per company (model + API + `InsiderActivity` UI on the stock page + `ingest_insider.py` weekly). Run `prisma migrate dev` + the workflow to populate.

---

## 🥇 Recommended next 3 (high value, mostly existing data)

### 1. Dividend Safety & History
10y dividend-per-share chart, growth streak, payout ratio, and **FCF coverage** (can they afford it?). Pairs with the existing "Dividend Growth" tab.
**Value:** ★★★ · **Effort:** S · **Data:** `fundamentals.dividendPerShare` + FCF (already stored).

### 2. Valuation History Bands
Plot historical **P/E, P/FCF, EV/EBITDA** vs today → "is it cheap relative to its *own* history?". The single most-requested value tool.
**Value:** ★★★ · **Effort:** M · **Data:** `prices` × `fundamentals` (computed at load).

### 3. Quality / Moat Score ("BullVision Score")
One composite 0–100 from ROIC consistency, margin stability, FCF positivity, low share dilution, and balance-sheet strength. A signature, ownable metric.
**Value:** ★★★ · **Effort:** M · **Data:** existing `fundamentals` (pure calc in `lib/finance/`).

---

## 🥈 Strong follow-ups

### 4. Real metric screener
The dashboard tabs are curated lists today (per CLAUDE.md). A true screener — ROIC > x, FCF yield > y, revenue CAGR > z, net cash, buyback yield — is the flagship discovery feature. *Gated on ingestion data quality (revenue XBRL tags).*
**Value:** ★★★ · **Effort:** L · **Data:** `fundamentals` (needs ingestion cleanup first).

### 5. Peer / sector comparison
Compare a stock against sector peers on P/E, ROIC, margins, growth — relative value at a glance.
**Value:** ★★ · **Effort:** M · **Data:** `fundamentals` + `sector`.

### 6. Buyback tracker
Net buyback yield from the `sharesOutstanding` trend (powers the "Buyback Machines" tab properly).
**Value:** ★★ · **Effort:** S · **Data:** `fundamentals.sharesOutstanding`.

### 7. Institutional ownership (13F)
Top holders and QoQ changes — "what's the smart money doing?". Complements insider activity.
**Value:** ★★ · **Effort:** M · **Data:** Finnhub `/stock/fund-ownership` or SEC 13F.

---

## 🥉 Bigger bets / differentiators

### 8. AI filing & earnings-call summaries
Extend AI Insights to summarize the latest 10-K/10-Q or earnings call (key changes, risks, guidance).
**Value:** ★★★ · **Effort:** L · **Data:** SEC filings + Gemini.

### 9. Watchlist alerts
Email/push on price target, upcoming earnings, **insider buys**, or dividend changes. Big retention driver.
**Value:** ★★★ · **Effort:** L · **Data:** existing + a background job (GitHub Actions/cron) + email.

### 10. Investment thesis journal
Per-stock notes + a one-line thesis and conviction level. Cheap to build, very sticky.
**Value:** ★★ · **Effort:** S · **Data:** new `Thesis` model.

---

## Notes
- Prioritise features that reuse stored `fundamentals`/`prices` (no new ingestion, no API cost).
- Keep everything **price-dependent computed at load** (never stored) per CLAUDE.md.
- Each new data feature follows the same spine as Insider Activity: **schema → migration → API → UI (Golden Terminal) → i18n → ingestion script + workflow**.
