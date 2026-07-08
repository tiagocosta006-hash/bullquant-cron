# BullVision — Media Kit

> Everything a journalist, partner, or teammate needs to represent BullVision correctly.
> Brand rules: [`brand-guidelines.md`](./brand-guidelines.md). Studio: **Bullocracy**.

---

## 1. Naming

- **Always:** `BullVision` — one word, camel-case, capital `B` and `V`.
- **Never:** "Bull Vision", "Bullvision", "BULLVISION" (except in all-caps UI labels), "BV".
- **With parent:** *"BullVision, a Bullocracy platform"* / *"BullVision by Bullocracy"*.

## 2. One-liners

| Length | Copy |
|---|---|
| **Tagline** | Vê o valor que os outros não veem. *(EN: See the value others miss.)* |
| **6 words** | Análise fundamental séria, em português, grátis. |
| **25 words** | BullVision é uma plataforma de análise fundamental de ações para investidores de longo prazo: 10 anos de fundamentais, DCF integrada e AI Insights — em português. |
| **Boilerplate** | BullVision é uma plataforma de análise fundamental para *value investors* de retalho na UE. Oferece 10 anos de fundamentais visuais, uma calculadora de DCF integrada e AI Insights qualitativos, em português e gratuita no MVP. É um produto da **Bullocracy**. |

## 3. Logo assets

| Asset | Path | Format |
|---|---|---|
| Bull mark — gold on transparent | [`public/brand/bull-mark-gold.svg`](../../public/brand/bull-mark-gold.svg) | SVG |
| App icon — gold mark on dark square | [`public/brand/icon.svg`](../../public/brand/icon.svg) | SVG (favicon/PWA/avatar) |
| Mark component (themeable) | [`components/brand/BullMark.tsx`](../../components/brand/BullMark.tsx) | React, `currentColor` |
| Full lockup | [`components/brand/Logo.tsx`](../../components/brand/Logo.tsx) | React |

**Approved logo backgrounds:** `#0B0B0E` (near-black), `#FFFFFF` (white), or the gold chip `#E4AA33` (mark in `#0B0B0E`).
**Clear space:** ≥ pedestal height on all sides. **Min size:** mark 16px, lockup 20px tall.

> Need PNG/print exports? Render the SVGs at 2× with any SVG→PNG tool, or generate higher-fidelity art with the bundled `design` skill (`logo`/`icon` generators, Gemini).

## 4. Colour swatches

| Swatch | Hex | Role |
|---|---|---|
| 🟡 Gold | `#E4AA33` | Primary / brand |
| ⬛ Ink | `#0B0B0E` | Canvas |
| ◼ Card | `#111014` | Surface |
| ⬜ Parchment | `#F2EFE6` | Text on dark |
| 🟢 Bull | `#2EBD85` | Up / positive |
| 🔴 Bear | `#F0565B` | Down / negative |

## 5. Typography

- **Headings:** Space Grotesk (Google Fonts) — 600/700/800
- **Body:** Inter (Google Fonts) — 400/500/600
- **Numerals/data:** JetBrains Mono (Google Fonts) — tabular

## 6. Social / OG

- **Avatar / profile pic:** `icon.svg` (gold mark on dark square).
- **Handle suggestion:** `@bullvision` / `@bullvision.app`.
- **OG image:** rendered from the landing hero — near-black, gold mark, `Vê o valor que os outros não veem.` (see `app/layout.tsx → metadata.openGraph`).
- **Bio:** *Análise fundamental para quem investe a longo prazo. 10 anos de dados, DCF e AI Insights. PT · grátis. by @bullocracy*

## 7. Do / Don't (press)

- ✓ Describe it as "fundamental analysis" / "value investing", "for the long term".
- ✓ Note it's free in the MVP and Portuguese-first.
- ✗ Don't call it a "trading app", "stock tips", "robo-advisor", or "signals" service.
- ✗ Don't imply BullVision gives investment advice — it's an analysis tool.
