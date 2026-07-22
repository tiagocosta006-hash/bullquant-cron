# Database Optimization — BullVision

> Audit date: 2026-07-02 · Scope: index coverage, query efficiency, Decimal handling, caching, migration drift, Redis decision.
> Overlapping route-level findings are cross-referenced to [backend-report.md](backend-report.md) (B-numbers).

## 1. Index coverage — every WHERE clause vs. the schema

| Query site | Filters / order | Index used | Verdict |
|---|---|---|---|
| `app/api/prices/[ticker]/route.ts:24–36` | `ticker =` · `date DESC` · limit | PK `@@id([ticker, date])` — backward index scan | ✅ optimal |
| `app/api/fundamentals/[ticker]/route.ts:19` | `companyId =` · `periodEnd ASC` | `@@index([companyId, periodEnd])` | ✅ (fix the overfetch, B1 — the index is fine) |
| `app/api/search/route.ts:13` | `ticker contains OR name contains`, insensitive | `@@index([ticker])` unusable for `contains`; `name` unindexed | ⚠️ sequential scan — acceptable at 500 rows, see §1a |
| `app/api/earnings/route.ts:39` | `date BETWEEN` (+ optional `companyId`) | `@@index([date])`, `@@index([companyId, date])` | ✅ |
| `app/api/portfolio/check/route.ts:21–30` | `portfolio.userId =` + `company.ticker =` | `portfolios.userId @unique` + `companies.ticker @unique` + `@@index([portfolioId])` | ✅ |
| `app/api/dcf/analyses` | `userId =, companyId =` · `createdAt` | `@@index([userId, companyId, createdAt])` | ✅ |
| `app/api/insider/[ticker]/route.ts:28` | `companyId =` · `transactionDate DESC` | `@@index([companyId, transactionDate])` | ✅ |
| `app/api/screener/route.ts:39–57` | `periodType =` + `grossMargin ≥` + `roic ≥` + `revenue ≥` (+ sector via join) | **none of the numeric columns indexed** | ⚠️ deliberate — see §1b |
| `lib/finance/screener.ts:62–77` | `ticker IN (…)` + per-company latest fundamental | `ticker @unique` + `@@index([companyId, periodEnd])` | ✅ verified efficient |

### 1a. Company search — do nothing yet
`contains/insensitive` on 500 rows is a sub-millisecond sequential scan; an index adds write cost and complexity for zero perceived gain. **Trigger to act:** company count >5,000 (Europe expansion). Then: `CREATE EXTENSION pg_trgm; CREATE INDEX companies_name_trgm ON companies USING gin (name gin_trgm_ops);` via a migration.

### 1b. Screener numeric columns — do nothing until the Real Screener ships
The current screener scans ~5,500 ANNUAL fundamental rows — tens of milliseconds unindexed, called only by authenticated users. Adding `@@index([periodType, grossMargin])` etc. now would bloat every weekly ingestion upsert for a feature that is still curated-lists-only (CLAUDE.md §10). **When feature #6 in [features-roadmap.md](features-roadmap.md) ships** with real filter traffic, add exactly: `@@index([periodType, grossMargin])`, `@@index([periodType, roic])` — and measure before adding more.

## 2. Query efficiency — the four fixes

1. **`app/api/fundamentals/[ticker]/route.ts:19`** — add `select` (18 used fields) + enforce the 40-quarter contract. Full prescription in B1. This is the single highest-impact DB change in the audit: it is the hot path of the most important page.
2. **`app/api/portfolio/check/route.ts:30`** — append `select: { id: true }`; the route computes only `!!item` (B5).
3. **`app/api/portfolio/route.ts:15`** — stop upserting on GET (B5); a read that writes also takes a row lock it never needs.
4. **`app/api/screener/route.ts:46–55`** — replace `include.company.include.prices` with `select` of the 5 consumed company fields + the 1-row price (B6).

**Pagination:** nothing needs offset/cursor pagination at current scale — every list is bounded by `take`, a date range, or per-user cardinality. First future candidate: `/api/insider/[ticker]` if the 100-row cap is ever lifted.

**N+1:** none found. All relation loads go through Prisma `include`/nested `select` batching; no queries inside loops anywhere in `app/` or `lib/`.

## 3. Decimal precision — verified correct, no action

- Storage: money `Decimal(20,4)`, ratios `Decimal(8,6)`, prices `Decimal(12,4)` — matches CLAUDE.md §4.
- Every API response converts `Decimal` → JS `number` before serialization (`Number()` or `.toNumber()`; the generic serializer at `app/api/fundamentals/[ticker]/route.ts:32–42` is the most defensive). No route leaks Decimal objects as strings.
- Float53 safety: the largest real-world magnitudes (revenue ~10¹², market cap ~10¹³) sit far below `Number.MAX_SAFE_INTEGER` (9×10¹⁵); ratio fields at 6 decimal places are exactly representable for display purposes. No precision hazard at these magnitudes.

## 4. Prices table at 1.26M rows — PK is sufficient, no partial index

The only access pattern is `WHERE ticker = ? ORDER BY date DESC LIMIT n` (`app/api/prices/[ticker]/route.ts:24–36`). The composite PK `(ticker, date)` is a B-tree whose leading column matches the equality predicate; Postgres does a backward index scan and stops at the LIMIT. Cost is proportional to rows *returned* (22–2,500), not table size — 1.26M vs 126M rows changes nothing for this query. A partial index would only help a filtered subset (e.g. "last 30 days" hot partition), and no query filters that way.

Two genuinely useful notes instead:
- `period=max` returns ~2,500 rows ≈ 60KB JSON per request with no HTTP caching. Add `Cache-Control: public, max-age=3600` to this route's response (EOD data changes once per day) — cheaper than any DB work.
- The in-memory `reverse()` (`:39`) is required for bounded periods (to get the *latest* N); special-case only `max` to `orderBy: asc` (B9). Micro.

## 5. `getCategoryCompanies()` — efficient at 500; cache it

Verified (`lib/finance/screener.ts:62–77`): one query, `ticker IN (curated list)`, `take: 20`, nested latest-fundamental via `@@index([companyId, periodEnd])`, `select`-narrowed. At 500 companies this is single-digit milliseconds. The improvement is not the query — it is that the dashboard re-runs it on every page load for data that changes weekly:

```ts
import { unstable_cache } from 'next/cache'
export const getCategoryCompaniesCached = unstable_cache(
  getCategoryCompanies, ['category-companies'], { revalidate: 3600 }
)
```
Call the cached variant from `app/(app)/dashboard/page.tsx`. 1h TTL is safe — the brief's premise (fundamentals update weekly) holds.

## 6. `unstable_cache` map (full prescription of B4)

| Data | Refresh reality | Wrap | TTL |
|---|---|---|---|
| Fundamentals per ticker | weekly cron (Sun 03:00 UTC) | the two queries in `api/fundamentals/[ticker]` | 3600s (1h — brief-approved; 24h also correct) |
| Earnings calendar (public branch only) | daily cron | query in `api/earnings`, key `(from,to)` | 86400s |
| Company search | seed runs only | query in `api/search`, key = normalized `q` | 3600s |
| Insider transactions | weekly cron | query in `api/insider/[ticker]` | 86400s |
| Dashboard categories | weekly | §5 above | 3600s |

Keep the auth-dependent branches (`watchlist=1` in earnings) **outside** any cache. Finnhub-proxy routes already use fetch-level `revalidate` correctly; leave them.

## 7. Migration drift — exact consolidation, zero data loss

**State:** one migration on disk (`20260625210656_init_and_s5_fields`); five models + assorted fields exist only via `db push` (B3 table). `prisma migrate dev` would offer to reset (= wipe) the database. **The fix is Prisma's official baselining flow — it touches only migration *metadata*, never data tables:**

1. **Freeze:** no `db push` or schema edits during the procedure. Load env first (Prisma CLI reads `.env`, not `.env.local`): `set -a; . ./.env.local; set +a`.
2. **Confirm schema ⇄ DB parity** (expect *empty* output; if not, reconcile schema.prisma first):
   ```bash
   npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
   ```
3. **Re-baseline on disk:** move the old migration folder out (`git mv prisma/migrations/20260625210656_init_and_s5_fields /tmp/` — it stays in git history), then generate one true baseline:
   ```bash
   mkdir -p prisma/migrations/20260702000000_baseline
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
     > prisma/migrations/20260702000000_baseline/migration.sql
   ```
   (`--from-empty` needs no shadow database — important, because Supabase's pooled user cannot create shadow DBs.)
4. **Clean stale metadata on the live DB** (metadata table only — this is the step that looks scary and is not):
   ```sql
   DELETE FROM _prisma_migrations WHERE migration_name = '20260625210656_init_and_s5_fields';
   ```
5. **Mark the baseline as already applied** (writes one metadata row; runs no DDL):
   ```bash
   npx prisma migrate resolve --applied 20260702000000_baseline
   ```
6. **Verify:** `npx prisma migrate status` → "Database schema is up to date!". Commit the new folder.
7. **From now on:** every schema change goes through `prisma migrate dev` again. Delete the `db push` guidance from CLAUDE.md §10 and replace it with a pointer to this procedure. Every teammate pulls, runs `migrate status`, and must **not** run `migrate dev` before pulling the baseline.

Rollback safety: until step 5, nothing has changed on the database except one metadata row deletion (step 4), which step 5's insert supersedes. Data tables are never touched.

## 8. Redis — **No.**

Concrete reasoning at current scale (500 companies, MVP traffic, Vercel serverless):
1. **The workload doesn't need it.** Every hot query is index-backed and single-digit ms (§1); the real waste is *re-running* cheap queries, which §5–6's `unstable_cache` eliminates using infrastructure that already exists.
2. **Serverless Redis is a new failure domain plus a bill.** On Vercel that means Upstash/managed Redis: another secret, another cold-path network hop (often slower than the Supabase query it would cache), another thing that pages someone.
3. **The AI cache is already right.** 24h/30d TTLs in PostgreSQL tables (`CompanyBrief`, `ManagementProfile`) survive deploys and are queryable — Redis would make them worse.
4. **CLAUDE.md §9 already decided this** ("Redis: só se houver problema de performance real") — the audit confirms no such problem exists.

**Reopen only when** one of: sustained p95 >500ms on cached-and-indexed routes; Supabase connection-pool exhaustion under real traffic; or a feature that needs shared mutable state across serverless invocations (real-time rate limiting at scale, websocket presence). None is on the current roadmap.
