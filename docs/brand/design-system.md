# BullVision — Design System (developer cheatsheet)

> How to *use* the tokens in code. Definitions live in [`app/globals.css`](../../app/globals.css); brand rationale in [`brand-guidelines.md`](./brand-guidelines.md).

## Token layers

```
Primitive   --gold-500, --ink-950, --parchment-100   (raw values — rarely touch)
   ↓
Semantic    --primary, --background, --muted, --bull  (purpose — theme here)
   ↓
Component   shadcn/ui consumes the semantic layer       (button, card, input…)
```

## Tailwind utilities (use these — never hex)

| Need | Class |
|---|---|
| Brand / primary | `bg-primary` `text-primary` `border-primary` `ring-primary` |
| Canvas / surface | `bg-background` `bg-card` `bg-popover` `bg-muted` `bg-secondary` |
| Text | `text-foreground` `text-muted-foreground` |
| Borders | `border-border` `border-input` |
| **Up / positive** | `text-bull` `bg-bull/10` `border-bull/20` |
| **Down / negative** | `text-bear` `bg-bear/10` |
| Errors / destructive | `text-destructive` `bg-destructive/10` |
| Sidebar | `bg-sidebar` `text-sidebar-foreground` `border-sidebar-border` |

## Numerals (always for data)

```tsx
<span className="nums">{`$${price.toFixed(2)}`}</span>   // JetBrains Mono, tabular
```
Use `.nums` for **every** price, %, ratio, market cap, EPS, share count. Never for prose.

## Charts (Recharts)

Reference the CSS vars so charts theme with the system:
```tsx
<Area stroke="var(--chart-1)" fill="var(--chart-1)" />   // gold
// chart-1 gold · chart-2 bull-green · chart-3 azure · chart-4 copper · chart-5 parchment
<ReferenceLine y={0.15} stroke="var(--primary)" />        // e.g. ROIC 15% line
```

## Typography classes

| Class | Font |
|---|---|
| `font-heading` | Space Grotesk (also auto-applied to `h1–h4`) |
| `font-sans` (default) | Inter |
| `font-mono` / `.nums` | JetBrains Mono |

## Brand-aware helpers

```tsx
import { Logo } from "@/components/brand/Logo";
import { BullMark } from "@/components/brand/BullMark";
import { BRAND } from "@/lib/brand";

<Logo href="/dashboard" size="md" />          // mark + wordmark
<Logo iconOnly size="sm" />                    // mark only (mobile)
<BullMark className="h-14 w-14 text-primary"/> // raw mark, inherits colour
{BRAND.name} {BRAND.parent}                    // strings (or i18n for UI copy)
```

CSS accents: `.gold-rule` (gold hairline) · `.gold-glow` (one ambient hero glow).

## Rules

1. No hex / no `emerald-*`/`rose-*`/`purple-*` in components — only tokens.
2. `bull`/`bear`/`destructive` = meaning only (direction, status, errors). Gold = "this matters".
3. Ink text on gold fills (`text-primary-foreground`), never white-on-gold.
4. Radius via `rounded-md/lg/xl` (driven by `--radius`).
5. Wordmark → `<Logo/>`; UI copy → i18n; figures → `.nums`.
