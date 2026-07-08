# BullVision — Redesign Plan (Golden Terminal)

> A phased plan to take the product from generic-purple "BullQuant" to the **BullVision Golden Terminal** identity — as detailed as the build plan, so the team can execute it the same way the app was built: one surface at a time, token-driven, reviewed before merge.

**Legend:** ✅ done in this pass · 🔶 partial · ⬜ todo

---

## Phase 0 — Foundations ✅

The non-negotiable base everything else inherits from. Change brand here, never in components.

| Item | Status | Where |
|---|---|---|
| Brand constants (name, parts, gold, parent) | ✅ | [`lib/brand.ts`](../../lib/brand.ts) |
| 3-layer token system (primitive → semantic → component) | ✅ | [`app/globals.css`](../../app/globals.css) |
| Golden Terminal palette (gold + warm ink + parchment) | ✅ | `globals.css` |
| Finance semantics (`bull`/`bear`) + chart palette | ✅ | `globals.css` |
| Fonts: Space Grotesk / Inter / JetBrains Mono | ✅ | [`app/layout.tsx`](../../app/layout.tsx) |
| Metadata, favicon, OG | ✅ | `app/layout.tsx`, `public/brand/icon.svg` |

**Acceptance:** `npx tsc --noEmit` clean ✅ · `next build` green ✅ · no hardcoded hexes in components.

---

## Phase 1 — Logo & brand system ✅

| Item | Status | Where |
|---|---|---|
| Bull-rook mark (themeable SVG, `currentColor`, evenodd eyes) | ✅ | [`components/brand/BullMark.tsx`](../../components/brand/BullMark.tsx) |
| Wordmark lockup (`Bull` + gold `Vision`, sizes, parent) | ✅ | [`components/brand/Logo.tsx`](../../components/brand/Logo.tsx) |
| Static assets (gold mark, app icon) | ✅ | [`public/brand/`](../../public/brand/) |
| Brand book + media kit + design-system docs | ✅ | [`docs/brand/`](./) |
| ⬜ High-res PNG/SVG export pack (16–512px, mono, white) | ⬜ | use bundled `design` skill |
| ⬜ Animated mark (subtle gold draw-on for loading) | ⬜ | — |

---

## Phase 2 — App shell ✅

| Surface | Status | Notes |
|---|---|---|
| `AppSidebar` | ✅ | Logo lockup, gold active rail, token colours, "by Bullocracy" footer |
| `AppHeader` | ✅ | Mobile brand mark, token search/user |
| `Header` (marketing) | ✅ | Logo lockup replaces placeholder icon |
| `app/layout.tsx` | ✅ | Fonts + metadata + dark-first |
| ⬜ Working mobile nav drawer | ⬜ | sidebar is `hidden md:flex`; add a Sheet/drawer trigger |
| ⬜ Command-palette search (⌘K) | ⬜ | upgrade `SearchBar` |

---

## Phase 3 — Marketing / landing ✅

| Item | Status |
|---|---|
| Golden Terminal hero (eyebrow, emblem, gold-accent headline, CTAs, trust line) | ✅ |
| `marketing` i18n namespace (PT + EN) | ✅ |
| Feature bento (3 cards, gold tiles, hover hairline) | ✅ |
| ⬜ "Live terminal" preview panel (real mini-snapshot of AAPL) | ⬜ |
| ⬜ Social proof / FAQ / footer with Bullocracy links | ⬜ |
| ⬜ OG image as a static rendered asset | ⬜ |

---

## Phase 4 — Data components 🔶

The terminal's substance. All now inherit tokens; remaining work is polish + mono numerals everywhere.

| Component | Status | Remaining |
|---|---|---|
| `StockCard` | ✅ | gold hover hairline, mono nums, bull/bear |
| Market colours unified to `bull`/`bear`/`destructive` across all components | ✅ | — |
| `StockHeader`, `StockPriceChart`, `DecisionChart` | 🔶 | colours tokenised; apply `.nums` to every figure; gold chart series via `--chart-1` |
| `FinancialsEngine` / charts | 🔶 | wire Recharts to `var(--chart-*)`, gold reference lines (ROIC 15%), mono axes |
| `DcfCalculator` / `DcfResults` | 🔶 | margin-of-safety bar in bull/bear; gold slider (already themed) |
| `EarningsCalendar` | 🔶 | beat/miss in bull/bear (done); gold "today" marker |
| `Dashboard` tabs + grid | ⬜ | gold active tab, section headers in `font-heading` |
| Settings / Portfolio empty states | ⬜ | branded empty states with the mark |

**Acceptance per component:** zero ad-hoc colours (`grep emerald|rose|#hex`), all figures `.nums`, green/red only for direction/status.

---

## Phase 5 — Polish & systemize ⬜

| Item | Status |
|---|---|
| Loading/skeleton states in gold-tinted shimmer | ⬜ |
| Focus-visible rings audit (gold, AA) | ⬜ |
| Motion pass (150–200ms, reduced-motion safe) | ⬜ |
| Light theme review (tokens exist; verify in UI) | ⬜ |
| Empty/error/`N/A` states consistent (never `0`) | 🔶 |
| Accessibility audit (contrast, labels, keyboard) | ⬜ |

---

## Execution rules (how to run this plan)

1. **One surface per PR**, reviewed for token-purity before merge (matches the team's existing review gate).
2. **Never** introduce a hex or `emerald-*`/`rose-*` class — use `bg-primary`, `text-bull`, `text-bear`, `var(--chart-*)`.
3. **Every number** uses `.nums` (mono, tabular).
4. **Every string** goes through i18n; **every wordmark** renders `<Logo />`.
5. Run `npx tsc --noEmit && npx next build` before each PR.

## Sequencing (suggested)

`Phase 4 dashboard+charts` → `Phase 3 landing extras + OG` → `Phase 2 mobile nav` → `Phase 5 polish/a11y` → `Phase 1 export pack`.
