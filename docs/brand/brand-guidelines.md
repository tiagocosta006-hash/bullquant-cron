# BullVision — Brand Guidelines

> **Product:** BullVision · **Parent studio:** Bullocracy
> **Aesthetic:** *Golden Terminal* — a premium, dark-first financial terminal for value investors.
> Single source of truth in code: [`lib/brand.ts`](../../lib/brand.ts) + [`app/globals.css`](../../app/globals.css).

---

## 1. Brand at a glance

| | |
|---|---|
| **Name** | BullVision (one word — `Bull` + `Vision`) |
| **Parent** | Bullocracy (the studio) — shown as "by Bullocracy" |
| **Promise** | *See the value others miss.* Serious fundamental analysis, in Portuguese, for long-term investors. |
| **Personality** | Calm · rigorous · premium · trustworthy · a little contrarian |
| **Anti-personality** | Hype, "to the moon", day-trading adrenaline, casino UX |
| **Signature** | Gold bull-rook mark on near-black; mono numerals |

**Why the name works.** *Bull* anchors the parent brand and the bull-market optimism of long-term equity investing. *Vision* is the soul of value investing — seeing intrinsic value the market hasn't priced in — and the natural umbrella for the AI Insights feature.

---

## 2. Logo system

The master mark is a **bull head on a chess-rook pedestal**: the *bull* (markets, the Bullocracy parent) fused with the *rook* — a fortress, i.e. the value-investor's *margin of safety*.

### Components
| Asset | Use | File |
|---|---|---|
| **Mark** (bull-rook) | App icon, favicon, avatar, loading, small spaces | [`components/brand/BullMark.tsx`](../../components/brand/BullMark.tsx), [`public/brand/bull-mark-gold.svg`](../../public/brand/bull-mark-gold.svg) |
| **App icon** (mark on dark rounded square) | Favicon, PWA, social avatar | [`public/brand/icon.svg`](../../public/brand/icon.svg) |
| **Lockup** (mark + wordmark) | Headers, sidebar, marketing | [`components/brand/Logo.tsx`](../../components/brand/Logo.tsx) |

The mark is **single-colour** (`currentColor`) — it inherits gold on dark, ink on light, or solid white for one-colour contexts. Eyes are punched through (`evenodd`) so the background reads through them at any size.

### Wordmark
`Bull` in foreground (parchment/ink) + `Vision` in **gold**. Font: **Space Grotesk** ExtraBold, tight tracking (`-0.02em`).

### Clear space & minimum size
- **Clear space:** keep padding ≥ the height of the mark's pedestal on all sides.
- **Minimum size:** mark 16px; full lockup 20px tall. Below 16px use the mark only.

### Logo don'ts
- ✗ Don't recolour the mark outside the approved palette (gold, ink, parchment, white).
- ✗ Don't stretch, rotate, skew, or add drop-shadows/glows to the mark itself.
- ✗ Don't place the gold mark on mid-tone or busy backgrounds — use near-black, white, or the gold chip.
- ✗ Don't re-typeset the wordmark in another font or split `BullVision` across lines.
- ✗ Don't outline the mark or fill the eye holes.

---

## 3. Colour

Dark-first. Gold is the **only** brand-saturated hue — everything else is warm neutral, so gold always means "this matters". Green/red are reserved **exclusively** for market direction and status (never decoration).

### Brand — Gold
| Token | Hex | Use |
|---|---|---|
| `--gold-300` | `#F2C861` | Light accents, gradients |
| `--gold-400` | `#ECB94A` | Hover highlights |
| **`--gold-500`** | **`#E4AA33`** | **Primary — mark, CTAs, active states, focus** |
| `--gold-600` | `#C88E27` | Primary on light, pressed |
| `--gold-700` | `#A1701C` | Deep accents |

### Neutrals — Ink (warm near-black)
| Token | Hex | Use |
|---|---|---|
| `--ink-950` | `#0B0B0E` | App canvas |
| `--ink-900` | `#111014` | Cards |
| `--ink-850` | `#16151A` | Popover / card hover |
| `--ink-800` | `#1C1B21` | Muted / secondary surface |
| `--ink-700` | `#27252D` | Borders |

### Neutrals — Parchment (text)
| Token | Hex | Use |
|---|---|---|
| `--parchment-100` | `#F2EFE6` | Primary text on dark |
| `--grey-400` | `#A8A498` | Muted text |
| `--grey-500` | `#6F6C64` | Subtle / disabled |

### Market & status (semantic only)
| Token | Hex (dark) | Meaning |
|---|---|---|
| `--bull` | `#2EBD85` | Up / positive / success |
| `--bear` | `#F0565B` | Down / negative |
| `--destructive` | `#F0565B` | Errors, destructive actions |
| `--azure` | `#5B9DD9` | Neutral data accent (charts) |
| `--copper` | `#D98C4A` | Secondary data accent (charts) |

**Chart palette:** `chart-1` gold → `chart-2` bull-green → `chart-3` azure → `chart-4` copper → `chart-5` parchment.

### Accessibility
- Body text (`parchment-100` on `ink-950`) ≈ 15:1 — well beyond WCAG AAA.
- Muted text (`grey-400` on `ink-950`) ≈ 6:1 — passes AA for normal text.
- Gold `#E4AA33` on `ink-950` ≈ 9:1 — use **ink** text on gold fills (never white on gold).
- Never encode meaning in colour alone — pair bull/bear with `+/−`, arrows, or labels.

---

## 4. Typography

| Role | Font | Weight | Notes |
|---|---|---|---|
| **Display / headings** | Space Grotesk | 600–800 | Tight tracking. `font-heading`, applied to `h1–h4`. |
| **Body / UI** | Inter | 400–600 | Default `font-sans`. |
| **Numerals / data** | JetBrains Mono | 400–600 | `font-mono`, tabular. Use the `.nums` helper for every price, %, ratio, and figure. |

**Rule:** all financial figures render in mono, tabular (`.nums`) so columns align and digits don't jump on live updates. Prose never uses mono.

---

## 5. Shape, space, motion

- **Radius:** `--radius: 0.625rem` (10px) base; scales to `sm/md/lg/xl`. Tighter than a consumer app — it's a terminal.
- **Borders:** 1px hairlines in `--ink-700`; gold hairline (`.gold-rule`) for featured/hover accents only.
- **Elevation:** prefer borders + subtle dark shadows over heavy glows. One ambient gold glow (`.gold-glow`) is allowed per hero.
- **Motion:** 150–200ms, ease. Functional only (hover, active, load). No bouncing, no confetti.
- **Density:** information-dense but breathable. Generous in marketing, compact in the terminal.

---

## 6. Voice & tone

Write like a **calm, well-read analyst** — confident, plain, never salesy.

- **Do:** short declaratives. Portuguese-first. Concrete numbers. Honest caveats ("um DCF é um modelo, não uma bola de cristal").
- **Don't:** hype words ("rocket", "garantido", "imperdível"), fake urgency, financial-advice phrasing.
- **Always:** show `N/A` (never `0`) for missing data; remind that nothing is investment advice.
- **Tagline:** PT *"Vê o valor que os outros não veem."* · EN *"See the value others miss."*
- **Boilerplate:** *"BullVision é uma plataforma de análise fundamental para investidores de longo prazo: 10 anos de fundamentais, DCF integrada e AI Insights, em português. Uma plataforma Bullocracy."*

---

## 7. Governance

- Brand constants live in [`lib/brand.ts`](../../lib/brand.ts); design tokens in [`app/globals.css`](../../app/globals.css). **Change them there, nowhere else.**
- Never hardcode the wordmark in JSX — render `<Logo />`. Never hardcode UI strings — use i18n (`messages/*.json`).
- Renaming the product = edit `name` + `nameParts` in `lib/brand.ts` (one file).
- See [`media-kit.md`](./media-kit.md) for external assets and [`redesign-plan.md`](./redesign-plan.md) for the rollout plan.
