import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarDays, Check, ChevronDown, LayoutGrid, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Parallax } from "@/components/fx/Parallax";
import { Reveal } from "@/components/fx/Reveal";
import { HeroHorizon } from "@/components/marketing/HeroHorizon";
import { HeroStage } from "@/components/marketing/HeroStage";
import { LiveCell } from "@/components/marketing/LiveCell";
import { AiInsightCard } from "@/components/marketing/AiInsightCard";
import { ChartScrollDraw } from "@/components/marketing/ChartScrollDraw";
import { Counter } from "@/components/marketing/Counter";
import { DcfScrollDemo } from "@/components/marketing/DcfScrollDemo";
import { FeatureStory } from "@/components/marketing/FeatureStory";
import { GrowCta } from "@/components/marketing/GrowCta";
import { ManifestoText } from "@/components/marketing/ManifestoText";
import { TickerWall } from "@/components/marketing/TickerWall";
import { LANDING_MEDIA } from "@/components/marketing/media";
import { MediaFrame } from "@/components/marketing/MediaFrame";
import { ScrollShowcase } from "@/components/marketing/ScrollShowcase";
import { TerminalMock } from "@/components/marketing/TerminalMock";
import { TickerMarquee } from "@/components/marketing/TickerMarquee";
import { BRAND } from "@/lib/brand";
import { getTickerItems } from "@/lib/marketing/ticker";
import { getUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Landing v2 — scroll-cinematográfica: hero de tipografia gigante com
 * ticker vivo (dados EOD do Postgres), showcase que se "abre" com o
 * scroll, manifesto palavra-a-palavra, três stories (gráfico que se
 * desenha · DCF real scriptada · AI Brief), bento, counters e CTA final.
 * Pinned sections são CSS sticky (nunca pin do GSAP — ver
 * lib/marketing/gsap.ts); todo o texto via i18n; media real entra pelos
 * slots de components/marketing/media.ts.
 */

const SITE_URL = "https://bullmetrics.thebullocracy.com";

const heroDelay = (s: number) => ({ "--hero-delay": `${s}s` }) as React.CSSProperties;

/* Headline palavra a palavra: cada palavra sobe de trás de uma clip-line
   (.hero-clip/.hero-word em globals.css); --w dá o stagger e o delay do
   sheen no accent. O h1 leva aria-label com a frase completa.
   NOTA: o cls (gold-sheen-text) vai num span INTERIOR — na mesma node
   que .hero-word, a `animation` do sheen esmagava a da subida e a
   palavra ficava presa fora do clip (invisível). */
const heroWords = (text: string, offset: number, cls?: string) =>
  text.split(" ").map((w, i) => (
    <span key={`${offset}-${i}`} aria-hidden className="hero-clip">
      <span className="hero-word" style={{ "--w": offset + i } as React.CSSProperties}>
        {cls ? <span className={cls}>{w}</span> : w}
      </span>
    </span>
  ));

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const [user, { preview }] = await Promise.all([getUser(), searchParams]);

  // ?preview=1 deixa ver a landing mesmo com sessão iniciada (rever design
  // sem ter de fazer logout / abrir janela anónima).
  if (user && preview !== "1") {
    redirect("/dashboard");
  }

  const [t, ticker] = await Promise.all([getTranslations("marketing"), getTickerItems()]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: BRAND.name,
        url: `${SITE_URL}/`,
      },
      {
        "@type": "Organization",
        name: BRAND.name,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}${BRAND.logoSrc}`,
      },
    ],
  };

  const bentoCards = [
    {
      key: "portfolio",
      icon: LayoutGrid,
      span: "md:col-span-4",
      mock: (
        <div className="mt-5 space-y-2.5">
          {[
            ["AAPL", "227,34 $", "+0,82%", true],
            ["MSFT", "448,90 $", "+0,41%", true],
            ["NVDA", "131,62 $", "−1,13%", false],
          ].map(([tick, price, chg, up], i) => (
            <div
              key={tick as string}
              className="flex items-center justify-between rounded-xl border border-border/50 bg-card/40 px-4 py-2.5 transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              style={{ transitionDelay: `${i * 50}ms` }}
            >
              <span className="text-sm font-semibold">{tick}</span>
              <span className="nums text-sm text-muted-foreground">{price}</span>
              {tick === "AAPL" ? (
                <LiveCell
                  values={["+0,82%", "+0,85%", "+0,79%"]}
                  className="nums text-xs font-semibold text-bull"
                />
              ) : (
                <span className={cn("nums text-xs font-semibold", up ? "text-bull" : "text-bear")}>
                  {chg}
                </span>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "search",
      icon: Search,
      span: "md:col-span-2",
      mock: (
        <div className="mt-5 flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-4 py-2.5 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          AAPL
          <kbd className="kbd-tap ml-auto rounded border border-border px-1.5 text-[10px] transition-colors duration-[var(--dur-fast)] group-hover:border-primary/50 group-hover:text-primary">
            ⌘K
          </kbd>
        </div>
      ),
    },
    {
      key: "calendar",
      icon: CalendarDays,
      span: "md:col-span-2",
      mock: (
        <div className="mt-5 grid grid-cols-7 gap-1.5" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-6 rounded-md border border-border/40",
                i === 9 ? "bento-day-pulse bg-primary/20" : "bg-card/40",
              )}
            />
          ))}
        </div>
      ),
    },
    {
      key: "screener",
      icon: LayoutGrid,
      span: "md:col-span-4",
      mock: (
        <div className="mt-5 flex flex-wrap gap-2">
          {["Growth", "Dividend Growth", "Buyback Machines", "Wide Moat"].map((c, i) => (
            <span
              key={c}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium",
                i === 0
                  ? "bg-primary/15 text-primary transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  : "border border-border/60 bg-card/40 text-muted-foreground",
              )}
            >
              {c}
            </span>
          ))}
        </div>
      ),
    },
  ] as const;

  return (
    <div className="relative flex-1 overflow-x-clip">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── 1 · Hero (com horizonte dourado, aurora e saída em dolly) ── */}
      <section
        data-backdrop="paper"
        className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col px-6 pt-20 md:min-h-[calc(74svh-4rem)] md:px-8"
      >
        <div className="hero-aurora" aria-hidden />
        <HeroHorizon />
        <HeroStage className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center">
          <h1
            aria-label={`${t("titleLead")} ${t("titleAccent")}`}
            className="max-w-[15ch] text-balance text-5xl font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-7xl md:text-8xl xl:text-[7.5rem]"
          >
            {heroWords(t("titleLead"), 0)}
            {heroWords(
              t("titleAccent"),
              t("titleLead").split(" ").length,
              "font-heading font-bold italic text-primary gold-sheen-text",
            )}
          </h1>

          <p
            className="hero-in mt-8 max-w-[52ch] text-lg leading-relaxed text-muted-foreground sm:text-xl"
            style={heroDelay(0.18)}
          >
            {t("subtitle")}
          </p>

          <div className="hero-in mt-10 flex flex-col gap-3 sm:flex-row" style={heroDelay(0.28)}>
            <Link
              href="/register"
              data-track="hero_register"
              className={cn(
                buttonVariants({ size: "lg" }),
                "pressable cta-sheen cta-glow h-13 px-8 text-base font-semibold",
              )}
            >
              {t("primaryCta")}
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="hero_demo"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "pressable h-13 px-8 text-base",
              )}
            >
              {t("secondaryCta")} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </div>

          <p className="hero-in mt-6 text-xs text-muted-foreground/80" style={heroDelay(0.36)}>
            {t("trust")}
          </p>
        </HeroStage>

        {/* fita de terminal full-bleed (fora do HeroStage — plano próprio) */}
        <div
          className="hero-in -mx-6 border-y border-border/50 bg-card/40 md:-mx-8"
          style={heroDelay(0.5)}
        >
          <TickerMarquee items={ticker} label={t("ticker.label")} />
        </div>
      </section>

      {/* ── 2 · Showcase cinematográfico (scrub + sticky) ───────── */}
      <section data-backdrop="stage" className="relative isolate">
        <ScrollShowcase
          peek
          captions={[t("showcase.caption"), t("showcase.caption2"), t("showcase.caption3")]}
        >
          <MediaFrame media={LANDING_MEDIA.showcaseTerminal} alt={t("showcase.alt")}>
            <TerminalMock liveLabel={t("showcase.live")} aiChipLabel={t("showcase.aiChip")} />
          </MediaFrame>
        </ScrollShowcase>
      </section>

      {/* ── 3 · Manifesto (palavra a palavra, parede de tickers) ── */}
      <section data-backdrop="sunken" className="relative isolate">
        <ManifestoText
          lines={[t("manifesto.l1"), t("manifesto.l2"), t("manifesto.l3")]}
          accentLine={2}
          backdrop={<TickerWall items={ticker} />}
        />
      </section>

      {/* ── 4 · Story 1: fundamentais (gráfico desenha-se) ──────── */}
      <section data-backdrop="grid" className="relative isolate">
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
          <FeatureStory
            index="01"
            eyebrow={t("stories.fundamentals.eyebrow")}
            title={t("stories.fundamentals.title")}
            titleAccent={t("stories.fundamentals.titleAccent")}
            desc={t("stories.fundamentals.desc")}
            bullets={[
              t("stories.fundamentals.b1"),
              t("stories.fundamentals.b2"),
              t("stories.fundamentals.b3"),
            ]}
          >
            <LiquidGlass className="rounded-3xl p-6 sm:p-8">
              <ChartScrollDraw
                ariaLabel={t("stories.fundamentals.chartAria")}
                legendRevenue={t("stories.fundamentals.legendRevenue")}
                legendFcf={t("stories.fundamentals.legendFcf")}
              />
            </LiquidGlass>
          </FeatureStory>
        </div>
      </section>

      {/* ── 5 · Story 2: DCF (o motor real, scriptado) ──────────── */}
      <section data-backdrop="rings" className="relative isolate">
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
          <FeatureStory
            reverse
            index="02"
            eyebrow={t("stories.dcf.eyebrow")}
            title={t("stories.dcf.title")}
            titleAccent={t("stories.dcf.titleAccent")}
            desc={t("stories.dcf.desc")}
            bullets={[t("stories.dcf.b1"), t("stories.dcf.b2"), t("stories.dcf.b3")]}
          >
            <DcfScrollDemo
              labels={{
                growth: t("stories.dcf.growth"),
                wacc: t("stories.dcf.wacc"),
                terminal: t("stories.dcf.terminal"),
                price: t("stories.dcf.price"),
                fairValue: t("stories.dcf.fairValue"),
                perShare: t("stories.dcf.perShare"),
                margin: t("stories.dcf.margin"),
                undervalued: t("stories.dcf.undervalued"),
                overvalued: t("stories.dcf.overvalued"),
                disclaimer: t("stories.dcf.disclaimer"),
              }}
            />
          </FeatureStory>
        </div>
      </section>

      {/* ── 6 · Story 3: AI Insights (brief escreve-se) ─────────── */}
      <section data-backdrop="dots" className="relative isolate">
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
          <FeatureStory
            index="03"
            eyebrow={t("stories.ai.eyebrow")}
            title={t("stories.ai.title")}
            titleAccent={t("stories.ai.titleAccent")}
            desc={t("stories.ai.desc")}
            bullets={[t("stories.ai.b1"), t("stories.ai.b2"), t("stories.ai.b3")]}
          >
            <AiInsightCard
              title={t("stories.ai.cardTitle")}
              summary={t("stories.ai.summary")}
              catalystsLabel={t("stories.ai.catalystsLabel")}
              catalysts={[t("stories.ai.catalyst1"), t("stories.ai.catalyst2")]}
              riskLabel={t("stories.ai.riskLabel")}
              risk={t("stories.ai.risk1")}
              disclaimer={t("stories.ai.disclaimer")}
            />
          </FeatureStory>
        </div>
      </section>

      {/* ── 7 · Feature tour (só renderiza com media real) ──────── */}
      {LANDING_MEDIA.featureTour ? (
        <section className="mx-auto max-w-6xl px-6 pb-28 md:px-8 md:pb-40">
          <Reveal>
            <MediaFrame media={LANDING_MEDIA.featureTour} alt={t("tour.alt")} aspect="16 / 9" />
          </Reveal>
        </section>
      ) : null}

      {/* ── 8 · Bento: tudo num terminal ────────────────────────── */}
      <section
        data-backdrop="paper-grid"
        className={cn(
          "relative isolate",
          // sem feature tour, o salto story 3 → bento precisa de mais ar
          LANDING_MEDIA.featureTour ? "" : "pt-4 md:pt-8",
        )}
      >
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
        <Reveal data-reveal="zoom" className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl md:text-6xl">
            {t("bento.title")}
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t("bento.subtitle")}</p>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-6">
          {bentoCards.map(({ key, icon: Icon, span, mock }, i) => (
            <Reveal key={key} className={span} style={{ transitionDelay: `${i * 70}ms` }}>
              <Parallax amp={i % 2 ? 28 : 44} zoom className="h-full">
              <LiquidGlass className="group card-lift h-full rounded-3xl p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition-transform duration-[var(--dur-base)] ease-[var(--spring)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <h3 className="text-base font-semibold">{t(`bento.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {t(`bento.${key}.desc`)}
                </p>
                {mock}
              </LiquidGlass>
              </Parallax>
            </Reveal>
          ))}
        </div>
        </div>
      </section>

      {/* ── 9 · Números (counters, banda dourada) ───────────────── */}
      <section data-backdrop="gold" className="relative isolate">
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
          <Reveal className="grid gap-12 text-center sm:grid-cols-2 sm:text-left lg:grid-cols-4">
            {[
              { value: 10, suffix: "", label: t("numbers.years") },
              { value: 500, suffix: "", label: t("numbers.companies") },
              { value: 40, suffix: "", label: t("numbers.quarters") },
              { value: 0, suffix: " €", label: t("numbers.free") },
            ].map(({ value, suffix, label }, i) => (
              <Parallax key={label} amp={i % 2 ? 20 : 36}>
                <Counter
                  value={value}
                  suffix={suffix}
                  className={cn(
                    "text-6xl font-extrabold tracking-tight text-primary sm:text-7xl",
                    value === 0 && "gold-sheen-text",
                  )}
                />
                <div className="mt-3 text-sm font-medium text-muted-foreground">{label}</div>
              </Parallax>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── slot: pricing (feat/pricing-page injeta aqui) ───────── */}
      {/* ── 9b · Planos ─────────────────────────────────────────── */}
      <section data-backdrop="rings" className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-6 py-24 md:px-8 md:py-32">
          <Reveal data-reveal="zoom" className="mx-auto max-w-3xl text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {t("pricing.eyebrow")}
            </div>
            <h2 className="mt-6 text-balance text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl md:text-6xl">
              {t("pricing.title")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {t("pricing.subtitle")}
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-2">
            <Reveal>
              <Parallax amp={36} className="h-full">
                <LiquidGlass className="card-lift flex h-full flex-col rounded-3xl p-7">
                  <div className="text-sm font-semibold text-muted-foreground">
                    {t("pricing.free.name")}
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="gold-sheen-text nums text-5xl font-extrabold tracking-tight text-primary">
                      {t("pricing.free.price")}
                    </span>
                    <span className="text-sm text-muted-foreground">{t("pricing.free.period")}</span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3">
                    {(["f1", "f2", "f3", "f4", "f5"] as const).map((k) => (
                      <li key={k} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                        {t(`pricing.free.${k}`)}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    data-track="pricing_free"
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "pressable cta-sheen mt-8 h-12 w-full text-base font-semibold",
                    )}
                  >
                    {t("pricing.free.cta")}
                  </Link>
                </LiquidGlass>
              </Parallax>
            </Reveal>

            <Reveal style={{ transitionDelay: "90ms" }}>
              <Parallax amp={22} className="h-full">
                <LiquidGlass className="card-lift flex h-full flex-col rounded-3xl border-primary/25 p-7">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-muted-foreground">
                      {t("pricing.pro.name")}
                    </div>
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      {t("pricing.pro.badge")}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="nums text-5xl font-extrabold tracking-tight">
                      {t("pricing.pro.price")}
                    </span>
                    <span className="text-sm text-muted-foreground">{t("pricing.pro.period")}</span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3">
                    {(["f1", "f2", "f3", "f4", "f5"] as const).map((k) => (
                      <li
                        key={k}
                        className="flex items-start gap-2.5 text-[15px] leading-relaxed text-muted-foreground"
                      >
                        <Check className="mt-1 h-4 w-4 shrink-0 text-primary/50" strokeWidth={2.5} />
                        {t(`pricing.pro.${k}`)}
                      </li>
                    ))}
                  </ul>
                </LiquidGlass>
              </Parallax>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 9c · About / Bullocracy ─────────────────────────────── */}
      <section data-backdrop="sunken" className="relative isolate">
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center md:px-8 md:py-32">
          <Reveal data-reveal="zoom">
            <BrandMark className="mx-auto h-14 w-14 rounded-2xl shadow-lg" />
            <div className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {t("about.eyebrow")}
            </div>
            <h2 className="mt-4 text-balance text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {t("about.title")}
            </h2>
            <span className="gold-rule mx-auto mt-8 block h-px w-24" aria-hidden />
            <p className="mt-8 text-lg leading-relaxed text-muted-foreground">{t("about.p1")}</p>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t("about.p2")}</p>
          </Reveal>
        </div>
      </section>

      {/* ── 9d · FAQ ────────────────────────────────────────────── */}
      <section data-backdrop="paper-grid" className="relative isolate">
        <div className="relative mx-auto max-w-2xl px-6 py-24 md:px-8 md:py-28">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
              {t("faq.title")}
            </h2>
          </Reveal>
          <div className="mt-10 space-y-3">
            {([1, 2, 3, 4, 5] as const).map((n, i) => (
              <Reveal key={n} style={{ transitionDelay: `${i * 50}ms` }}>
                <details className="faq-item glass rounded-2xl">
                  <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold">
                    {t(`faq.q${n}`)}
                    <ChevronDown className="faq-chevron h-4 w-4 shrink-0 text-muted-foreground" />
                  </summary>
                  <p className="px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground">
                    {t(`faq.a${n}`)}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ── 10 · CTA final ──────────────────────────────────────── */}
      <section
        data-backdrop="closing"
        className="relative isolate flex min-h-[90vh] items-center justify-center px-6 pb-16 md:px-8"
      >
        <Reveal data-reveal="zoom" className="flex flex-col items-center text-center">
          <BrandMark className="breathe h-16 w-16 rounded-2xl shadow-lg" />
          <span className="gold-rule gold-rule-live mt-8 h-px w-28" aria-hidden />
          <h2 className="mt-8 max-w-[18ch] text-balance text-5xl font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl">
            {t("ctaTitle")}
          </h2>
          <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-muted-foreground">
            {t("ctaSubtitle")}
          </p>
          <GrowCta className="mt-10">
            <Link
              href="/register"
              data-track="footer_register"
              className={cn(
                buttonVariants({ size: "lg" }),
                "pressable cta-sheen h-13 px-10 text-base font-semibold",
              )}
            >
              {t("primaryCta")}
            </Link>
          </GrowCta>
          <p className="mt-6 text-xs text-muted-foreground/80">{t("trust")}</p>
        </Reveal>
      </section>
    </div>
  );
}
