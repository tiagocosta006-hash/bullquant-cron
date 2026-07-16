import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarDays, LayoutGrid, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Reveal } from "@/components/fx/Reveal";
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

export default async function LandingPage() {
  const user = await getUser();

  if (user) {
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
          ].map(([tick, price, chg, up]) => (
            <div
              key={tick as string}
              className="flex items-center justify-between rounded-xl border border-border/50 bg-card/40 px-4 py-2.5"
            >
              <span className="text-sm font-semibold">{tick}</span>
              <span className="nums text-sm text-muted-foreground">{price}</span>
              <span className={cn("nums text-xs font-semibold", up ? "text-bull" : "text-bear")}>
                {chg}
              </span>
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
          <kbd className="ml-auto rounded border border-border px-1.5 text-[10px]">⌘K</kbd>
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
                i === 9 ? "bg-primary/20" : "bg-card/40",
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
                  ? "bg-primary/15 text-primary"
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

      {/* ── 1 · Hero (viewport todo menos o header, com ticker no fundo) ── */}
      <section className="relative flex min-h-[calc(100svh-4rem)] flex-col px-6 pt-20 md:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center">
          <div
            className="hero-in mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur"
            style={heroDelay(0)}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t("eyebrow")}
          </div>

          <h1
            className="hero-in max-w-[15ch] text-balance text-5xl font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-7xl md:text-8xl xl:text-[9rem]"
            style={heroDelay(0.08)}
          >
            {t("titleLead")}{" "}
            <span className="font-heading font-bold italic text-primary">{t("titleAccent")}</span>
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
              className={cn(buttonVariants({ size: "lg" }), "h-13 px-8 text-base font-semibold")}
            >
              {t("primaryCta")}
            </Link>
            <Link
              href="/stock/AAPL"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-13 px-8 text-base")}
            >
              {t("secondaryCta")} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </div>

          <p className="hero-in mt-6 text-xs text-muted-foreground/80" style={heroDelay(0.36)}>
            {t("trust")}
          </p>
        </div>

        <div className="hero-in mx-auto w-full max-w-7xl pb-5" style={heroDelay(0.5)}>
          <TickerMarquee items={ticker} label={t("ticker.label")} />
        </div>
      </section>

      {/* ── 2 · Showcase cinematográfico (scrub + sticky) ───────── */}
      <section>
        <ScrollShowcase
          captions={[t("showcase.caption"), t("showcase.caption2"), t("showcase.caption3")]}
        >
          <MediaFrame media={LANDING_MEDIA.showcaseTerminal} alt={t("showcase.alt")}>
            <TerminalMock />
          </MediaFrame>
        </ScrollShowcase>
      </section>

      {/* ── 3 · Manifesto (palavra a palavra, parede de tickers) ── */}
      <section>
        <ManifestoText
          lines={[
            t("manifesto.l1"),
            t("manifesto.l2"),
            t("manifesto.l3"),
            t("manifesto.l4"),
            t("manifesto.l5"),
          ]}
          accentLine={4}
          backdrop={<TickerWall items={ticker} />}
        />
      </section>

      {/* ── 4 · Story 1: fundamentais (gráfico desenha-se) ──────── */}
      <section className="mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
        <FeatureStory
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
      </section>

      {/* ── 5 · Story 2: DCF (o motor real, scriptado) ──────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
        <FeatureStory
          reverse
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
      </section>

      {/* ── 6 · Story 3: AI Insights (brief escreve-se) ─────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
        <FeatureStory
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
      <section className="mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl md:text-6xl">
            {t("bento.title")}
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t("bento.subtitle")}</p>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-6">
          {bentoCards.map(({ key, icon: Icon, span, mock }, i) => (
            <Reveal key={key} className={span} style={{ transitionDelay: `${i * 70}ms` }}>
              <LiquidGlass className="h-full rounded-3xl p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <h3 className="text-base font-semibold">{t(`bento.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {t(`bento.${key}.desc`)}
                </p>
                {mock}
              </LiquidGlass>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 9 · Números (counters) ──────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
        <Reveal className="grid gap-12 text-center sm:grid-cols-2 sm:text-left lg:grid-cols-4">
          {[
            { value: 10, suffix: "", label: t("numbers.years") },
            { value: 500, suffix: "", label: t("numbers.companies") },
            { value: 40, suffix: "", label: t("numbers.quarters") },
            { value: 0, suffix: " €", label: t("numbers.free") },
          ].map(({ value, suffix, label }) => (
            <div key={label}>
              <Counter
                value={value}
                suffix={suffix}
                className="text-6xl font-extrabold tracking-tight text-primary sm:text-7xl"
              />
              <div className="mt-3 text-sm font-medium text-muted-foreground">{label}</div>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ── slot: pricing (feat/pricing-page injeta aqui) ───────── */}

      {/* ── 10 · CTA final ──────────────────────────────────────── */}
      <section className="flex min-h-[90vh] items-center justify-center px-6 pb-16 md:px-8">
        <Reveal className="flex flex-col items-center text-center">
          <BrandMark className="h-16 w-16 rounded-2xl shadow-lg" />
          <span className="gold-rule mt-8 h-px w-28" aria-hidden />
          <h2 className="mt-8 max-w-[18ch] text-balance text-5xl font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl">
            {t("ctaTitle")}
          </h2>
          <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-muted-foreground">
            {t("ctaSubtitle")}
          </p>
          <GrowCta className="mt-10">
            <Link
              href="/register"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-13 px-10 text-base font-semibold transition-transform hover:scale-[1.04]",
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
