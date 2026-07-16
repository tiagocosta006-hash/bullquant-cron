import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Check,
  Zap,
  Shield,
  ArrowRight,
  LineChart,
  Calculator,
  Sparkles,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Reveal } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";
import { PricingCards } from "./PricingCards";

export const metadata = {
  title: "Preços | BullMetrics",
  description:
    "Plano gratuito para sempre ou PRO a €7/mês. Análise fundamental completa do S&P 500, DCF integrada e AI Insights.",
};

export default async function PricingPage() {
  const t = await getTranslations("pricing");
  const tm = await getTranslations("marketing");

  const freeFeatures = t.raw("features.free") as string[];
  const proFeatures = t.raw("features.pro") as string[];
  const faqItems = t.raw("faq.items") as { q: string; a: string }[];

  const platformFeatures = [
    { icon: LineChart, key: "fundamentals" },
    { icon: Calculator, key: "dcf" },
    { icon: Sparkles, key: "ai" },
  ] as const;

  return (
    <div className="relative flex-1 overflow-x-clip">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-14 pt-20 text-center md:px-8">
        <Reveal>
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t("badge")}
          </div>
          <h1 className="text-balance text-5xl font-extrabold leading-tight tracking-[-0.03em] sm:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-[48ch] text-lg text-muted-foreground">
            {t("subtitle")}
          </p>
        </Reveal>
      </section>

      {/* ── Cards de Preço ───────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-6 md:px-8">
        <PricingCards />

        {/* Trust badge */}
        <Reveal className="mt-6 flex justify-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
            <Shield className="h-3.5 w-3.5" />
            {t("trust")}
          </div>
        </Reveal>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-16 md:px-8">
        <Reveal>
          <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight">
            {t("faq.title")}
          </h2>
          <div className="flex flex-col gap-4">
            {faqItems.map(({ q, a }) => (
              <LiquidGlass key={q} className="rounded-2xl p-6">
                <p className="font-semibold">{q}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {a}
                </p>
              </LiquidGlass>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── O que inclui a plataforma ─────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-16 md:px-8">
        <Reveal>
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">
              {tm("features.fundamentals.title").replace("10 anos de fundamentais", "O que tens acesso")}
            </h2>
            <p className="mt-2 text-muted-foreground">
              Ferramentas sérias para investidores sérios — em português e de graça.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {platformFeatures.map(({ icon: Icon, key }) => (
              <LiquidGlass key={key} className="rounded-3xl p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <h3 className="text-base font-semibold">{tm(`features.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {tm(`features.${key}.desc`)}
                </p>
              </LiquidGlass>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── CTA final ────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-28 md:px-8">
        <Reveal>
          <LiquidGlass className="flex flex-col items-center gap-6 rounded-3xl p-10 text-center sm:p-14">
            <h2 className="max-w-[28ch] text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              {tm("ctaTitle")}
            </h2>
            <p className="max-w-[48ch] text-muted-foreground">{tm("ctaSubtitle")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                id="pricing-bottom-cta"
                className={cn(buttonVariants({ size: "lg" }), "h-13 px-8 text-base font-semibold")}
              >
                {tm("primaryCta")}
              </Link>
              <Link
                href="/stock/AAPL"
                className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-13 px-8 text-base")}
              >
                {tm("secondaryCta")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </div>
          </LiquidGlass>
        </Reveal>
      </section>
    </div>
  );
}
