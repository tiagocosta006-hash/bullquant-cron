# Product

## Register

Product. BullVision is a financial terminal web app — dashboards, data
tables, forms, real-time-ish price polling. Design serves the workflow; it does not
sell a story.

## Who / What / Why

- **Users**: individual retail investors in PT/EU, beginner to intermediate, value-investing
  oriented. Long-term holders, not day traders, not quants, not institutional.
- **Job to be done**: track fundamentals and price history for S&P 500 companies, run
  DCF valuations, and (this task) manage a personal portfolio/watchlist — see what they
  own, what it's worth, and how it's doing, in one place.
- **Primary workflow on this task's screen** (`/portfolio`): glance at total portfolio
  value and P&L, scan individual positions for standouts (big movers, biggest gainers/
  losers), drill into one position, add/remove/import positions, connect a broker to
  sync automatically.

## Brand Personality

Not defined by this task — visual direction (colors, typography, theming) is owned by
another team member (Alex) and out of scope here. This task is about information
architecture, feature completeness, and layout organization within the existing
"Golden Terminal" visual system (dark, gold-on-near-black, tabular mono for numbers) —
see `docs/DESIGN.md` for the token reference in `app/globals.css` (note: the checked-in
`docs/DESIGN.md` file describes an unrelated Stripe-inspired exploration and should be
disregarded; the live tokens in `app/globals.css` are the source of truth).

## Anti-references

- Not a trading terminal (no order execution, no real-time tick charts, no Level 2 data).
- Not a "hero metric wall" SaaS dashboard cliché — this is a data-dense financial tool,
  closer to a Bloomberg-lite / Qualtrim than a marketing-flavored analytics product.

## Accessibility & Inclusion

No specific WCAG level mandated beyond what's already baked into the shadcn/ui
component layer in use. Standard color-contrast care for the bull/bear (green/red)
semantic colors — these must remain distinguishable without relying on color alone
(icons + sign already used elsewhere in the codebase, e.g. `TrendingUp`/`TrendingDown`
paired with `text-bull`/`text-bear`).
