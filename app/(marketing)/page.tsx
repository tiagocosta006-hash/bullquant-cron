import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, LineChart, Calculator, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const t = await getTranslations("marketing");

  const features = [
    { icon: LineChart, key: "fundamentals" },
    { icon: Calculator, key: "dcf" },
    { icon: Sparkles, key: "ai" },
  ] as const;

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Ambient gold glow */}
      <div className="gold-glow pointer-events-none absolute inset-x-0 top-0 h-[480px]" />

      <section className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pt-24 pb-16 text-center sm:pt-32">
        {/* Eyebrow */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {t("eyebrow")}
        </div>

        {/* Emblem */}
        <BrandMark className="mb-6 h-16 w-16 text-primary" />

        {/* Headline */}
        <h1 className="font-heading max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-6xl">
          {t("titleLead")}{" "}
          <span className="text-primary">{t("titleAccent")}</span>
        </h1>

        {/* Subhead */}
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t("subtitle")}
        </p>

        {/* CTAs */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "h-12 px-7 text-base font-semibold")}>
            {t("primaryCta")}
          </Link>
          <Link
            href="/stock/AAPL"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 px-7 text-base")}
          >
            {t("secondaryCta")} <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </div>

        {/* Trust line */}
        <p className="mt-6 text-xs text-muted-foreground/80">{t("trust")}</p>
      </section>

      {/* Feature grid */}
      <section className="relative mx-auto grid max-w-5xl gap-4 px-4 pb-28 sm:grid-cols-3">
        {features.map(({ icon: Icon, key }) => (
          <div
            key={key}
            className="group relative overflow-hidden rounded-xl border border-border bg-card/50 p-6 transition-colors hover:border-primary/40 hover:bg-card"
          >
            <div className="gold-rule absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Icon className="h-5 w-5" strokeWidth={2} />
            </div>
            <h3 className="font-heading text-base font-semibold">{t(`features.${key}.title`)}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t(`features.${key}.desc`)}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
