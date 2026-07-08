# BullVision — Brand & Design System

Visual identity and design system for **BullVision**, a **Bullocracy** platform.
Aesthetic: **Golden Terminal** — premium, dark-first, gold-on-near-black, built for value investors.

## Contents

| Doc | What's inside |
|---|---|
| [brand-guidelines.md](./brand-guidelines.md) | The brand book — name, logo, colour, type, voice, usage do/don't, accessibility |
| [media-kit.md](./media-kit.md) | Press/partner kit — naming, one-liners, logo assets, swatches, social, boilerplate |
| [design-system.md](./design-system.md) | Developer cheatsheet — token utilities, `.nums`, charts, helpers |
| [redesign-plan.md](./redesign-plan.md) | Phased rollout plan — what's done, what's next, per surface |

## Source of truth (code)

- **Brand constants:** [`lib/brand.ts`](../../lib/brand.ts) — name, gold, parent. *Rename the product here only.*
- **Design tokens:** [`app/globals.css`](../../app/globals.css) — 3-layer system, dark-first.
- **Logo:** [`components/brand/`](../../components/brand/) — `BullMark`, `Logo`.
- **Assets:** [`public/brand/`](../../public/brand/) — mark + app icon SVGs.

## 30-second rules

1. Gold `#E4AA33` is the only brand hue — it means "this matters".
2. Green/red = market direction & status only (`text-bull` / `text-bear`), never decoration.
3. Every figure is mono + tabular (`.nums`). Every wordmark is `<Logo/>`. Every string is i18n.
4. Missing data shows `N/A`, never `0`.

## Built with

The [`ui-ux-pro-max`](../../.claude/skills/) skill suite (brand, design, design-system, ui-styling) — installed at `.claude/skills/`.
