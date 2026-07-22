# Security Audit — BullVision

> Audit date: 2026-07-02 · Auditor: external consultant session · Scope: full repo, read-only.
> Companion docs: [backend-report.md](backend-report.md), [frontend-report.md](frontend-report.md), [db-optimization.md](db-optimization.md), index at [AUDIT-INDEX.md](AUDIT-INDEX.md).

## Summary table

| # | Finding | Severity | Location |
|---|---|---|---|
| S1 | Supabase RLS not configured anywhere — anon key may have full table read/write via PostgREST | **Critical (verify)** | `prisma/migrations/`, Supabase project |
| S2 | Middleware protects only `/portfolio` and `/settings`; rest of the private `(app)` group is unauthenticated | **High** | `lib/supabase/middleware.ts:38–40` |
| S3 | Portfolio page has no server-side auth — client-only 401 handling | **High** | `app/(app)/portfolio/page.tsx:1,43–47,100–102` |
| S4 | Public API routes proxy Finnhub with zero rate limiting — API-key quota burn | **High** | `app/api/price/[ticker]/route.ts:20` et al. |
| S5 | No Content-Security-Policy header | **Medium** | `next.config.ts:22–29` |
| S6 | No CSRF/Origin validation on state-changing route handlers | **Medium** | 5 POST/DELETE routes |
| S7 | Weak, human-guessable database password | **Medium** | `.env.local` (local), Supabase project |
| S8 | Ticker param interpolated unencoded into outbound API URLs | **Low** | `app/api/price/[ticker]/route.ts:20` et al. |
| S9 | `proxy.ts` naming — **not a bug**; verify activation in a production build | **Low (verify)** | `proxy.ts:4` |
| S10 | `/api/dev/toggle-plan` — guard is safe today, but brittle | **Low** | `app/api/dev/toggle-plan/route.ts:7–9` |
| S11 | `api-debug.log` with stack traces sitting in repo root | **Low** | `api-debug.log` |
| S12 | No HSTS header in app config (Vercel injects it at the platform layer) | **Low** | `next.config.ts:22–29` |

**Corrections to the pre-audit brief** (assumptions that did not survive evidence):
- `proxy.ts` exporting `proxy()` is **the official Next.js 16 convention** (`middleware.ts` was renamed to `proxy.ts` in Next 16). It is not non-standard. See S9.
- `.env.local` is **not committed**: `git ls-files` shows only `.env.example`; `git log --all -- .env.local` is empty; `.gitignore:34` has `.env*`. Secrets exist on the dev machine only.
- `/api/dev/toggle-plan` is **not reachable in Vercel Preview**: `NODE_ENV` is `'production'` in Preview, so the `!== 'development'` guard returns 403 there. See S10.

---

## S1 — Supabase RLS not configured (Critical — verify immediately)

**Evidence.** The single migration `prisma/migrations/20260625210656_init_and_s5_fields/migration.sql` contains zero `ALTER TABLE … ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statements. There is no `supabase/` SQL directory. All 13 tables (`users`, `companies`, `fundamentals`, `prices`, `portfolios`, `portfolio_items`, `dcf_analyses`, `earnings_events`, `ai_insight_cache`, `company_brief`, `management_profile`, `insider_transactions`, `ai_usage_logs`) live in the `public` schema.

**Why this is critical.** Supabase exposes the `public` schema through PostgREST (`https://<project>.supabase.co/rest/v1/<table>`), and its default privileges grant the `anon` and `authenticated` roles access to tables in `public` — including tables created by Prisma migrations/`db push`. With RLS disabled (Prisma's default), **anyone holding the anon key — which ships in the browser bundle by design — can read and write every row of every table**, bypassing all the auth checks in the API routes. That includes other users' emails, portfolios, and DCF analyses, and it includes writing `plan = 'PRO'` to `users`.

**Verify now** (from any machine, no repo access needed):

```bash
curl "https://mcfscurdnrgyuqrcblvt.supabase.co/rest/v1/users?select=email&limit=1" \
  -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
```

- If this returns rows → the finding is confirmed Critical; treat as an active incident.
- If it returns a permissions error → default grants were changed or the Data API is off; downgrade to Medium (defense-in-depth) but still do the fix.

**Exact fix.**
1. In the Supabase dashboard (Settings → API), remove `public` from "Exposed schemas" — the app never uses PostgREST for these tables (all access goes through Prisma with `DATABASE_URL`), so nothing breaks. This one setting closes the entire surface.
2. Additionally (defense-in-depth), enable RLS on every `public` table with a no-policy default-deny. Because the app connects as the `postgres` role via Prisma (which bypasses RLS), this is transparent to the application:
   ```sql
   ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
   -- repeat for all 13 tables
   ```
   Ship it as SQL run once against the DB and keep a copy in `prisma/` — see the migration-consolidation procedure in [db-optimization.md](db-optimization.md) for how to fold it into a baseline migration.

---

## S2 — Middleware protects only 2 of 8 private routes (High)

**Evidence.** `lib/supabase/middleware.ts:38–40`:

```ts
const isPrivateRoute =
  request.nextUrl.pathname.startsWith('/portfolio') ||
  request.nextUrl.pathname.startsWith('/settings')
```

CLAUDE.md §6 declares the whole `(app)` route group "grupo PRIVADO — terminal financeiro". Actual state per page:

| Page | Middleware | Page-level auth | Net result for anonymous user |
|---|---|---|---|
| `/dashboard` | ❌ | ✅ `getUser()` + `redirect("/login")` (`app/(app)/dashboard/page.tsx:17–20`) | redirected ✅ |
| `/settings` | ✅ | ✅ (`app/(app)/settings/page.tsx:9–12`) | redirected ✅ |
| `/portfolio` | ✅ | ❌ (client-only, see S3) | protected only if middleware runs |
| `/stock/[ticker]` | ❌ | ⚠️ `getUser()` but no redirect (`app/(app)/stock/[ticker]/page.tsx:38–39`) | **fully viewable** |
| `/calendar` | ❌ | ❌ | **fully viewable** |
| `/dcf` | ❌ | ❌ | **fully viewable** |
| `/screener` | ❌ | ❌ (page); API is auth'd | page shell viewable |
| `/transcripts` | ❌ | ❌ | viewable (placeholder) |

**Decision needed, then one exact fix.** Either the terminal is login-gated (per CLAUDE.md) or it is freemium-open (stock pages public as acquisition surface). The code is currently an inconsistent middle. Recommendation: **gate the whole group**. In `lib/supabase/middleware.ts:38–40`, replace the two `startsWith` checks with the full private list:

```ts
const PRIVATE_PREFIXES = ['/dashboard', '/portfolio', '/settings', '/calendar',
                          '/dcf', '/screener', '/stock', '/transcripts']
const isPrivateRoute = PRIVATE_PREFIXES.some(p => request.nextUrl.pathname.startsWith(p))
```

If the team instead wants public stock pages, document that in CLAUDE.md §6 and still add `/dashboard`, `/calendar`, `/dcf`, `/screener`, `/transcripts` here.

---

## S3 — Portfolio page: client-side-only auth (High)

**Evidence.** `app/(app)/portfolio/page.tsx` is `"use client"` (line 1). Auth is discovered after render, by the API returning 401 (`:43–47`), and redirect happens in a `useEffect` (`:100–102`). No data leaks (the API is guarded), but the page depends entirely on the middleware for gating — and middleware activation is exactly what S9 asks you to verify. Defense-in-depth requires the page to protect itself, like dashboard and settings already do.

**Exact fix.** Create a thin server component wrapper: rename the current file's component into `components/portfolio/PortfolioClient.tsx` and make `app/(app)/portfolio/page.tsx` a server component that does the same 4-line check as `app/(app)/settings/page.tsx:9–12` (`createClient()` → `getUser()` → `redirect('/login')`), then renders `<PortfolioClient />`.

---

## S4 — Public Finnhub proxies with no rate limiting (High)

**Evidence.** These routes require no auth and spend external quota or DB time on every call:

| Route | External spend | Cache |
|---|---|---|
| `app/api/price/[ticker]/route.ts:19–24` | Finnhub `/quote` | 60s per ticker |
| `app/api/news/[ticker]/route.ts` (Finnhub fetch ~:30) | Finnhub `/company-news` | 15m per ticker |
| `app/api/dcf-data/[ticker]/route.ts` (Finnhub fetch ~:20) | Finnhub `/quote` | 60s per ticker |
| `app/api/search`, `/api/fundamentals/[ticker]`, `/api/prices/[ticker]`, `/api/insider/[ticker]`, `/api/earnings` | DB only | none |

The 60s `revalidate` cache is **per-ticker**, so an attacker cycling through 500 tickers × new tickers invalidates it trivially: Finnhub free tier (60 calls/min) is exhausted by one loop, killing live prices for all real users. No route in the codebase has per-IP rate limiting.

**Exact fix.** Add a shared in-memory sliding-window limiter (adequate at MVP scale on Vercel, no Redis — see the Redis verdict in [db-optimization.md](db-optimization.md)): create `lib/rate-limit.ts` with a `Map<ip, timestamps[]>` allowing e.g. 30 req/min per IP, and call it first in the three Finnhub-proxy routes (`price/[ticker]`, `news/[ticker]`, `dcf-data/[ticker]`) returning 429 on breach. Key by `request.headers.get('x-forwarded-for')`. Do the same for `/api/search` at a higher threshold. This is deliberately minimal; upgrade to Vercel WAF rules or Upstash only if abuse is observed.

---

## S5 — Missing Content-Security-Policy (Medium)

**Evidence.** `next.config.ts:22–29` sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` — good — but no CSP. Without one, any XSS foothold (e.g. a compromised npm dependency, or future dangerouslySetInnerHTML) runs unrestricted, and there is no mitigation layer for data exfiltration.

**Exact fix.** Add to the headers array at `next.config.ts:29` (start in report-only for one deploy, then enforce):

```ts
{
  key: 'Content-Security-Policy',
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",          // Next.js requires inline for hydration; move to nonces post-MVP
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://static2.finnhub.io",
    "font-src 'self'",
    "connect-src 'self' https://mcfscurdnrgyuqrcblvt.supabase.co",
    "frame-ancestors 'none'",
  ].join('; '),
},
```

`img-src` must include `static2.finnhub.io` (already whitelisted for next/image at `next.config.ts:14`); `connect-src` must include the Supabase URL because the browser Supabase client (`lib/supabase/client.ts`) talks to it directly for auth.

---

## S6 — No CSRF/Origin validation on mutating route handlers (Medium)

**Evidence.** Five state-changing handlers validate the session cookie but never the request's origin: `app/api/portfolio/add/route.ts` (POST), `app/api/portfolio/remove/route.ts` (DELETE), `app/api/dcf/analyses/route.ts` (POST), `app/api/dcf/analyses/[id]/route.ts` (DELETE), `app/api/dev/toggle-plan/route.ts` (POST). A grep for `csrf|Origin|Referer` across `app/` returns nothing.

**Severity calibration.** This is Medium, not High: Supabase SSR auth cookies default to `SameSite=Lax`, which blocks the classic cross-site form/fetch-with-cookies attack in modern browsers, and the two server actions (`app/(app)/settings/actions.ts`, `app/(auth)/actions.ts`) get Next.js's built-in origin check for free. The route handlers get no such check, so the app is one cookie-attribute regression or old-browser user away from CSRF.

**Exact fix.** Add an origin guard in `proxy.ts:4` (runs before every route, single point of truth):

```ts
if (['POST', 'DELETE', 'PUT', 'PATCH'].includes(request.method)) {
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    return new NextResponse('Forbidden', { status: 403 })
  }
}
```

---

## S7 — Weak database password (Medium)

**Evidence.** The pooled and direct connection strings in the local `.env.local` use the password `Bullocracy2026` — a company-name-plus-year pattern that is first-page material in any targeted wordlist. Supabase databases accept direct connections from the internet (that is how Vercel and GitHub Actions reach it), so the password is a real perimeter.

**Exact fix.** In Supabase dashboard → Settings → Database, reset the password to a generated 32+ char secret; update `DATABASE_URL`/`DIRECT_URL` in Vercel env vars, GitHub Actions secrets (the ingestion workflows use them), and each dev's `.env.local`. 15 minutes, zero code changes.

---

## S8 — Ticker interpolated unencoded into outbound URLs (Low)

**Evidence.** `app/api/price/[ticker]/route.ts:20`:

```ts
`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`
```

Route params are URL-decoded by Next, so a request to `/api/price/AAPL%26resolution%3DD` reaches this line as `AAPL&resolution=D` and injects parameters into the outbound Finnhub request. Same pattern in `news/[ticker]` and `dcf-data/[ticker]`. No key exfiltration is possible (the attacker controls the middle of the URL, not the response destination), but it is parameter smuggling against a third-party API through your key.

**Exact fix.** Validate once at the top of each ticker route: `if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 })` — and use `encodeURIComponent(ticker)` in every template literal regardless.

---

## S9 — `proxy.ts` convention: not a bug; verify activation once (Low)

**Evidence, both directions.**
- `proxy.ts:4` exports `async function proxy(request)` delegating to `updateSession`, with a standard matcher (`:8–12`). In **Next.js 16, `proxy.ts`/`proxy()` is the renamed successor of `middleware.ts`** — the pre-audit assumption that this is non-standard is wrong.
- The dev compiler **did** pick it up: `.next/dev/server/middleware.js:7` wraps `INNER_MIDDLEWARE_MODULE => "[project]/proxy.ts [middleware]"` with the Supabase chunks bundled.
- However both dev manifests (`.next/dev/server/middleware-manifest.json:3–4` and `.next/dev/server/middleware/middleware-manifest.json:2–3`) show `"middleware": {}` — empty. Dev-mode Turbopack manifests are populated lazily, so this is inconclusive, but it means middleware execution has not been positively confirmed.

**Exact verification (5 minutes, do this before trusting S2/S3 mitigations):**
1. `npm run build` and inspect `.next/server/middleware-manifest.json` — it must contain a `middleware` entry referencing the matcher from `proxy.ts:9–11`.
2. Runtime check: `curl -I http://localhost:3000/portfolio` with no cookies → expect `307` to `/login`. A `200` means the proxy is not executing and S2/S3 escalate to Critical.

---

## S10 — `/api/dev/toggle-plan`: safe today, brittle by design (Low)

**Evidence.** `app/api/dev/toggle-plan/route.ts:7–9`:

```ts
if (process.env.NODE_ENV !== 'development') {
  return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
}
```

Corrected analysis vs. the pre-audit brief: Vercel sets `NODE_ENV='production'` in **both** Production and Preview deployments, so this guard returns 403 in **all** Vercel environments — the endpoint only works on `next dev` locally. It is not currently exploitable. It is still the only place in the codebase where a user can change their own `plan`, guarded by a single env comparison and a comment (`:6`) that says "for now we let the user test".

**Exact fix.** Make intent explicit and double-locked at `route.ts:7`: `if (process.env.NODE_ENV !== 'development' || process.env.VERCEL) { return 403 }`. Longer term, delete the route when real billing lands — grep for its one caller in `components/dev/PlanToggle.tsx`.

---

## S11 — `api-debug.log` in repo root (Low)

**Evidence.** `api-debug.log` (untracked, per `git status`) contains a `TypeError … reading 'findUnique'` stack trace with absolute Windows paths. It is not committed, but it sits one careless `git add .` away from being so, and the current `.gitignore` does not cover it.

**Exact fix.** Delete the file; add `*.log` to `.gitignore` (it currently lists specific names only).

---

## S12 — HSTS not set by the app (Low)

**Evidence.** `next.config.ts:22–29` has no `Strict-Transport-Security`. Vercel injects HSTS on its edge for production domains, so browsers are covered in practice; the app config just doesn't express it.

**Exact fix.** Add alongside the CSP at `next.config.ts:29`: `{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }` — harmless duplication on Vercel, correct behavior anywhere else the app is ever hosted.

---

## Non-findings (checked, clean)

- **Secrets in git**: `.env.local` never committed (verified via `git ls-files` and full history); only `.env.example` is tracked. All API keys are server-side only — no `NEXT_PUBLIC_` prefixed external keys, matching CLAUDE.md §8.
- **`SUPABASE_SERVICE_ROLE_KEY`**: present in `.env.local` but referenced nowhere in app code — not exposed.
- **Error leakage**: all 19 API routes return generic error strings; none serialize `error.message` or stack traces to clients.
- **Open redirects**: none; the auth callback `next` param is hardcoded (`app/(auth)/actions.ts:72–73`).
- **Server actions**: both action files check auth and benefit from Next.js origin validation.
