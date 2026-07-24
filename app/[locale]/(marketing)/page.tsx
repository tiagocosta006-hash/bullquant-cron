import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';

import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Briefcase, CalendarDays, Check, ChevronDown, LayoutDashboard, SearchCode } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Parallax } from "@/components/fx/Parallax";
import { Reveal } from "@/components/fx/Reveal";
import { HeroHorizon } from "@/components/marketing/HeroHorizon";
import { HeroStage } from "@/components/marketing/HeroStage";
import { AiInsightCard } from "@/components/marketing/AiInsightCard";
import { ChartScrollDraw } from "@/components/marketing/ChartScrollDraw";
import { Counter } from "@/components/marketing/Counter";
import { DcfScrollDemo } from "@/components/marketing/DcfScrollDemo";
import { FeatureStory } from "@/components/marketing/FeatureStory";
import { GrowCta } from "@/components/marketing/GrowCta";
import { ManifestoText } from "@/components/marketing/ManifestoText";
import { DashboardReplica } from "@/components/marketing/replicas/DashboardReplica";
import { PortfolioReplica } from "@/components/marketing/replicas/PortfolioReplica";
import { CalendarReplica } from "@/components/marketing/replicas/CalendarReplica";
import { ExploreReplica } from "@/components/marketing/replicas/ExploreReplica";
import { TickerWall } from "@/components/marketing/TickerWall";
import { LANDING_MEDIA } from "@/components/marketing/media";
import { MediaFrame } from "@/components/marketing/MediaFrame";
import { ScrollShowcase } from "@/components/marketing/ScrollShowcase";
import { TerminalMock } from "@/components/marketing/TerminalMock";
import { TickerMarquee } from "@/components/marketing/TickerMarquee";
import { BRAND } from "@/lib/brand";
import { getTickerItems, GLOBAL_ETFS } from "@/lib/marketing/ticker";
import { getUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { DynamicProPrice } from "@/components/marketing/DynamicProPrice";


/**
 * Landing v2 — scroll-cinematográfica: hero de tipografia gigante com
 * ticker vivo (dados EOD do Postgres), showcase que se "abre" com o
 * scroll, manifesto palavra-a-palavra, três stories (gráfico que se
 * desenha · DCF real scriptada · AI Brief), bento, counters e CTA final.
 * Pinned sections são CSS sticky (nunca pin do GSAP — ver
 * lib/marketing/gsap.ts); todo o texto via i18n; media real entra pelos
 * slots de components/marketing/media.ts.
 */

const SITE_URL = "https://thebullvalue.com";

/* Equipa mostrada na secção "Feito em Portugal" — mesmas fotos da página
   /about (public/team/). Sem foto → iniciais, como lá. */
const TEAM = [
  { name: "Rodrigo Martins", roleKey: "role1", image: "/team/rodrigo.jpg", initials: "RM" },
  { name: "Tiago Costa", roleKey: "role2", image: "/team/tiago.jpg", initials: "TC" },
  { name: "Alexandre Machado", roleKey: "role3", image: "/team/alex.jpeg", initials: "AM" },
] as const;

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

  const [t, tStockTabs, tDashboard, tPortfolio, tCalendar, tExplore, ticker] = await Promise.all([
    getTranslations("marketing"),
    getTranslations("stock.tabs"),
    getTranslations("dashboard"),
    getTranslations("portfolio"),
    getTranslations("calendar"),
    getTranslations("explore"),
    getTickerItems(),
  ]);

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
        "name": BRAND.name,
        "url": BRAND.siteUrl,
        "logo": `${SITE_URL}${BRAND.logoSrc}`,
        "description": "Plataforma portuguesa de análise fundamental de ações com dados da SEC, DCF integrada e AI Brief.",
        "foundingDate": "2024",
        "parentOrganization": {
          "@type": "Organization",
          "name": BRAND.parent,
          "sameAs": [
            "https://www.instagram.com/thebullocracy/",
            "https://www.tiktok.com/@thebullocracy"
          ]
        },
        "contactPoint": {
          "@type": "ContactPoint",
          "email": "info@thebullocracy.com",
          "contactType": "customer support"
        }
      },
      {
        "@type": "SoftwareApplication",
        "name": BRAND.name,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "url": BRAND.siteUrl,
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "EUR"
        }
      }
    ]
  };

  // Bento "Tudo num terminal" — 4 réplicas FIÉIS (não mocks genéricos) de
  // Dashboard, Portfólio, Calendário e Explorar. Cada uma copia literalmente
  // as class strings dos componentes reais (ver comentários em
  // components/marketing/replicas/*.tsx). Sem fetch — números hardcoded,
  // labels via chaves i18n reais das próprias páginas (evita duplicar copy
  // nos 9 locales).
  const bentoCards = [
    {
      key: "dashboard",
      icon: LayoutDashboard,
      href: "/register",
      mock: (
        <DashboardReplica
          tabs={["sp500", "gainers", "marketCap"].map((k) => tDashboard(`tabs.${k}`))}
          marketCapLabel={tDashboard("marketCap")}
          logos={Object.fromEntries(
            ["AAPL", "MSFT", "NVDA"].map((tk) => [tk, ticker.items.find((i) => i.ticker === tk)?.logoUrl ?? null]),
          )}
        />
      ),
    },
    {
      key: "portfolio",
      icon: Briefcase,
      href: "/register",
      mock: (
        <PortfolioReplica
          labels={{
            marketValue: tPortfolio("summary.marketValue"),
            totalPnl: tPortfolio("summary.totalPnl"),
            positions: tPortfolio("positions"),
            upToday: tPortfolio("upToday"),
            allocationTitle: tPortfolio("allocation.title"),
            valueTabs: {
              "1m": tPortfolio("valueChart.tabs.1m"),
              "6m": tPortfolio("valueChart.tabs.6m"),
              "1y": tPortfolio("valueChart.tabs.1y"),
              max: tPortfolio("valueChart.tabs.max"),
            },
          }}
        />
      ),
    },
    {
      key: "calendar",
      icon: CalendarDays,
      href: "/register",
      mock: (
        <CalendarReplica
          labels={{
            day: t("bento.replicas.calDay"),
            week: t("bento.replicas.calWeek"),
            month: t("bento.replicas.calMonth"),
            scopeAll: tCalendar("scopeAll"),
            scopeWatchlist: tCalendar("scopeWatchlist"),
            scopePortfolio: tCalendar("scopePortfolio"),
            others: t("bento.replicas.calOthers"),
          }}
        />
      ),
    },
    {
      key: "explore",
      icon: SearchCode,
      href: "/register",
      mock: (
        <ExploreReplica
          heading={tExplore("sectorsTitle")}
          // resolvido no servidor (contagens fixas ilustrativas, mesma ordem
          // dos 4 setores em ExploreReplica.tsx) — Server Components não
          // podem passar funções como prop a Client Components.
          companiesLabels={[68, 52, 61, 47].map((count) => tExplore("companiesCount", { count }))}
        />
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
          className="hero-in flex flex-col -mx-6 border-y border-border/50 bg-card/40 md:-mx-8"
          style={heroDelay(0.5)}
        >
          {/* legenda acompanha a fonte real dos dados — nunca prometer
              "em direto" quando são fechos da BD (e vice-versa) */}
          <TickerMarquee
            items={ticker.items.filter(i => GLOBAL_ETFS.includes(i.ticker))}
            label={ticker.live ? t("ticker.labelLive") : t("ticker.label")}
          />
          <div className="h-px w-full bg-border/50" />
          <TickerMarquee
            items={ticker.items.filter(i => !GLOBAL_ETFS.includes(i.ticker))}
            label={ticker.live ? t("ticker.labelLive") : t("ticker.label")}
          />
        </div>
      </section>

      {/* ── 2 · Showcase cinematográfico (scrub + sticky) ───────── */}
      <section data-backdrop="stage" className="relative isolate">
        <ScrollShowcase
          peek
          captions={[t("showcase.caption"), t("showcase.caption2"), t("showcase.caption3")]}
        >
          <MediaFrame media={LANDING_MEDIA.showcaseTerminal} alt={t("showcase.alt")}>
            <TerminalMock
              liveLabel={t("showcase.live")}
              tabs={{
                overview: tStockTabs("overview"),
                financials: tStockTabs("financials"),
                analista: tStockTabs("analista"),
              }}
              fin={{
                revenueTitle: t("stories.fundamentals.cardRevenueTitle"),
                segmentsTitle: t("showcase.finSegmentsTitle"),
                fcfTitle: t("stories.fundamentals.cardFcfTitle"),
                cagrLabel: t("stories.fundamentals.cagrLabel"),
                moreCharts: t("showcase.moreCharts", { count: 8 }),
              }}
              analystMock={{
                thesisLabel: t("stories.ai.thesisLabel"),
                thesis: t("stories.ai.thesis"),
                moatLabel: t("stories.ai.moatLabel"),
                moatValue: t("stories.ai.moatValue"),
                chatUser: t("showcase.chat.user"),
                chatAnswer: t("showcase.chat.answer"),
                chatCite: t("showcase.chat.cite"),
              }}
            />
          </MediaFrame>
        </ScrollShowcase>
      </section>

      {/* ── 3 · Manifesto (palavra a palavra, parede de tickers) ── */}
      <section data-backdrop="sunken" className="relative isolate">
        <ManifestoText
          lines={[t("manifesto.l1"), t("manifesto.l2"), t("manifesto.l3")]}
          accentLine={2}
          backdrop={<TickerWall items={ticker.items} />}
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
            <ChartScrollDraw
              ariaLabel={t("stories.fundamentals.chartAria")}
              legendRevenue={t("stories.fundamentals.legendRevenue")}
              legendFcf={t("stories.fundamentals.legendFcf")}
              cardRevenueTitle={t("stories.fundamentals.cardRevenueTitle")}
              cardFcfTitle={t("stories.fundamentals.cardFcfTitle")}
              cagrLabel={t("stories.fundamentals.cagrLabel")}
            />
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
              chipLabel={t("stories.ai.chipLabel")}
              thesisLabel={t("stories.ai.thesisLabel")}
              thesis={t("stories.ai.thesis")}
              moatLabel={t("stories.ai.moatLabel")}
              moatValue={t("stories.ai.moatValue")}
              kpis={[
                {
                  label: t("stories.ai.kpi1Label"),
                  value: t("stories.ai.kpi1Value"),
                  insight: t("stories.ai.kpi1Insight"),
                },
                {
                  label: t("stories.ai.kpi2Label"),
                  value: t("stories.ai.kpi2Value"),
                  insight: t("stories.ai.kpi2Insight"),
                },
              ]}
              chatUser={t("stories.ai.chatUser")}
              chatAnswer={t("stories.ai.chatAnswer")}
              chatCite={t("stories.ai.chatCite")}
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

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {bentoCards.map(({ key, icon: Icon, href, mock }, i) => (
            <Reveal key={key} style={{ transitionDelay: `${i * 70}ms` }}>
              <Parallax amp={i % 2 ? 28 : 44} zoom className="h-full">
              <Link
                href={href}
                data-track={`bento_${key}`}
                className="block h-full rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
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
              </Link>
              </Parallax>
            </Reveal>
          ))}
        </div>
        </div>
      </section>

      {/* ── 9 · Números (counters, banda dourada) ───────────────── */}
      <section data-backdrop="gold" className="relative isolate">
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-32">
          <Reveal className="grid gap-12 text-center sm:grid-cols-2 lg:grid-cols-4">
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
                    "text-5xl font-extrabold tracking-tight text-primary sm:text-7xl",
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
                      <DynamicProPrice fallback={t("pricing.pro.price")} />
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

            {/* As caras da equipa — mesmo avatar redondo da página /about
                (TeamMemberModal): foto com object-cover, iniciais em fallback
                para quem ainda não tem foto em public/team/. Aqui sem modal:
                a landing não precisa das bios, só de pôr cara ao projeto.
                Nomes são nomes próprios → hardcoded (CLAUDE.md §7). */}
            <ul className="mt-12 flex flex-wrap items-start justify-center gap-x-10 gap-y-8">
              {TEAM.map((member) => (
                <li key={member.name} className="flex w-28 flex-col items-center gap-3">
                  <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-secondary shadow-md">
                    {member.image ? (
                      <Image
                        src={member.image}
                        alt={member.name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-lg font-semibold text-muted-foreground">
                        {member.initials}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{member.name}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-primary">
                      {t(`about.team.${member.roleKey}`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
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
          {/* título+subtítulo clicáveis: um único link em bloco (um só tab
              stop; heading dentro de link é HTML válido), hover subtil */}
          <Link
            href="/register"
            data-track="footer_text_register"
            className="group mt-8 flex flex-col items-center"
          >
            <h2 className="max-w-[18ch] text-balance text-5xl font-extrabold leading-[1.02] tracking-[-0.035em] transition-opacity duration-[var(--dur-fast)] group-hover:opacity-90 sm:text-6xl md:text-7xl">
              {t("ctaTitle")}
            </h2>
            <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-muted-foreground transition-colors duration-[var(--dur-fast)] group-hover:text-foreground">
              {t("ctaSubtitle")}
            </p>
          </Link>
          {/* data-final-cta vai na LINHA (não no botão primário): o pill
              flutuante espelha esta composição de 2 botões, por isso o morph
              tem de medir a linha toda — medir só o primário fazia o pill (mais
              largo) tentar encaixar numa caixa mais estreita e aterrar torto. */}
          <div
            data-final-cta
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
          >
            <GrowCta>
              <Link
                href="/register"
                data-track="footer_register"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "pressable cta-sheen h-16 px-14 text-lg font-semibold",
                )}
              >
                {t("primaryCta")}
              </Link>
            </GrowCta>
            <Link
              href="/stock/AAPL"
              data-track="footer_peek"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "pressable h-16 px-10 text-lg",
              )}
            >
              {t("peekCta")}
            </Link>
          </div>
          <p className="mt-6 text-xs text-muted-foreground/80">{t("trust")}</p>
        </Reveal>
      </section>
    </div>
  );
}
