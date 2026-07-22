# Backend Audit — BullVision

> Audit date: 2026-07-02 · Scope: API routes, Prisma usage, schema, ingestion scripts, i18n. Read-only.
> Security-specific findings (auth coverage, rate limiting, CSRF, RLS) live in [security-report.md](security-report.md); DB tuning detail in [db-optimization.md](db-optimization.md).

## Priority summary

| # | Finding | Priority | Location |
|---|---|---|---|
| B1 | `/api/fundamentals/[ticker]` fetches all columns, unbounded — no `.select()`, no `take: 40` | **P1** | `app/api/fundamentals/[ticker]/route.ts:19–26` |
| B2 | `/api/screener` accepts unvalidated body — wrong types produce 500s; Zod is installed and unused | **P1** | `app/api/screener/route.ts:14–37` |
| B3 | Schema drift: 5 models + 5 fields exist only via `db push`; one migration in history | **P1** | `prisma/schema.prisma`, `prisma/migrations/` |
| B4 | No caching on weekly-refresh data (fundamentals, earnings, search, insider) | **P2** | 4 routes |
| B5 | `/api/portfolio` upserts on GET; `/api/portfolio/check` overfetches a full row for a boolean | **P2** | `app/api/portfolio/route.ts:15`, `app/api/portfolio/check/route.ts:21–30` |
| B6 | `/api/screener` joins latest price per company inside a 500-row `include` | **P2** | `app/api/screener/route.ts:46–56` |
| B7 | `ingest_ceos.py` uses yfinance, banned by CLAUDE.md §9 (documented override) | **P2** | `scripts/ingest_ceos.py:2–13` |
| B8 | `seed_companies.py` has no rate-limit sleep on Finnhub logo fetches | **P3** | `scripts/seed_companies.py:83` |
| B9 | `/api/prices/[ticker]` fetches desc + in-memory reverse instead of asc | **P3** | `app/api/prices/[ticker]/route.ts:28–39` |
| B10 | Secondary locale files (de/es/fr/it/ja/nl/zh) unaudited against pt/en key set | **P3** | `messages/` |

What is **not** wrong (verified clean): no `take: 60` anywhere (CLAUDE.md §1 compliant); no N+1 query loops; every route converts Prisma `Decimal` to `number` before JSON; no route leaks `error.message`; `pt.json`/`en.json` key sets are fully aligned; all ingestion scripts are idempotent upserts with correct rate-limit sleeps.

---

## 1. API route table (all 19 routes)

| Route | Methods | Auth | try/catch | Input validation | Caching | Rate limit |
|---|---|---|---|---|---|---|
| `api/search` | GET | ❌ public | ✅ generic | min 2 chars only | ❌ | ❌ |
| `api/price/[ticker]` | GET | ❌ public | ✅ generic | `toUpperCase()` only — see S8 in security report | Finnhub `revalidate: 60` (`:22`) | ❌ |
| `api/prices/[ticker]` | GET | ❌ public | ✅ generic | period map fallback (`:21`) | via `take` cap | ❌ |
| `api/prices/batch` | GET | ✅ | ✅ generic | tickers split/filter | 60s + 250ms chunking (`:16–17`) | soft (chunking) |
| `api/fundamentals/[ticker]` | GET | ❌ public | ✅ generic | `toUpperCase()` only | ❌ | ❌ |
| `api/earnings` | GET | ⚠️ only `watchlist=1` branch | ✅ generic | date `isNaN` check (`:21`) | ❌ | ❌ |
| `api/dcf-data/[ticker]` | GET | ❌ public | ✅ generic | minimal | Finnhub 60s | ❌ |
| `api/insider/[ticker]` | GET | ❌ public | ✅ graceful empty | minimal | ❌ | ❌ |
| `api/news/[ticker]` | GET | ❌ public | ✅ graceful empty | dedup only | Finnhub `revalidate: 900` | ❌ |
| `api/portfolio` | GET | ✅ (`:8–12`) | ✅ generic | n/a | ❌ | ❌ |
| `api/portfolio/add` | POST | ✅ | ✅ generic | ticker required, checked vs DB | ❌ | ❌ |
| `api/portfolio/remove` | DELETE | ✅ | ✅ generic | ticker required | ❌ | ❌ |
| `api/portfolio/check` | GET | ✅ (`:8–12`) | ✅ generic | ticker required (`:17–19`) | ❌ | ❌ |
| `api/dcf/analyses` | GET, POST | ✅ | ✅ generic | POST fields checked | ❌ | ❌ |
| `api/dcf/analyses/[id]` | DELETE | ✅ + owner check | ✅ generic | id + userId scoping | ❌ | ❌ |
| `api/ai/brief` | GET | ✅ (`:35–37`) | ✅ generic | ticker required | DB cache 24h (`:122–123`) | ✅ 5/day FREE (`:54–60`) |
| `api/management/[ticker]` | GET | ✅ (`:34–37`) | ✅ generic | minimal | DB cache 30d (`:108–109`) | ✅ 5/day FREE |
| `api/screener` | POST | ✅ (`:9–12`) | ✅ generic | ⚠️ none on body — B2 | ❌ | ❌ |
| `api/dev/toggle-plan` | POST | ✅ + NODE_ENV gate (`:7–9`) | ✅ generic | n/a | ❌ | ❌ |

`any` types: none found in any route handler. Error handling: uniformly `console.error` + generic client message — correct pattern throughout.

---

## 2. P1 findings

### B1 — Fundamentals route: no `.select()`, no bound (`app/api/fundamentals/[ticker]/route.ts:19–26`)

```ts
const fundamentals = await prisma.fundamental.findMany({
  where: { companyId: company.id },
  orderBy: { periodEnd: 'asc' },
})
```

Every row carries ~35 columns, most of them `Decimal` (expensive to hydrate), including fields the charts never read (`filedAt`, `createdAt`, `updatedAt`, `revenueSegments`). With ~40 quarterly + ~10 annual rows per company this is the heaviest hot-path query in the app, executed on every stock-page chart load with no cache (see B4).

**Fix, in this file at line 19:** add a `select` with exactly the fields consumed by `FinancialsEngine` (periodType, fiscalYear, fiscalQuarter, periodEnd, revenue, netIncome, epsDiluted, sharesOutstanding, operatingCashFlow, capex, freeCashFlow, grossMargin, operatingMargin, netMargin, roic, cash, totalDebt, dividendPerShare — confirm against the component), and add `take: 40` scoped per `periodType` or split into two queries (40 quarterly + 10 annual). CLAUDE.md §1 sets 40 quarters as the contract; today the bound holds only because ingestion stops at 10 years — the query should enforce it, not trust the pipeline.

### B2 — Screener body unvalidated (`app/api/screener/route.ts:14–37`)

```ts
const { sector, minGrossMargin, minRoic, minRevenue, minEarningsYield } = body
...
if (minGrossMargin) { whereClause.grossMargin = { gte: minGrossMargin } }
```

Three defects in one block:
1. **No type validation** — `minGrossMargin: "abc"` reaches Prisma, throws a validation error, and surfaces as a 500 instead of a 400.
2. **Falsy-skip bug** — `if (minGrossMargin)` silently drops a legitimate filter value of `0`.
3. **No range validation** — negative margins/ROIC accepted.

**Fix:** Zod 4 is already in `package.json` (`zod: ^4.4.3`) and used nowhere in the API layer. Define at the top of this file:

```ts
const ScreenerBody = z.object({
  sector: z.string().max(50).optional(),
  minGrossMargin: z.number().min(0).max(1).optional(),
  minRoic: z.number().min(0).max(1).optional(),
  minRevenue: z.number().min(0).optional(),
  minEarningsYield: z.number().min(0).max(1).optional(),
})
```

Replace line 15 with `const parsed = ScreenerBody.safeParse(await request.json())`, return 400 on failure, and use `parsed.data.minGrossMargin !== undefined` instead of truthiness. This is the template for every future POST body in the app.

### B3 — Schema drift: 5 models live outside migration history

`prisma/migrations/` contains exactly one migration (`20260625210656_init_and_s5_fields`). Everything below exists in `prisma/schema.prisma` and in the database, but in no migration:

| Drifted object | schema.prisma lines | In CLAUDE.md §4? |
|---|---|---|
| model `DcfAnalysis` (`dcf_analyses`) | 191–219 | ❌ (mentioned in §10 extras) |
| model `EarningsEvent` (`earnings_events`) | 221–244 | ❌ (mentioned in §10 extras) |
| model `CompanyBrief` (`company_brief`) | 276–291 | ❌ undocumented |
| model `ManagementProfile` (`management_profile`) | 293–319 | ❌ undocumented |
| model `InsiderTransaction` (`insider_transactions`) | 334–365 | ❌ undocumented |
| enum `EarningsHour`, enum `InsiderTxnType` | — | ❌ |
| `Company.ceo` | 49 | ❌ |
| `Fundamental.researchAndDevelopment`, `.sellingGeneralAndAdmin`, `.ebitda`, `.revenueSegments` | 91–95 | ❌ |

Consequences: `prisma migrate dev` would demand a database reset (CLAUDE.md §10 already warns), no reviewable DDL history exists for 5 tables, and CLAUDE.md §4 no longer describes the real schema. **Fix:** run the baseline-consolidation procedure in [db-optimization.md § Migration drift](db-optimization.md) (uses `prisma migrate diff` + `migrate resolve --applied`; zero data loss), then update CLAUDE.md §4 to include the five models.

---

## 3. P2 findings

### B4 — No caching on weekly-cadence data

Fundamentals change on the Sunday-03:00-UTC cron; earnings daily; companies (search) rarely; insider transactions weekly. Yet all four routes hit PostgreSQL on every request:

| Route | Data refresh cadence | Add |
|---|---|---|
| `api/fundamentals/[ticker]` | weekly | wrap the two queries in `unstable_cache(fn, ['fundamentals', ticker], { revalidate: 3600 })` — 1h is safe per the brief; 24h would also be correct |
| `api/earnings` | daily | `unstable_cache` keyed on `(from, to)`, `revalidate: 86400`, but only for the public (non-watchlist) branch |
| `api/search` | on seed runs | `unstable_cache` keyed on normalized query, `revalidate: 3600` |
| `api/insider/[ticker]` | weekly | `unstable_cache`, `revalidate: 86400` |

Note `unstable_cache` (not route-level `revalidate`) because these are dynamic route handlers reading Prisma, and the watchlist/auth branches must stay uncached.

### B5 — Portfolio route patterns

- `app/api/portfolio/route.ts:15` — `portfolio.upsert` inside a GET. A read endpoint that writes breaks idempotency expectations (retries, prefetches, and monitoring all mutate state). **Fix:** move creation to the Supabase `on_auth_user_created` trigger (which already creates the `users` row) or to `/api/portfolio/add`; the GET becomes `findUnique` returning an empty shape when absent.
- `app/api/portfolio/check/route.ts:21–30` — `findFirst` hydrates a full `PortfolioItem` row to compute `!!item`. **Fix:** add `select: { id: true }` at line 30.

### B6 — Screener query weight (`app/api/screener/route.ts:39–57`)

`distinct: ['companyId']` + `include.company.include.prices(take 1)` over `take: 500` makes Prisma fetch the newest price row per company via relation batching — workable at 500 companies (<100ms observed class of query) but the heaviest read in the app after B1, and `minEarningsYield` is then applied in JS (`:88–90`) after the DB work is done. **Fix now:** narrow `include.company` to a `select` of the 5 fields used (`id, ticker, name, logoUrl, sector`). **Fix when the real screener ships:** precompute latest-price into a materialized view or a `Company.lastClose` column updated by `ingest_prices.py`, and revisit indexes per [db-optimization.md](db-optimization.md).

### B7 — yfinance in `ingest_ceos.py` (CLAUDE.md §9 violation, documented)

`scripts/ingest_ceos.py:2–13` documents a deliberate decision (Costa, 2026-06-29) to use yfinance for CEO names after evaluating alternatives. CLAUDE.md §9 bans yfinance because Yahoo's ToS prohibit commercial use — and monetization is planned for v1 (§2). The mitigation (names only, no financial data) is real but does not change the ToS exposure once the product charges money. **Fix:** keep for MVP; open a tracked issue "Replace yfinance CEO source before charging users" with the alternatives already evaluated (Finnhub executive endpoint on paid tier being the likely landing spot); add the same warning to CLAUDE.md §9 so the exception is visible outside the script header.

---

## 4. P3 findings

- **B8** — `scripts/seed_companies.py:83`: Finnhub profile/logo fetches run with no sleep between requests. At 500 companies this bursts past the 60/min free-tier limit; it "works" only because failures are caught and logged. Add `time.sleep(1.1)` in the loop, matching `ingest_earnings.py:44`.
- **B9** — `app/api/prices/[ticker]/route.ts:28–39`: fetches `orderBy: { date: 'desc' }` then `prices.reverse()` in JS. For bounded `take` this is required to get "latest N", so the pattern is actually correct for 1m–5y periods — but for `period=max` (take 99999) it is pure overhead; special-case `max` to `orderBy: asc` without `reverse()`.
- **B10** — `messages/` contains 9 locales. pt/en verified aligned; de/es/fr/it/ja/nl/zh were not diffed in this audit. Run a key-set diff (`jq -r 'paths | join(".")' messages/pt.json | sort` vs each) before advertising those locales.

---

## 5. Python ingestion scripts — verdict: strong

| Script | Cadence | Idempotency | Rate limit | Error isolation | Notes |
|---|---|---|---|---|---|
| `seed_companies.py` | manual | upsert | ❌ none (B8) | per-company try/except ✅ | env-based keys ✅ |
| `ingest_fundamentals.py` | weekly | `ON CONFLICT DO UPDATE` on natural key ✅ | 0.2s (SEC ≤10 req/s) ✅ | per-company ✅ | XBRL tag fallback arrays (`:44–137`) are the best code in the repo: prioritized tag lists per concept, YTD→standalone differencing (`:222–305`), ±10-day period matching (`:182–196`) |
| `ingest_prices.py` | daily | `ON CONFLICT (ticker,date)` ✅ | 13s (Polygon 5/min) ✅ | per-ticker ✅ | incremental via `MAX(date)` (`:52–55`) ✅ matches CLAUDE.md §5 |
| `ingest_earnings.py` | daily | natural-key upsert ✅ | 1.1s + explicit 429→sleep 60→retry (`:65–68`) ✅ | ✅ | |
| `ingest_insider.py` | weekly | 5-field natural key (Finnhub has no stable IDs) ✅ | 1.1s + 429 handling ✅ | ✅ | |
| `ingest_ceos.py` | monthly | upsert ✅ | n/a | ✅ | yfinance — B7; hardcoded overrides for APO/ARES/BRK.B are justified and commented |

No bare `except:`, no hardcoded credentials, no failure mode where one bad company aborts a run.

---

## 6. i18n

- `messages/pt.json` (432 lines) ↔ `messages/en.json` (436 lines): all top-level and second-level key sets match. No missing keys either direction.
- Hardcoded UI strings exist in **components**, not in API routes — 10 occurrences catalogued with fixes in [frontend-report.md § i18n violations](frontend-report.md) (worst: `components/stock/ManagementTeam.tsx` renders "Equipa de Gestão" from a string literal three times).
- API error strings are English technical responses, not UI copy — correctly out of i18n scope.
