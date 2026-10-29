import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { ArrowDown, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Reveal } from "@/components/fx/Reveal";
import { TeamSignature } from "@/components/marketing/TeamSignature";
import { SHOT_KEYS, shotPaths, type ShotKey } from "@/components/marketing/showcase/data";
import { TourSteps, type TourStep } from "@/components/marketing/landing-f/TourSteps";
import { cn } from "@/lib/utils";
import { PLANOS, precoTexto } from "@/lib/planos";
import { LEGAL } from "@/lib/legal/config";
import { PricingCards } from "../pricing/PricingCards";
import { FAQ_IDS, FaqList, LandingJsonLd, TEAM, heroDelay } from "./shared";

/** Barra de endereço decorativa de cada paragem (rotas reais, sem ticker). */
const ADDRESS: Record<ShotKey, string> = {
  fund: "thebullvalue.com/stock",
  val: "thebullvalue.com/stock",
  dcf: "thebullvalue.com/dcf",
  fmva: "thebullvalue.com/dcf",
  ai: "thebullvalue.com/stock",
  cal: "thebullvalue.com/calendar",
};

/**
 * Versão F ("Tour guiado com scroll", 29/10/2026): hero compacto e depois uma
 * visita em 6 paragens (Fundamentais → Valuation → DCF → Modelo FMVA →
 * Analista IA → Calendário) com o ecrã fixo à direita a trocar de print.
 * Texto novo em marketing.landingF.* (fragmentos messages/_landing/f.*.json);
 * rótulos/alts dos prints, preços, planos e FAQ reutilizam marketing.*.
 */
export async function LandingF() {
  const [t, tf] = await Promise.all([getTranslations("marketing"), getTranslations("marketing.landingF")]);
  const dias = PLANOS.comunidade.diasGratis ?? 0;
  const faq = FAQ_IDS.map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`, { dias }) }));
  const priceNote = t("hero2.priceNote", { preco: precoTexto(PLANOS.pro.preco), dias });

  const steps: TourStep[] = SHOT_KEYS.map((k) => {
    const p = shotPaths(k);
    return {
      key: k,
      label: t(`inside.items.${k}.label`),
      title: tf(`tour.steps.${k}.title`),
      body: tf(`tour.steps.${k}.body`),
      alt: t(`inside.items.${k}.alt`),
      wide: p.wide,
      square: p.square,
      address: ADDRESS[k],
    };
  });

  return (
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />

      {/* ── 1 · Topo compacto ───────────────────────────────────────── */}
      <section data-backdrop="paper" className="relative isolate px-5 pb-10 pt-12 md:px-8 md:pb-16 md:pt-24">
        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
          <p
            className="hero-in rounded-full border border-border/60 bg-card/60 px-3.5 py-1 text-xs font-semibold text-muted-foreground"
            style={heroDelay(0)}
          >
            {tf("hero.eyebrow")}
          </p>
          <h1
            className="hero-in mt-5 max-w-[20ch] text-balance text-[2.1rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-6xl"
            style={heroDelay(0.06)}
          >
            {tf("hero.titleLead")}{" "}
            <span className="font-heading font-bold italic text-primary">{tf("hero.titleAccent")}</span>
          </h1>
          <p
            className="hero-in mt-4 max-w-[54ch] text-[15px] leading-relaxed text-muted-foreground sm:mt-5 sm:text-lg"
            style={heroDelay(0.14)}
          >
            {tf("hero.subtitle")}
          </p>
          <div
            data-hero-cta
            className="hero-in mt-6 flex flex-row flex-wrap items-center justify-center gap-2.5 sm:mt-7 sm:gap-3"
            style={heroDelay(0.22)}
          >
            <Link
              href="/register"
              data-track="hero_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 px-6 text-base font-semibold sm:px-8")}
            >
              {t("hero2.cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
            <a
              href="#visita"
              data-track="hero_tour"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-12 px-5 text-base sm:px-7")}
            >
              {tf("hero.tourCta")}
              <ArrowDown className="ml-1.5 h-4 w-4" />
            </a>
          </div>
          <p className="hero-in mt-3 text-xs text-muted-foreground" style={heroDelay(0.28)}>
            {priceNote}
          </p>
          <Link
            href="/stock/AAPL"
            data-track="hero_demo"
            className="hero-in mt-3 text-sm font-medium underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
            style={heroDelay(0.32)}
          >
            {tf("hero.peek")}
          </Link>
        </div>
      </section>

      {/* ── 2 · Prova, numa linha ───────────────────────────────────── */}
      <section className="relative isolate px-6 pb-4 pt-2 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-5 text-center">
          <div>
            <div className="nums text-3xl font-extrabold tracking-tight">500</div>
            <div className="text-sm text-muted-foreground">{t("hero2.proofCompanies")}</div>
          </div>
          <div>
            <div className="nums text-3xl font-extrabold tracking-tight">10</div>
            <div className="text-sm text-muted-foreground">{t("hero2.proofYears")}</div>
          </div>
          <div className="text-sm font-semibold">{t("hero2.proofLanguage")}</div>
          <TeamSignature
            faces={TEAM}
            label={t("hero2.proofTeam")}
            className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/50 py-1.5 pl-1.5 pr-4"
          />
        </div>
      </section>

      {/* ── 3 · A visita: passos + ecrã fixo ────────────────────────── */}
      <section id="visita" data-backdrop="grid" className="relative isolate scroll-mt-16">
        <div className="relative mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center md:mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{tf("tour.kicker")}</p>
            <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {tf("tour.title")} <span className="font-heading font-bold italic text-primary">{tf("tour.titleAccent")}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">{tf("tour.subtitle")}</p>
          </Reveal>
          <TourSteps steps={steps} railLabel={tf("tour.railLabel")} />
        </div>
      </section>

      {/* ── 4 · Planos ──────────────────────────────────────────────── */}
      <section id="planos" data-backdrop="rings" data-hide-floating className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">{t("pricing.title")}</h2>
            <p className="mx-auto mt-4 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">{t("pricing.subtitle", { dias })}</p>
          </Reveal>
          <PricingCards supportEmail={LEGAL.email} estado="anonimo" />
        </div>
      </section>

      {/* ── 5 · FAQ ─────────────────────────────────────────────────── */}
      <section data-backdrop="paper-grid" className="relative isolate">
        <div className="relative mx-auto max-w-2xl px-6 py-16 md:px-8 md:py-24">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("faq.title")}</h2>
          </Reveal>
          <FaqList items={faq} />
        </div>
      </section>

      {/* ── 6 · CTA final ───────────────────────────────────────────── */}
      <section data-backdrop="closing" data-hide-floating className="relative isolate px-6 py-24 md:px-8 md:py-32">
        <Reveal className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 rounded-2xl shadow-lg" />
          <h2 className="mt-8 max-w-[20ch] text-balance text-4xl font-extrabold leading-[1.06] tracking-[-0.035em] sm:text-6xl">
            {tf("final.title")} <span className="font-heading font-bold italic text-primary">{tf("final.titleAccent")}</span>
          </h2>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-muted-foreground">{tf("final.lead")}</p>
          <div data-final-cta className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/register"
              data-track="footer_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-14 px-12 text-lg font-semibold")}
            >
              {t("hero2.cta")}
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="footer_peek"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-14 px-9 text-lg")}
            >
              {t("peekCta")}
            </Link>
          </div>
          <p className="mt-5 text-xs text-muted-foreground/80">{priceNote}</p>
        </Reveal>
      </section>
    </div>
  );
}
