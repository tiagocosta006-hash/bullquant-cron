# Features Roadmap Evaluation — BullVision

> Audit date: 2026-07-02 · Inputs: `docs/feature-ideas.md` (10 ideas), team proposals (Community layer, Pro AI Analyst per `docs/pro-features-roadmap.md`), current schema and data-pipeline state.
> Verdicts are decisive by design. Index at [AUDIT-INDEX.md](AUDIT-INDEX.md).

## The one constraint that orders everything

Two features on this list (Real Screener, BullVision Score) and half the value of a third (Valuation Bands) are **downstream of ingestion data quality**. CLAUDE.md §10 already admits "revenues com tags XBRL erradas" blocks real screening. Any feature that computes across *all 500 companies* amplifies bad data into visible nonsense; features scoped to *one company at a time* let a human sanity-check the chart. That is why per-company features rank first below, and why "fix ingestion data quality" appears as a prerequisite row even though it is not a feature.

The second structural fact: **there is no billing**. `User.plan` exists, but nothing sells PRO (the only plan mutation is the dev-only toggle — see security report S10). Every "Pro" feature has Stripe (or equivalent) as a hidden prerequisite.

## Prioritized table (build order)

| # | Feature | Value | Effort | Data available today? | Free/Pro | Schema changes | Prerequisite |
|---|---|---|---|---|---|---|---|
| 1 | **Dividend Safety & History** | ★★★ | S | ✅ `dividendPerShare`, `freeCashFlow`, `netIncome` in `fundamentals` | Free | none | none — build now |
| 2 | **Buyback Tracker** | ★★ | S | ✅ `sharesOutstanding` trend | Free | none | none — bundle with #1 |
| 3 | **Valuation History Bands** | ★★★ | M | ✅ `prices` × `fundamentals` | Free | none (optional cache table later) | none — build next |
| 4 | *(infra)* Ingestion data-quality fix + backfill | — enabler — | M | — | — | none | none — run in parallel with #1–3 |
| 5 | **BullVision Score** | ★★★ | M | ✅ pure calc off `fundamentals` | Free (marketing hook) | optional `Company.bullScore` cache column | #4 — a signature score on bad data burns the brand once |
| 6 | **Real Screener** | ★★★ | M (not L — half-built) | ⚠️ blocked by data quality | Free basic / Pro advanced filters | indexes only (see [db-optimization.md](db-optimization.md)) | #4; `/api/screener/route.ts` already does sector/margin/ROIC/earnings-yield |
| 7 | **Thesis Journal** | ★★ | S | n/a (user content) | Free (3 notes) / Pro unlimited | new `Thesis` model | none — gap-week feature |
| 8 | **Watchlist Alerts** | ★★★ | L | ✅ + needs email + cron | Pro (Free: 1 alert) | `Alert` model | email provider (Resend); GitHub Actions cron exists as pattern |
| 9 | **Pro AI Analyst (chat + tools)** | ★★★ — the Pro flagship | L | ✅ metrics; filings need #10's pipeline | **Pro** (credits) | `ChatSession`, `ChatMessage` | **billing**; detailed design below |
| 10 | **AI Filing Summaries** | ★★★ | L | needs 10-K/10-Q text ingestion | Pro | `FilingSummary` model | build **as the retrieval layer of #9**, not standalone |
| 11 | **Peer Comparison** | ★★ | M | ✅ sector field + fundamentals | Free | none | after #5 (reuses Score components) |
| 12 | **13F Institutional** | ★★ | M | ❌ new SEC 13F pipeline | Pro | `InstitutionalHolding` model | v2 — don't build in the next two quarters |
| — | **Community layer** | see verdict | XL | n/a | n/a | large (posts/comments/moderation) | **Not a feature — a separate product. Do not build into the app.** |

## Verdicts in one line each

- **Build now (this month):** Dividend Safety, Buyback Tracker, Valuation Bands — all data is already in PostgreSQL, all are per-company (data-quality safe), all are S/M effort, and together they complete the "10 years of visual fundamentals" promise that is the product's core pitch.
- **Build after the data fix:** BullVision Score, Real Screener.
- **Build for v1 monetization:** Watchlist Alerts, then Pro AI Analyst (with Filing Summaries as its retrieval layer) — in that order, because Alerts creates the retention habit that makes a Pro subscription defensible before the flashier AI ships.
- **Deprioritize:** Peer Comparison (v1 tail), 13F (v2), Thesis Journal (whenever a small win is needed).
- **Reject as an in-app feature:** Community layer.

---

## Top-5 detailed breakdowns

### 1. Dividend Safety & History — build now

**What:** On `/stock/[ticker]`, a card: 10-year DPS bar chart, growth-streak counter ("12 anos consecutivos a aumentar"), payout ratio (DPS×shares / netIncome), FCF coverage (dividends paid / FCF), and a three-state safety badge (Segura / Atenção / Em risco) from payout <60% / 60–90% / >90% plus FCF coverage.
**Why first:** PT/EU retail value investors are disproportionately dividend investors; no PT-language tool does this. Every input is already in the `fundamentals` table — this is a `lib/finance/dividends.ts` module plus one component, following the exact pattern of the existing 9 Decision Engine charts (`FinancialsEngine`).
**Effort:** 2–4 days. **Risk:** dividend data completeness in EDGAR ingestion — spot-check 20 dividend aristocrats before shipping the badge; ship the chart without the badge if coverage is patchy.

### 2. Valuation History Bands — build next

**What:** For P/E, P/FCF, EV/EBITDA: compute the daily historical multiple over 10 years (price series × trailing fundamentals), then render the current multiple against its own 10y percentile bands (P10/median/P90) — "a AAPL está cara *para o seu próprio histórico*?"
**Why:** This is the single highest-differentiation chart vs. free competitors, and it reframes valuation for beginners without advice-giving.
**How:** Server-side computation joining `prices` (already `(ticker,date)`-indexed) with quarterly `fundamentals` stepped forward per period; ~2.5k price rows × lookup per ticker is cheap. Cache the computed series with `unstable_cache` 24h. No schema change; if it later proves hot, add a `valuation_daily` cache table — not before.
**Effort:** ~1 week including TTM-alignment subtleties (use the same TTM logic FinancialsEngine already has). **Trap to avoid:** mixing fiscal-period boundaries — off-by-one-quarter makes bands visibly wrong for anyone who checks against Qualtrim.

### 3. BullVision Score — after the data fix, and rename it

**What:** Composite 0–100 from five pillars (ROIC consistency, margin stability, FCF positivity streak, dilution trend, balance-sheet strength), shown as a gold dial on every stock page — the signature, ownable metric. `docs/feature-ideas.md:19` still calls it "BullVision Score"; it is the **BullVision Score** (see frontend report F1).
**Why gated:** A score is a *claim*. One viral screenshot of "Score 92" on a company with garbage revenue data (the known XBRL tag problem) costs more credibility than the feature earns. Fix ingestion, backfill, spot-check 50 companies, then ship.
**How:** Pure functions in `lib/finance/score.ts` (per CLAUDE.md §7 — testable, no UI). Compute at page load from the fundamentals already fetched; add a nightly-computed `Company.bullScore` column only when the screener needs to sort by it.
**Effort:** 1 week calc+UI, plus the methodology doc — publish the formula openly; transparency is the moat against "black box score" criticism.

### 4. Real Screener — unblock, don't rebuild

**What exists:** `/api/screener/route.ts` already filters sector, gross margin, ROIC, revenue, earnings yield across ANNUAL fundamentals with a working results table. What's missing vs. the vision: revenue CAGR, FCF yield, buyback yield, net-cash filters — and trustworthy data underneath.
**Do:** (a) fix XBRL revenue tags in `ingest_fundamentals.py` + re-run backfill; (b) add the Zod validation from backend report B2; (c) add CAGR/buyback-yield as computed filter options (both derivable from existing columns); (d) add the `Fundamental` indexes from [db-optimization.md](db-optimization.md) *at that moment, not before*. Free tier keeps 3 filters; Pro unlocks all + saved screens (new `SavedScreen` model, trivially like `DcfAnalysis`).
**Effort:** M — the L rating in feature-ideas.md predates the half-built route.

### 5. Pro AI Analyst — the Pro flagship, designed concretely

**Product shape** (per `docs/pro-features-roadmap.md`): a chat panel on `/stock/[ticker]`, Pro-only, that answers "porque caiu a margem bruta no Q3 2023?" by *pulling real numbers from the DB and citing them* — never free-associating.

**Vercel AI SDK v7 primitives** (already installed: `ai@^7.0.4`, `@ai-sdk/google@^4.0.2`):
- `streamText` with `tools` and a step limit (`stopWhen: stepCountIs(5)`) — the model loops: call tool → read result → answer.
- `tool()` definitions with Zod input schemas (Zod 4 already installed):
  - `getFundamentals({ ticker, metric, periodType, from, to })` → Prisma query on `fundamentals` (the B1-fixed selective query);
  - `getPriceRange({ ticker, from, to })` → `prices`;
  - `getFilingSummary({ ticker, fiscalYear, section })` → reads the `FilingSummary` table produced by feature #10's weekly ingestion (10-K MD&A + risk sections summarized once by Gemini, stored — this is the "RAG" and it needs **no vector database**: retrieval is by (ticker, year, section) key, which matches how users actually ask);
  - `getInsiderActivity({ ticker })` → existing `insider_transactions`.
- Frontend: `useChat` from `@ai-sdk/react` + `toUIMessageStreamResponse()` in a new `/api/ai/chat` route — streaming, tool-call status chips ("A consultar fundamentais…").
- Model: `GEMINI_MODEL` env var per CLAUDE.md §1 — never hardcoded.

**Do not build pgvector/embeddings in v1.** Structured tools + keyed filing summaries answer the example questions in the roadmap doc. Add semantic search over full filing text only when real user questions demonstrably miss — that is a v2 escalation with evidence.

**Schema:**
```prisma
model ChatSession  { id, userId, companyId, createdAt; messages ChatMessage[] }
model ChatMessage  { id, sessionId, role, content @db.Text, tokensIn Int?, tokensOut Int?, createdAt }
```
Credits ride on the existing `AIUsageLog` pattern: N messages/month on Pro, hard-stop with a friendly 429 (same UX as `/api/ai/brief` today).

**Token economics (Gemini Flash class):** system prompt + tool definitions ≈ 2k tokens; per turn ≈ 3–8k in (tool results dominate), ≈ 0.5k out. A 10-turn session ≈ 80–120k in / 6k out ≈ **$0.03–0.06 per session** at current Flash pricing. At 9–15 €/month Pro with a 100-session cap, AI cost is <5% of revenue — credits protect the tail, not the average.

**Guardrails (CLAUDE.md §9):** system prompt must instruct "answer only from tool results; if tools return nothing, say 'Dados insuficientes para análise'" — the anti-hallucination rule already applied to AI Insights. Plus the standard "não é conselho de investimento" footer on every response.

**Prerequisite reality:** billing does not exist. Sequence: Stripe checkout + webhook → `User.plan=PRO` (1 week) → Alerts (retention) → AI Analyst. Shipping the flagship before anyone can pay for it produces a demo, not a business.

---

## Community layer — verdict: separate product, not a feature

**The question was "feature or separate product?" It is a separate product**, and it should not enter this codebase in MVP or v1:

1. **Moderation burden is a full workstream.** User-generated investment theses in the EU trigger DSA obligations (notice-and-action, transparency), plus the reputational risk of hosted financial claims. That is an ops function the three-person team does not have.
2. **Schema and surface area explode.** Posts, comments, reactions, follows, reports, bans, notifications — more models than the entire current app, attached to an auth system that today has no admin roles.
3. **The strategic goal is already served cheaper.** `docs/01-visao.md` identifies the real need: convert Bullocracy's cold TikTok reach into a captive audience. A Discord + newsletter + "analyses become videos" flywheel does that with zero code, and the docs already propose exactly this.
4. **What to build instead, in-app:** the **Thesis Journal (#7)** — private notes are the single-player seed of community. If v2 validates demand, "publish thesis" becomes the bridge, built on data about what users actually write.

Revisit as its own project ("Bullocracy Community") only after BullVision has paying users and an admin/moderation capability exists.
