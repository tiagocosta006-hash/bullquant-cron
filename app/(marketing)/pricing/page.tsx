import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check, Zap, Shield, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Reveal } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Preços | BullMetrics",
  description:
    "Plano gratuito para sempre ou PRO a €7/mês. Análise fundamental completa do S&P 500, DCF integrada e AI Insights.",
};

export default async function PricingPage() {
  const t = await getTranslations("pricing");

  const freeFeatures = t.raw("features.free") as string[];
  const proFeatures = t.raw("features.pro") as string[];
  const faqItems = t.raw("faq.items") as { q: string; a: string }[];

  return (
    <div className="relative flex-1 overflow-x-clip">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-16 pt-20 text-center md:px-8">
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
      <section className="mx-auto max-w-5xl px-6 pb-20 md:px-8">
        <Reveal className="grid gap-5 md:grid-cols-2">
          {/* Plano Gratuito */}
          <LiquidGlass className="flex flex-col rounded-3xl p-8">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {t("free.name")}
              </p>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-5xl font-extrabold tracking-tight">
                  {t("free.price")}
                </span>
                <span className="mb-1.5 text-muted-foreground">
                  / {t("free.period")}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("free.description")}
              </p>
            </div>

            <ul className="mb-10 flex flex-col gap-3">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                    <Check className="h-3 w-3 text-muted-foreground" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full"
                )}
              >
                {t("free.cta")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </LiquidGlass>

          {/* Plano PRO */}
          <div className="relative flex flex-col rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/8 via-card/80 to-card/60 p-8 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.25)] backdrop-blur">
            {/* Badge "Mais popular" */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground shadow-lg">
                <Zap className="h-3 w-3 fill-current" />
                {t("pro.badge")}
              </div>
            </div>

            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                {t("pro.name")}
              </p>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-5xl font-extrabold tracking-tight">
                  {t("pro.price")}
                </span>
                <span className="mb-1.5 text-muted-foreground">
                  / {t("pro.period")}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("pro.description")}
              </p>
            </div>

            <ul className="mb-10 flex flex-col gap-3">
              {proFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 border border-primary/30">
                    <Check className="h-3 w-3 text-primary" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full shadow-[0_4px_30px_-6px_hsl(var(--primary)/0.5)]"
                )}
              >
                {t("pro.cta")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>

        {/* Trust badge */}
        <Reveal className="mt-6 flex justify-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
            <Shield className="h-3.5 w-3.5" />
            {t("trust")}
          </div>
        </Reveal>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-28 md:px-8">
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
    </div>
  );
}
