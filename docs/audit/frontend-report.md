# Frontend Audit — Bull Metrics

> Audit date: 2026-07-02 · Scope: components, pages, design-system compliance, i18n, TypeScript, a11y, performance. Read-only.
> Format: every finding = file:line · current code · exact fix. Index at [AUDIT-INDEX.md](AUDIT-INDEX.md).

## Finding summary

| # | Finding | Count | Severity |
|---|---|---|---|
| F1 | Brand name split across 4 identities — **including user-visible strings in all 9 locales** | 30+ occurrences | **Critical (brand)** |
| F2 | Golden Terminal color violations (`emerald`/`rose` instead of `bull`/`bear` tokens) | 5 | High |
| F3 | Hardcoded UI strings bypassing i18n | 12 | High |
| F4 | `any` types in event handlers and catches | 5 | Medium |
| F5 | `loading.tsx` missing on 7 of 8 app routes | 7 | Medium |
| F6 | Recharts not fully wired to `var(--chart-*)` tokens (redesign-plan Phase 4 open item) | — | Medium |

Verified clean: all 32 `"use client"` directives are justified (state/effects/handlers present); all three 60s pollers clean up their intervals (`components/stock/StockSnapshot.tsx:85–86`, `components/stock/StockHeader.tsx:72–73`, `app/(app)/portfolio/page.tsx:110–114`); no hardcoded hex colors outside `app/globals.css` and `lib/brand.ts` (token sources); images carry `alt`, icon-only links carry `sr-only` labels; **gold `#E4AA33` on canvas `#0B0B0E` has a contrast ratio of ≈9.9:1 — passes WCAG AAA** for normal text.

---

## F1 — Brand identity: four names in production (Critical)

The product is named **"Bull Metrics"**. The codebase currently ships **"Bullmetrics"**, **"BullVision"**, and **"bullquant"** — and the worst occurrences are user-visible.

### F1a. User-visible: i18n message files (fix first)

Every locale ships "BullVision" on the login/register screens, and `en.json` alone uses three different names:

| File:line | Current string | Fix |
|---|---|---|
| `messages/en.json:102` | `"Sign in to BullVision"` | `"Sign in to Bull Metrics"` |
| `messages/en.json:115` | `"Join BullVision.."` (also: double period) | `"Join Bull Metrics."` |
| `messages/en.json:175` | `"…your Bullmetrics session"` | `"…your Bull Metrics session"` |
| `messages/en.json:179` | `"…use in Bullmetrics"` | `"…use in Bull Metrics"` |
| `messages/en.json:187` | `"…use in BullQuant"` | `"…use in Bull Metrics"` |
| `messages/en.json:216` | `"title": "BullVision"` | `"Bull Metrics"` |
| `messages/pt.json:175,183` | "Bullmetrics" ×2 | "Bull Metrics" |
| `messages/pt.json:212` | `"BullVision"` | `"Bull Metrics"` |
| `messages/de.json:115,210` · `es.json:115,210` · `fr.json:115,210` · `it.json:115,210` · `ja.json:115,210` · `nl.json:115,210` | "BullVision" ×2 each | "Bull Metrics" (name is not translated) |

Better fix than string replacement: these strings should interpolate the brand — `"Sign in to {brand}"` with `t('auth.title', { brand: BRAND.name })` — so the next rename is a one-line change in `lib/brand.ts`. That is exactly what `lib/brand.ts:5` promises ("Changing the product name = edit `name` + `nameParts` here only") and the message files currently break.

### F1b. Brand source of truth

| File:line | Current | Fix |
|---|---|---|
| `lib/brand.ts:9` | `name: "Bullmetrics"` | `name: "Bull Metrics"` |
| `lib/brand.ts:11` | `nameParts: ["Bull", "metrics"]` | `["Bull", "Metrics"]` (wordmark renders parts adjacently — verify spacing in `components/brand/Logo.tsx` when changing) |
| `lib/brand.ts:2,4` | comments say "BullVision" | "Bull Metrics" |
| `lib/brand.ts:22` | `logoSrc: ""` — real logo file never dropped in | add `/public/brand/` asset per the comment at `:17–21` |

### F1c. Code, config, docs

| File:line | Current | Fix |
|---|---|---|
| `package.json:2` | `"name": "bullquant"` | `"bull-metrics"` |
| `components/brand/BullMark.tsx:4` | comment "Bullocracy / BullVision app mark" | "Bull Metrics" |
| `components/brand/Logo.tsx:24` | comment `"Bull" neutral, "Vision" gold` | update comment to match nameParts |
| `app/globals.css:8` | header comment "BullVision — Golden Terminal" | "Bull Metrics" |
| `hooks/useRecentSearches.ts:11` | `STORAGE_KEY = 'bullquant_recent_searches'` | keep as-is for now (renaming silently wipes every user's recent searches); rename only with a read-old-write-new migration, or accept the loss consciously |
| `scripts/seed_companies.py:51` | User-Agent `"BullQuant/1.0"` | `"BullMetrics/1.0"` next time the script runs |
| `docs/brand/brand-guidelines.md:13` | "**Name** \| BullVision (one word…)" | The entire brand book (`brand-guidelines.md`, `media-kit.md:10–12`, `README.md`, `design-system.md`) canonizes the wrong name — including the rule "Always: BullVision". Rewrite the four docs' name sections; they are what a new teammate reads first. |
| `docs/feature-ideas.md:1,19` · `docs/brand/redesign-plan.md:1,3` | "BullVision" titles, "BullVision Score" | "Bull Metrics", "Bull Metrics Score" |
| `docs/01-visao.md`, `02-features.md`, …, `bullquant_planeamento.md`, `CHANGELOG.md:1` | "BullQuant" throughout | historical planning docs — add a one-line banner "Nome atual: Bull Metrics" at the top of each rather than rewriting history |

---

## F2 — Golden Terminal color violations (High)

The design system defines `--bull` (#2ebd85) and `--bear` (#f0565b) semantic tokens (`app/globals.css:95–96,170–173`). Five spots bypass them with raw Tailwind palette classes:

| File:line | Current code | Fix |
|---|---|---|
| `components/screener/ScreenerResults.tsx:113` | `<span className="text-emerald-500 font-semibold">` (gross margin > 40%) | `text-bull` |
| `components/screener/ScreenerResults.tsx:120` | `<span className="text-emerald-500 font-semibold flex …">` (ROIC > 15%) | `text-bull` |
| `components/screener/ScreenerResults.tsx:125` | `<span className="text-rose-500 flex …">` (ROIC < 0) | `text-bear` |
| `components/screener/ScreenerResults.tsx:135` | `<span className="text-emerald-500 font-semibold">` (earnings yield > 5%) | `text-bull` |
| `components/settings/SettingsClient.tsx:112` | `message.type === 'error' ? 'text-destructive' : 'text-emerald-500'` | `'text-bull'` — note: the pre-audit brief said line 113; the class is on **112** |

These five are the only violations — the redesign-plan acceptance criterion "no hardcoded palette colors in components" fails solely because of them. Legitimate token usage confirmed elsewhere (`text-gold-500` in `components/stock/ManagementTeam.tsx`, `components/dev/PlanToggle.tsx:40`).

---

## F3 — i18n violations: hardcoded UI strings (High)

CLAUDE.md §2 mandates "nunca texto hardcoded em JSX". Twelve violations, all in three files:

| File:line | Hardcoded string | Fix (message key) |
|---|---|---|
| `components/stock/ManagementTeam.tsx:67` | `Equipa de Gestão` (loading state) | `stock.management.title` |
| `components/stock/ManagementTeam.tsx:85` | `Equipa de Gestão` (error state) | same key |
| `components/stock/ManagementTeam.tsx:115` | `Equipa de Gestão` (loaded state) | same key |
| `components/stock/ManagementTeam.tsx:92` | `Aviso` | `stock.management.warning` |
| `components/stock/ManagementTeam.tsx:93` | `Perfil não encontrado.` | `stock.management.notFound` |
| `components/stock/ManagementTeam.tsx:53` | catch fallback `Não foi possível obter os dados…` | `stock.management.fetchError` |
| `components/stock/ManagementTeam.tsx:119` | inline bilingual ternary for the AI-translation tooltip | `stock.management.aiTranslationNote` — the `locale === 'pt' ? … : …` pattern hardcodes exactly two languages while `messages/` ships nine |
| `components/stock/ManagementTeam.tsx:122` | `'PT/EN'` / `'EN/PT'` | `stock.management.langBadge` |
| `components/stock/ManagementTeam.tsx:126` | `Powered by AI` | `stock.management.poweredBy` |
| `components/stock/InsiderActivity.tsx:161` | `Código SEC não disponível` | `insider.codes.unavailable` |
| `components/settings/SettingsClient.tsx:182` | `placeholder="Dark Mode"` | `settings.preferences.darkMode` |
| `components/settings/SettingsClient.tsx:185` | `<SelectItem value="dark">Dark Mode</SelectItem>` | same key |

`ManagementTeam.tsx` is the systemic offender: it was built PT-first with inline `locale === 'pt'` ternaries (`:101–104` for data fields is fine — that's content — but `:119–122` for UI chrome is not). Add the keys to `messages/pt.json` and `messages/en.json` under `stock.management.*`, replace literals with `useTranslations('stock.management')`, and let the other 7 locales fall back until translated.

---

## F4 — TypeScript quality (Medium)

| File:line | Current | Fix |
|---|---|---|
| `components/stock/StockPriceChart.tsx:95` | `const handleMouseDown = (e: any) =>` | Recharts 3 exports the chart mouse-event shape; type as `CategoricalChartState`-equivalent from `recharts` (or minimally `{ activeLabel?: string }`) |
| `components/stock/StockPriceChart.tsx:106` | `const handleMouseMove = (e: any) =>` | same |
| `components/stock/StockPriceChart.tsx:155` | `const renderSelectionLabel = (props: any) =>` | `props: { viewBox?: { x: number; y: number; width: number; height: number } }` — the function only reads `viewBox` (`:156`) |
| `components/stock/ManagementTeam.tsx:52` | `catch (e: any)` | `catch (e)` + `e instanceof Error ? e.message : fallback` |
| `components/stock/InsiderActivity.tsx:159` | `` t(`codes.${tx.transactionCode}` as any) `` | The guard at `:158` already restricts codes to `['P','S','A','M','F','G','J']`; type the array `as const` and the template key narrows without the cast |

No other `any`/unsafe casts found in `app/`, `components/`, `lib/`.

---

## F5 — Loading states: 1 of 8 routes (Medium)

Only `app/(app)/stock/[ticker]/loading.tsx` exists (66-line skeleton — good pattern). Missing on: `/dashboard`, `/screener`, `/portfolio`, `/calendar`, `/dcf`, `/transcripts`, `/settings`. The dashboard and stock pages block on multi-query Prisma fetches, so navigation shows a frozen frame until data lands.

**Fix:** copy the stock skeleton pattern into `loading.tsx` for `/dashboard` and `/screener` first (heaviest server fetches), then the rest. Also: `app/(app)/stock/[ticker]/page.tsx` fetches company + analyses + fundamentals sequentially before rendering anything — wrap `<InsiderActivity>`, `<StockNews>`, `<ManagementTeam>` sections in `<Suspense>` boundaries so the header and chart stream first (they already fetch client-side; the blocking cost is the Prisma work in the page).

---

## F6 — Recharts token wiring (Medium)

`docs/brand/redesign-plan.md` Phase 4 marks `FinancialsEngine`/charts as "Recharts not fully wired to `var(--chart-*)`". Confirmed still open. Charts that hardcode stroke/fill props won't follow theme changes (and the future light-theme review in Phase 5 will break visibly). **Fix:** in each chart component, read colors via CSS variables (`stroke="var(--chart-1)"` etc.) — Recharts 3 accepts CSS variable strings in SVG props.

---

## Accessibility notes

- **Contrast:** gold `#E4AA33` on `#0B0B0E` ≈ **9.9:1** (AAA). Bull green `#2ebd85` and bear red `#f0565b` on the same canvas both clear 4.5:1 (AA) — no color-contrast findings.
- **Icon buttons:** the sampled surfaces (`SearchBar`, `ScreenerResults:146` `sr-only`, `StockHeader` follow button) all have accessible names. No violations found in sampled components.
- **Keyboard:** search navigation (↑↓ Enter Esc) implemented per spec. The drag-to-measure interaction in `StockPriceChart.tsx:95–129` is mouse-only with no keyboard equivalent — acceptable for an enhancement feature, but note it in the Phase 5 a11y pass (`docs/brand/redesign-plan.md`, unstarted).
- **Focus rings:** Phase 5's "focus-visible rings audit" remains TODO; `ScreenerResults.tsx:143` shows the correct `focus-visible:ring-1` pattern to standardize on.

## Testing

**Zero test files exist** (no `*.test.*`, `*.spec.*`, `__tests__/`, or vitest/jest config outside `node_modules`) — confirmed. The highest-value first target is `lib/finance/` (pure functions, no UI deps, financial correctness — exactly what CLAUDE.md §7 isolated them for): DCF math, CAGR, format helpers, TTM aggregation. One `vitest` install + ~10 test files covers the code most likely to silently produce wrong numbers for users.
