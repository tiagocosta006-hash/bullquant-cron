# BullVision — Audit Index

> Full-codebase audit · 2026-07-02 · Read this page first. Five reports, every finding with `file:line` and a prescribed fix. Nothing was changed in this session — documentation only.

## Read this before the reports: three assumptions the audit *corrected*

The pre-audit brief listed "known issues". Three did not survive the evidence — do not spend time "fixing" them as described:

1. **`proxy.ts`/`proxy()` is standard, not a bug.** Next.js 16 renamed `middleware.ts` → `proxy.ts`; the compiled dev bundle proves Turbopack picked it up (`.next/dev/server/middleware.js:7`). One 5-minute production-build check remains to confirm activation — see security S9. Do **not** rename it back.
2. **`.env.local` is not committed.** Verified via `git ls-files` and full history. Secrets are local-machine only. (Rotate the weak DB password anyway — S7.)
3. **`/api/dev/toggle-plan` is not exploitable in Vercel Preview.** `NODE_ENV` is `'production'` there, so the guard 403s. Downgraded to Low with a hardening fix — S10.

And one thing the brief *understated*: the schema drift is **5 models**, not 2 (`CompanyBrief`, `ManagementProfile`, `InsiderTransaction` in addition to `EarningsEvent`, `DcfAnalysis`), and the brand-name problem ships to **users in all 9 locales**, not just `lib/brand.ts`.

## The five reports

| Report | Scope | Findings |
|---|---|---|
| [security-report.md](security-report.md) | Auth coverage, headers, CSRF, RLS, secrets, abuse surface | 12 (1 Critical-verify, 3 High) |
| [backend-report.md](backend-report.md) | 19 API routes, Prisma patterns, schema drift, Python ingestion, i18n | 10 (3 P1) |
| [frontend-report.md](frontend-report.md) | Design-system compliance, i18n strings, TypeScript, a11y, loading UX | 6 groups (~50 line-level items) |
| [features-roadmap.md](features-roadmap.md) | 12 features evaluated with decisive verdicts + top-5 deep dives | build order + 1 rejection |
| [db-optimization.md](db-optimization.md) | Indexes, query fixes, caching map, migration consolidation, Redis verdict | 8 sections |

## Top 3 per report

### Security
1. **S1 — Supabase RLS absent (Critical, verify today):** zero policies exist; by Supabase default the public anon key may read/write *every table* via PostgREST, bypassing all API auth. A one-line `curl` test in the report confirms or clears it; the fix (unexpose `public` schema + enable RLS) is transparent to the app.
2. **S2/S3 — the "private" terminal is mostly public:** middleware guards only `/portfolio` + `/settings` (`lib/supabase/middleware.ts:38–40`); the portfolio page itself has no server-side auth; `/calendar`, `/dcf`, `/screener`, `/stock/*` render for anonymous users despite CLAUDE.md §6 declaring the group private. Decide gated-vs-freemium, then apply the 6-line middleware fix.
3. **S4 — public Finnhub proxies, zero rate limiting:** `/api/price/*`, `/api/news/*`, `/api/dcf-data/*` let anyone burn the 60-req/min Finnhub quota and kill live prices for real users. Minimal per-IP limiter prescribed.

### Backend
1. **B1 — hottest query is the worst query:** `/api/fundamentals/[ticker]` fetches every column of every row, unbounded, uncached, on each stock-page load (`route.ts:19–26`). Add `select` + `take: 40` + 1h `unstable_cache`.
2. **B2 — screener body unvalidated while Zod sits installed and unused:** wrong types → 500s; filter value `0` silently dropped (`app/api/screener/route.ts:14–37`). The report includes the exact Zod schema to standardize all future POST bodies.
3. **B3 — migration history is fiction:** 5 models exist only via `db push`; `prisma migrate dev` would offer to wipe the DB. Zero-data-loss baselining procedure in db-optimization §7.

### Frontend
1. **F1 — four product names in production:** "BullVision" on login/register screens in all 9 locales, `en.json` alone mixes BullVision/BullValue/BullQuant, brand book canonizes the wrong name, `lib/brand.ts:9` says "BullValue", `package.json` says "bullquant". Product is **BullVision**. Full fix table with the brand-interpolation pattern that prevents recurrence.
2. **F2 — five Golden Terminal color violations:** `text-emerald-500`/`text-rose-500` in `ScreenerResults.tsx:113,120,125,135` and `SettingsClient.tsx:112` (brief said 113) → `text-bull`/`text-bear`. These five are the only thing failing the redesign-plan acceptance criterion.
3. **F3 — 12 hardcoded UI strings** (10 of them Portuguese-only, locking `ManagementTeam` to PT chrome in 9-locale app) — violates CLAUDE.md §2's founding i18n rule.

### Features roadmap
1. **Build order is dictated by data quality:** per-company features first (Dividend Safety → Buyback → Valuation Bands — all data already in Postgres, S/M effort), cross-company features (Score, Real Screener) only after the known XBRL revenue-tag fix.
2. **Community layer: rejected as an in-app feature.** It is a separate product with a moderation workstream the team doesn't have; the strategic goal (capturing Bullocracy's audience) is served by Discord + the content flywheel already described in `docs/01-visao.md`. Thesis Journal is the single-player seed to build instead.
3. **Pro AI Analyst is fully designed and viable (~$0.05/session)** — `streamText` + 4 Zod-schema'd tools over existing tables, keyed filing summaries instead of a vector DB, credits on the existing `AIUsageLog` pattern. Hidden prerequisite: **billing does not exist**; Stripe comes first or the flagship is a demo.

### DB optimization
1. **Do the four query fixes, skip the new indexes:** every current WHERE clause is already index-backed; screener/search indexes are explicitly deferred until their features ship. The wins are `select`/`take` narrowing (B1) and the `unstable_cache` map for weekly-cadence data.
2. **Prices at 1.26M rows needs nothing:** the composite PK makes query cost proportional to rows returned, not table size. No partial index. Add `Cache-Control` on `period=max` instead.
3. **Redis: No** — and migration-drift consolidation is a 7-step metadata-only procedure (db-optimization §7) that restores `prisma migrate dev` without touching a single data row.

## Suggested attack order for the team

1. **Today:** run the S1 RLS curl test → apply schema-unexpose fix · delete `api-debug.log` · rotate DB password (S7).
2. **This week:** middleware route list (S2) + portfolio server auth (S3) · rate limiter (S4) · CSP header (S5) · B1 fundamentals query fix · F2 five color classes · F1a locale-file brand strings.
3. **Next sprint:** migration baselining (db-opt §7) · Zod on screener (B2) · `unstable_cache` map (§6) · ManagementTeam i18n (F3) · brand book + `lib/brand.ts` rename (F1b/c).
4. **Then:** start the features roadmap at #1 (Dividend Safety) while the ingestion data-quality fix (#4) runs in parallel.
