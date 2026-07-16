import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  ArrowUpRight,
  LineChart,
  Calculator,
  Sparkles,
  Search,
  Check,
  Zap,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Reveal } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Landing — página de entrada editorial: hero a ocupar o ecrã com o
 * único momento Scotch (itálico) no acento do título, um "terminal"
 * de demonstração emoldurado em Liquid Glass a lensar a cartografia,
 * features, números, pricing e CTA final. Todo o texto via i18n.
 */
export default async function LandingPage() {
  const user = await getUser();

  if (user) {
    redirect("/dashboard");
  }

  const t = await getTranslations("marketing");
  const tp = await getTranslations("pricing");

  const features = [
    { icon: LineChart, key: "fundamentals" },
    { icon: Calculator, key: "dcf" },
    { icon: Sparkles, key: "ai" },
  ] as const;

  const stats = [
    { value: t("stats.years"), label: t("stats.yearsLabel") },
    { value: t("stats.companies"), label: t("stats.companiesLabel") },
    { value: t("stats.price"), label: t("stats.priceLabel") },
  ];

  const freeFeatures = tp.raw("features.free") as string[];
  const proFeatures = tp.raw("features.pro") as string[];

  // Dados do terminal-demonstração (mock estático — tickers/números são dados, não UI)
  const demoSpark = "M0 34 L20 30 L40 31 L60 24 L80 26 L100 18 L120 20 L140 12 L160 14 L180 7 L200 4";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": "BullQuant",
        "url": "https://bullmetrics.thebullocracy.com/",
      },
      {
        "@type": "Organization",
        "name": "BullQuant",
        "url": "https://bullmetrics.thebullocracy.com/",
        "logo": "https://bullmetrics.thebullocracy.com/brand/logo.png"
      }
    ]
  };

  return (
    <div className="relative flex-1 overflow-x-clip">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto flex min-h-[86vh] max-w-6xl flex-col justify-center px-6 pb-10 pt-20 md:px-8">
        <Reveal>
          <div className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t("eyebrow")}
          </div>

          <h1 className="max-w-[17ch] text-balance text-5xl font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-7xl md:text-8xl">
            {t("titleLead")}{" "}
            <span className="font-heading font-bold italic text-primary">
              {t("titleAccent")}
            </span>
          </h1>

          <p className="mt-7 max-w-[52ch] text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {t("subtitle")}
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
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

          <p className="mt-6 text-xs text-muted-foreground/80">{t("trust")}</p>
        </Reveal>
      </section>

      {/* ── Terminal de demonstração em vidro ────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24 md:px-8">
        <Reveal>
          <LiquidGlass className="rounded-3xl p-4 sm:p-6">
            {/* pill de navegação do mock */}
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <BrandMark className="h-8 w-8 rounded-lg" />
                <div className="hidden gap-1 sm:flex">
                  {["Dashboard", "Screener", "Portfólio"].map((x, i) => (
                    <span
                      key={x}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium",
                        i === 0 ? "bg-primary/15 text-primary" : "text-muted-foreground",
                      )}
                    >
                      {x}
                    </span>
                  ))}
                </div>
              </div>
              <span className="flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground">
                <Search className="h-3.5 w-3.5" /> AAPL <kbd className="rounded border border-border px-1 text-[9px]">⌘K</kbd>
              </span>
            </div>

            {/* cabeçalho da empresa + sparkline */}
            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Apple Inc. <span className="text-muted-foreground">· AAPL</span></div>
                    <div className="nums mt-2 text-4xl font-bold tracking-tight">227,34 $</div>
                    <div className="nums mt-1 text-sm font-semibold text-bull">▲ +1,86 (+0,82%)</div>
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="mt-4 h-12 w-full" aria-hidden="true">
                  <path d={`${demoSpark} L200 40 L0 40 Z`} fill="var(--primary)" opacity="0.12" />
                  <path d={demoSpark} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>

              {/* métricas */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["Revenue TTM", "394,3 B"],
                  ["FCF", "108,8 B"],
                  ["ROIC", "56,2%"],
                  ["Margem", "46,2%"],
                ].map(([k, v]) => (
                  <div key={k} className="glass rounded-2xl p-4">
                    <div className="text-xs font-medium text-muted-foreground">{k}</div>
                    <div className="nums mt-1.5 text-xl font-bold tracking-tight">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </LiquidGlass>
        </Reveal>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24 md:px-8">
        <Reveal className="grid gap-5 sm:grid-cols-3">
          {features.map(({ icon: Icon, key }) => (
            <LiquidGlass key={key} className="rounded-3xl p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="text-base font-semibold">{t(`features.${key}.title`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {t(`features.${key}.desc`)}
              </p>
            </LiquidGlass>
          ))}
        </Reveal>
      </section>

      {/* ── Números ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24 md:px-8">
        <Reveal className="grid gap-5 sm:grid-cols-3">
          {stats.map(({ value, label }) => (
            <div key={label} className="text-center sm:text-left">
              <div className="nums text-5xl font-extrabold tracking-tight text-primary sm:text-6xl">
                {value}
              </div>
              <div className="mt-2 text-sm font-medium text-muted-foreground">{label}</div>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-24 md:px-8">
        <Reveal>
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {tp("badge")}
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{tp("title")}</h2>
            <p className="mt-3 text-muted-foreground">{tp("subtitle")}</p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Gratuito */}
            <LiquidGlass className="flex flex-col rounded-3xl p-7">
              <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{tp("free.name")}</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-extrabold tracking-tight">{tp("free.price")}</span>
                <span className="mb-1 text-sm text-muted-foreground">/ {tp("free.period")}</span>
              </div>
              <p className="mt-2 mb-6 text-sm text-muted-foreground">{tp("free.description")}</p>
              <ul className="mb-8 flex flex-col gap-2.5">
                {freeFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                      <Check className="h-3 w-3 text-muted-foreground" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <Link href="/register" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
                  {tp("free.cta")} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </LiquidGlass>

            {/* PRO */}
            <div className="relative flex flex-col rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/8 via-card/80 to-card/60 p-7 shadow-[0_0_50px_-10px_hsl(var(--primary)/0.2)] backdrop-blur">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground shadow-lg">
                  <Zap className="h-3 w-3 fill-current" />
                  {tp("pro.badge")}
                </div>
              </div>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">{tp("pro.name")}</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-extrabold tracking-tight">{tp("pro.price")}</span>
                <span className="mb-1 text-sm text-muted-foreground">/ {tp("pro.period")}</span>
              </div>
              <p className="mt-2 mb-6 text-sm text-muted-foreground">{tp("pro.description")}</p>
              <ul className="mb-8 flex flex-col gap-2.5">
                {proFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
                      <Check className="h-3 w-3 text-primary" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "w-full shadow-[0_4px_24px_-6px_hsl(var(--primary)/0.5)]")}>
                  {tp("pro.cta")} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-5 text-center text-xs text-muted-foreground/60">
            {tp("trust")}
          </div>
        </Reveal>
      </section>

      {/* ── CTA final ────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-28 md:px-8">
        <Reveal>
          <LiquidGlass className="flex flex-col items-center gap-6 rounded-3xl p-10 text-center sm:p-14">
            <BrandMark className="h-14 w-14 rounded-2xl shadow-lg" />
            <h2 className="max-w-[24ch] text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t("ctaTitle")}
            </h2>
            <p className="max-w-[48ch] text-muted-foreground">{t("ctaSubtitle")}</p>
            <Link
              href="/register"
              className={cn(buttonVariants({ size: "lg" }), "h-13 px-8 text-base font-semibold")}
            >
              {t("primaryCta")}
            </Link>
          </LiquidGlass>
        </Reveal>
      </section>
    </div>
  );
}
