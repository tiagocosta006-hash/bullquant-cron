# Bull Metrics — Design & Front-end Handoff

> **Para o Costa (e o Claude dele).** Este ficheiro é o *design system* completo da
> plataforma Bull Metrics, extraído do código real (não é teoria). Dá-o ao teu Claude
> e pede-lhe para continuar QUALQUER página nova (ex: pricing) neste mesmo sistema.
> Tudo aqui é copy-paste — tokens, tipografia, material, movimento e as regras que
> não se quebram. Se seguires isto, o que fizeres vai encaixar sem retrabalho.
>
> Fonte de verdade no repo: `app/globals.css`, `lib/brand.ts`, `lib/motion.ts`,
> `components/fx/*`, `components/ui/card.tsx`. Se houver dúvida, o código vence este doc.

---

## 0. A visão em 5 frases

1. **"App, não site".** Terminal financeiro premium (referências: Spotify, Netflix, Claude Pro, Revolut, Qualtrim). Densidade organizada, nunca info-dump.
2. **Papel quente claro por defeito, noite a um toque.** Light é o default; dark é um toggle por classe `.dark` (NÃO `prefers-color-scheme`).
3. **Dourado matte é o único acento.** Contido, não "azeitoso". Verde/vermelho SÓ para semântica de mercado (sobe/desce, margens, cash vs debt) — nunca para colorir séries decorativas.
4. **Liquid Glass é o material default.** Todos os `<Card>` são vidro. Sem glows, sem cursor custom, sem sombras choque.
5. **Movimento discreto e reversível.** Fade+slide+blur nos reveals, micro-press nos botões, respiração dourada muito lenta. Tudo respeita `prefers-reduced-motion`.

---

## 1. Tokens — copia isto para o teu `globals.css`

O sistema é de **3 camadas**: primitives → semantic (light/dark) → component. Nunca uses hex cru num componente; usa sempre o token semântico (`bg-background`, `text-muted-foreground`, `border-border`, `text-primary`…).

### 1.1 Primitives + Motion

```css
:root {
  /* Dourado — assinatura Bullocracy; no produto usa-se o MATTE, não o signature */
  --gold-signature: #e4aa33;   /* logo/marca */
  --gold-matte: #b8873b;       /* acento light */
  --gold-matte-deep: #9c6f2c;
  --gold-matte-bright: #d6a64a;/* acento dark */

  /* Neutros quentes — papel (light) */
  --paper-bg: #fafaf7;
  --paper-surface: #ffffff;
  --paper-surface-2: #f0efea;
  --paper-border: #e7e5de;
  --paper-border-strong: #d6d3ca;
  --paper-text: #1a1a17;
  --paper-text-2: #57544d;
  --paper-text-3: #8b877d;

  /* Neutros quentes — noite (dark) */
  --night-bg: #100f0d;
  --night-surface: #191815;
  --night-surface-2: #201e1a;
  --night-border: #262420;
  --night-border-strong: #38352f;
  --night-text: #f2f1eb;
  --night-text-2: #a9a59b;
  --night-text-3: #7c786e;

  /* Mercado (sobe/desce) — só semântica, nunca séries decorativas */
  --market-up: #2e7d51;
  --market-down: #c0392b;
  --market-up-dark: #3dd07e;
  --market-down-dark: #ff5a4d;

  --radius: 0.75rem;

  /* Motion — escala ÚNICA de durações/easings. Usa estas, não inventes ms. */
  --spring: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-instant: 120ms;  /* press feedback */
  --dur-fast: 200ms;     /* hover, cor */
  --dur-base: 320ms;     /* lift, crossfades */
  --dur-slow: 600ms;     /* success moments */
  --dur-reveal: 900ms;   /* reveals de scroll */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

### 1.2 Semantic — light (default)

```css
:root {
  --background: var(--paper-bg);
  --foreground: var(--paper-text);
  --card: var(--paper-surface);
  --card-foreground: var(--paper-text);
  --popover: var(--paper-surface);
  --popover-foreground: var(--paper-text);

  --primary: var(--gold-matte);
  --primary-foreground: #1a1a17;   /* WCAG AA 5.5:1 sobre o gold-matte */
  --secondary: var(--paper-surface-2);
  --secondary-foreground: var(--paper-text-2);
  --muted: var(--paper-surface-2);
  --muted-foreground: var(--paper-text-2);
  --accent: var(--paper-surface-2);
  --accent-foreground: var(--paper-text);

  --destructive: var(--market-down);
  --border: var(--paper-border);
  --input: var(--paper-border-strong);
  --ring: var(--gold-matte);

  --bull: var(--market-up);       --bull-foreground: #ffffff;
  --bear: var(--market-down);     --bear-foreground: #ffffff;

  /* uma cor por série de gráfico: dourado primeiro; verde/vermelho = semântica */
  --chart-1: var(--gold-matte);
  --chart-2: var(--market-up);
  --chart-3: var(--market-down);
  --chart-4: #a15c3c;
  --chart-5: #2f6fb0;
}
```

### 1.3 Semantic — dark (`.dark`)

```css
.dark {
  --background: var(--night-bg);
  --foreground: var(--night-text);
  --card: var(--night-surface);
  --card-foreground: var(--night-text);
  --popover: var(--night-surface-2);
  --popover-foreground: var(--night-text);

  --primary: var(--gold-matte-bright);
  --primary-foreground: #17130a;
  --secondary: var(--night-surface-2);
  --secondary-foreground: var(--night-text);
  --muted: var(--night-surface-2);
  --muted-foreground: var(--night-text-2);
  --accent: var(--night-surface-2);
  --accent-foreground: var(--night-text);

  --destructive: var(--market-down-dark);
  --border: var(--night-border);
  --input: var(--night-border-strong);
  --ring: var(--gold-matte-bright);

  --bull: var(--market-up-dark);   --bull-foreground: #06281c;
  --bear: var(--market-down-dark); --bear-foreground: #2a0d0e;

  --chart-1: var(--gold-matte-bright);
  --chart-2: var(--market-up-dark);
  --chart-3: var(--market-down-dark);
  --chart-4: #c17a3f;
  --chart-5: #4d90d1;
}
```

> Radius escalado por token: `--radius-sm` (0.6×) … `--radius-4xl` (2.6×), base `--radius: 0.75rem`. Usa as classes Tailwind `rounded-lg/xl/2xl` que já mapeiam para isto.

---

## 2. Tipografia

| Uso | Fonte | Como |
|---|---|---|
| **Tudo** (corpo, títulos h1–h4, wordmark) | **SF Pro (SF UI Text)** — `--font-sans` | `font-sans`. Os `h1–h4` são SF **pesado** com `tracking-tight`, NÃO serif. |
| **Display only** (momentos gigantes, itálico editorial na landing) | **Scotch Display** — `--font-heading` | classe `.font-heading`, e principalmente em **itálico**. Nunca no corpo nem em h* normais. |
| **Números financeiros** | SF Pro **tabular** | classe `.nums` → `font-variant-numeric: tabular-nums; "tnum" 1; letter-spacing:-0.01em`. |

- Fontes carregadas via `next/font/local` em `app/layout.tsx` (SF em `.woff2`, Scotch em `.ttf`).
- **JetBrains Mono foi largada** para números — usa `.nums` (SF tabular). `--font-mono` ainda existe mas não é o caminho.
- Regra de ouro: **h1–h4 = `font-sans tracking-tight`**. Serif só quando for um momento display deliberado.

---

## 3. O material: Liquid Glass (`.glass`)

**É o material default do produto.** Todos os `<Card>` (`components/ui/card.tsx`) já aplicam `.glass`. Se fizeres um painel novo, usa `<Card>` — ganhas o vidro de graça.

- `.glass` sozinho (só CSS) já lê como vidro: translúcido, `backdrop-filter` blur leve, rim (hairline no topo + soft-light no interior), `border` de luz. Funciona em qualquer browser.
- O **upgrade** é a lente SDF: o componente `<LiquidGlass>` (`components/fx/LiquidGlass.tsx`) gera por elemento um filtro SVG `feDisplacementMap` (refração confinada às bordas + aberração cromática subtil) e injeta em `--lens`. Chromium only; Safari/FF caem automaticamente no frost.
- Variantes: `.glass-frost` (só blur, sem lente) e `.glass-fade` (o efeito desvanece verticalmente — para banners/headers full-width onde a borda dura ficava mal).

**API do componente:**
```tsx
import { LiquidGlass } from "@/components/fx/LiquidGlass";
<LiquidGlass className="rounded-2xl p-6">…</LiquidGlass>
<LiquidGlass frost … />   // só blur
<LiquidGlass fade … />    // desvanece (banner/header)
```
Para a maioria dos casos: **usa `<Card>`** (já é glass) ou aplica a classe `.glass` a um `<div>`.

---

## 4. Movimento & micro-interações

Regra de decisão: **CSS puro** para hover/press/cor/success. **GSAP** só para scroll-scrub e contagem de números (`lib/motion.ts`). Tudo com fallback `prefers-reduced-motion`.

Classes utilitárias (já em `globals.css`):

| Classe | O que faz |
|---|---|
| `.pressable` | Botões/CTAs: levita −1px em hover, afunda `scale(.97)` no active. |
| `.card-lift` | Cards: sobe −3px em hover, borda acende para o dourado + sombra suave. |
| `.reveal` + `.in` | Fade + slide(44px) + blur(10px) → nítido. **Reversível** (sai ao fazer scroll para cima). Aplica com `<Reveal>`. |
| `.mos-color` | Crossfade bull↔bear via `--mos-t` (0=bear,1=bull), sem trocar classes. |
| `.success-pop` | Momento de sucesso discreto (micro-pop + bloom dourado). Dispara com `successPulse(el)`. |
| `.gold-rule` | Hairline dourada de destaque (separadores). |
| `.gold-sheen-text` | Varrimento dourado subtil sobre texto de acento (dosear!). |

**Helpers JS** (`lib/motion.ts`): `prefersReducedMotion()`, `animateNumber(el, from, to, format)`, `successPulse(el)`.

**Ambiente da landing** (opcional, muito ténue): `.live-dot` (ponto ao vivo na sparkline), `.bento-day-pulse` (respiração dourada 3.2s), motivos de fundo `.motif-grid/.motif-dots/.motif-rings/.motif-stage`, `.beam-ring`. Ciclos lentos 7–20s = respiração, não piscar.

---

## 5. Componentes FX (`components/fx/`)

| Componente | API | Para quê |
|---|---|---|
| `<LiquidGlass frost? fade? />` | herda `HTMLAttributes<div>` | material de vidro com lente SDF (ver §3). |
| `<Reveal>{…}</Reveal>` | herda `HTMLAttributes<div>` | entra/sai com fade+slide+blur ao entrar no viewport (IntersectionObserver, ratio 0.14). |
| `<Parallax>` | ver ficheiro | deslocamento suave por scroll (tem prop `zoom`). |
| `<InertiaScroll wrapId? />` | monta no layout | scroll com inércia/rubber-band. **Aplica transform ao wrap** → ver gotchas. |
| `<ContourCanvas className? />` | — | fundo topográfico que reage ao rato. |
| `<ThemeToggle>` | — | alterna `.dark` (a lógica em `lib/theme.ts`). |

---

## 6. Convenções de código (segue à risca)

- **i18n obrigatório, zero texto hardcoded em JSX.** Todo o texto vive em `messages/pt.json` (primário) e `messages/en.json`. Usa `useTranslations("namespace")`. Nomes de empresas/tickers/dados financeiros ficam em inglês. *(Ex. recente: a página de peers e o AI Analyst passaram a 100% i18n — namespaces `compare` e `analista`.)*
- **`N/A` nunca `0`.** Valor `null` → mostra "N/A", não zero.
- **Cores semânticas com critério.** Verde/vermelho só onde faz sentido (variação, margem, cash vs debt). NÃO colorir P/E.
- **Server Components por defeito**; `"use client"` só com estado/efeitos/interatividade (gráficos, sliders, autocomplete).
- **Ficheiros:** componentes `PascalCase.tsx`; lib/util `camelCase.ts`.
- **Números** → classe `.nums`. **Valores grandes** em B/M com auto-formatação (`lib/finance/format.ts`).
- Reutiliza os tipos gerados pelo Prisma; evita `any`.
- **Marca:** tudo passa por `lib/brand.ts` (`BRAND.name`, `nameParts` para o split dourado do wordmark, `BRAND.gold`, `siteUrl`). Não hardcodes o nome.

---

## 7. Regras que NÃO se quebram (gotchas reais, custaram tempo)

1. **Sem glows, sem cursor custom, sem sombras choque.** O premium vem do material + tipografia + espaço, não de efeitos.
2. **Dourado matte, não signature, no produto.** O `#E4AA33` é a marca/logo; a UI usa `--gold-matte` / `--gold-matte-bright`.
3. **Nunca `pin:` do GSAP ScrollTrigger** neste repo — o rubber-band do `InertiaScroll` aplica transform ao wrap e parte `position:fixed`. Secções "presas" = CSS `sticky` + timelines `scrub`.
4. **`overflow-hidden` num ANCESTOR de um `position:sticky` PARTE o sticky.** Usa `relative isolate` nas secções (cria stacking context sem partir o sticky). Nunca `overflow-hidden` por cima de sticky.
5. **Elementos `position:fixed` de scroll têm de viver FORA do `#marketing-wrap`** (senão o transform do wrap quebra-os).
6. **Dark é por classe `.dark`**, não `prefers-color-scheme`. Se testares em headless, força a classe.
7. **Transições CSS de `filter`:** se animas para blur, define explicitamente o valor final (`filter: none`) no estado final — senão o blur fica preso para sempre. *(Bug real corrigido em `.reveal.in`.)*
8. **Composição de animações:** duas classes que definem `animation` na mesma node esmagam-se. Anima propriedades diferentes em spans aninhados.
9. **Tema anti-FOUC:** a transição de cor do body só corre durante o toggle (classe `theme-transition`), não no load — senão vê-se um flash claro→escuro em dark.
10. **Reduced-motion:** toda a animação nova precisa do bloco `@media (prefers-reduced-motion: reduce)` a desligá-la.

---

## 8. Checklist para uma página/secção nova (ex: pricing)

- [ ] Envolve os painéis em `<Card>` (já são glass) ou aplica `.glass`.
- [ ] Todo o texto em `messages/pt.json` + `messages/en.json`, via `useTranslations`.
- [ ] Cores só por tokens semânticos (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary text-primary-foreground`…). Zero hex cru.
- [ ] Títulos `font-sans tracking-tight`; serif (`.font-heading`) só num momento display.
- [ ] Números com `.nums`; `N/A` para nulos.
- [ ] CTAs com `.pressable`; cards com `.card-lift`; entradas de secção com `<Reveal>`.
- [ ] Verde/vermelho só semântico; dourado matte como único acento.
- [ ] Secção usa `relative isolate` (nunca `overflow-hidden` se houver sticky por dentro).
- [ ] Testa em light **e** dark (toggle da classe `.dark`) e com reduced-motion.

---

*Extraído do código real de Bull Metrics em 2026-07-20. Uma plataforma Bullocracy.*
