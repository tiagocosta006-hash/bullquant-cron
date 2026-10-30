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
import { FAQ_IDS, FaqList, LandingJsonLd, TEAM, heroDelay, heroLead, heroWords } from "./shared";

/** Barra de endereço decorativa de cada paragem (rotas reais, sem ticker). */
const ADDRESS: Record<ShotKey, string> = {
  fund: "thebullvalue.com/stock",
  val: "thebullvalue.com/stock",
  dcf: "thebullvalue.com/dcf",
  fmva: "thebullvalue.com/dcf?modo=modelo",
  ai: "thebullvalue.com/stock",
  cal: "thebullvalue.com/calendar",
};

/** Botões do hero e do fecho: largura total no telemóvel (iguais, empilhados), natural a partir de sm. */
const STACKED_BTN = "w-full max-w-[22rem] sm:w-auto";

/**
 * Versão F ("Tour guiado com scroll", 29/10/2026): hero compacto e depois uma
 * visita em 6 paragens (Fundamentais → Valuation → DCF → Modelo FMVA →
 * Analista IA → Calendário) com o ecrã fixo à direita a trocar de print.
 * Texto novo em marketing.landingF.* (messages/pt.json + en.json); rótulos e
 * alts dos prints, CTA principal, planos e FAQ reutilizam marketing.*.
 */
/**
 * `heroTexto` troca só o título e o subtítulo do topo pelos da A ou da B
 * (versões I e J, 30/10/2026: "a F mas com o texto da A ou B, maior").
 */
export async function LandingF({ heroTexto }: { heroTexto?: "a" | "b" } = {}) {
  const [t, tf] = await Promise.all([getTranslations("marketing"), getTranslations("marketing.landingF")]);
  const grande = heroTexto !== undefined;
  const dias = PLANOS.comunidade.diasGratis ?? 0;
  const preco = precoTexto(PLANOS.pro.preco);
  const faq = FAQ_IDS.map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`, { dias }) }));

  const proof = [
    { value: "500", label: t("hero2.proofCompanies") },
    { value: "10", label: t("hero2.proofYears") },
    { value: tf("proof.languageValue"), label: tf("proof.languageLabel") },
  ];

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
      <section data-backdrop="paper" className="relative isolate px-5 pb-10 pt-12 md:px-8 md:pb-14 md:pt-24">
        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
          <p
            className="hero-in rounded-full border border-border/60 bg-card/60 px-3.5 py-1 text-[13px] font-semibold text-muted-foreground"
            style={heroDelay(0)}
          >
            {tf("hero.eyebrow")}
          </p>
          {heroTexto === "a" ? (
            <h1 className="mt-5 max-w-[22ch] text-balance text-[2.5rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl xl:text-[5.5rem]">
              <span className="sr-only">{t("titleLead")} {t("titleAccent")}</span>
              {heroLead(t("titleLead"))}
              {heroWords(t("titleAccent"), t("titleLead").split(" ").length, "font-heading font-bold italic text-primary")}
            </h1>
          ) : heroTexto === "b" ? (
            <h1 className="mt-5 max-w-[18ch] text-balance text-[2.5rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl xl:text-[5.5rem]">
              <span className="sr-only">
                {t("landingB.hero.titleLead")} {t("landingB.hero.titleAccent")} {t("landingB.hero.titleTail")}
              </span>
              {heroWords(t("landingB.hero.titleLead"), 0)}
              {heroWords(t("landingB.hero.titleAccent"), t("landingB.hero.titleLead").split(" ").length, "font-heading font-bold italic text-primary")}
              {heroWords(
                t("landingB.hero.titleTail"),
                t("landingB.hero.titleLead").split(" ").length + t("landingB.hero.titleAccent").split(" ").length,
              )}
            </h1>
          ) : (
            <h1
              className="hero-in mt-5 max-w-[20ch] text-balance text-[2.1rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-6xl"
              style={heroDelay(0.06)}
            >
              {tf("hero.titleLead")}{" "}
              <span className="font-heading font-bold italic text-primary">{tf("hero.titleAccent")}</span>
            </h1>
          )}
          <p
            className={cn(
              "hero-in mt-4 max-w-[56ch] text-balance leading-relaxed text-muted-foreground sm:mt-6",
              grande ? "text-base sm:text-xl" : "text-[15px] sm:text-lg",
            )}
            style={heroDelay(0.14)}
          >
            {heroTexto === "a" ? t("hero2.subtitle") : heroTexto === "b" ? t("landingB.hero.subtitle") : tf("hero.subtitle")}
          </p>
          <div
            data-hero-cta
            className="hero-in mt-6 flex w-full flex-col items-center gap-2.5 sm:mt-7 sm:w-auto sm:flex-row sm:justify-center sm:gap-3"
            style={heroDelay(0.22)}
          >
            <Link
              href="/register"
              data-track="hero_register"
              className={cn(buttonVariants({ size: "lg" }), STACKED_BTN, "pressable min-h-12 px-6 text-base font-semibold sm:px-8")}
            >
              {t("hero2.cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Link>
            <a
              href="#visita"
              data-track="hero_tour"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), STACKED_BTN, "pressable min-h-12 px-6 text-base sm:px-7")}
            >
              {tf("hero.tourCta")}
              <ArrowDown className="ml-1.5 h-4 w-4" aria-hidden />
            </a>
          </div>
          {/* Duas linhas no telemóvel (sem "·" a abrir linha), uma só a partir de sm. */}
          <p className="hero-in mt-4 text-[13px] leading-relaxed text-muted-foreground" style={heroDelay(0.28)}>
            <span className="block sm:inline">{tf("priceFrom", { preco })}</span>
            <span className="hidden sm:inline" aria-hidden>
              {" · "}
            </span>
            <span className="block sm:inline">{tf("trial", { dias })}</span>
          </p>
          <Link
            href="/stock/AAPL"
            data-track="hero_demo"
            className="hero-in mt-1 inline-flex min-h-11 items-center text-sm font-medium underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
            style={heroDelay(0.32)}
          >
            {tf("hero.peek")}
          </Link>
        </div>
      </section>

      {/* ── 2 · Prova, numa linha ───────────────────────────────────── */}
      <div className="relative isolate px-5 pb-4 pt-2 md:px-8">
        {/* Lado a lado só em lg: entre 768 e ~1000 px os três números + as caras não cabem numa linha. */}
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 lg:flex-row lg:justify-center lg:gap-10">
          <ul className="grid w-full max-w-md grid-cols-3 text-center md:flex md:w-auto md:max-w-none">
            {proof.map((p, i) => (
              <li key={p.label} className={cn("flex flex-col items-center px-2 md:px-6 xl:px-8", i > 0 && "border-l border-border/60")}>
                <span className="nums text-3xl font-extrabold tracking-tight">{p.value}</span>
                <span className="mt-1 text-[13px] leading-snug text-muted-foreground md:whitespace-nowrap md:text-sm">{p.label}</span>
              </li>
            ))}
          </ul>
          <TeamSignature
            faces={TEAM}
            label={t("hero2.proofTeam")}
            className="inline-flex shrink-0 items-center gap-3 whitespace-nowrap rounded-full border border-border/60 bg-card/50 py-1.5 pl-1.5 pr-4"
          />
        </div>
      </div>

      {/* ── 3 · A visita: passos + ecrã fixo ────────────────────────── */}
      <section id="visita" data-backdrop="grid" className="relative isolate scroll-mt-16">
        <div className="relative mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          {/* Sem Reveal: o título já espreita no fundo do primeiro ecrã do desktop
              e, escondido à espera do scroll, deixava ali uma faixa vazia. */}
          <div className="mx-auto mb-12 max-w-3xl text-center md:mb-8">
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{tf("tour.kicker")}</p>
            <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {tf("tour.title")} <span className="font-heading font-bold italic text-primary">{tf("tour.titleAccent")}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              {tf("tour.subtitle")}
            </p>
          </div>
          <TourSteps steps={steps} railLabel={tf("tour.railLabel")} />
        </div>
      </section>

      {/* ── 4 · Planos ──────────────────────────────────────────────── */}
      <section id="planos" data-backdrop="rings" data-hide-floating className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">{t("pricing.title")}</h2>
            <p className="mx-auto mt-4 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">{t("pricing.subtitle", { dias })}</p>
          </Reveal>
          <PricingCards supportEmail={LEGAL.email} estado="anonimo" />
        </div>
      </section>

      {/* ── 5 · FAQ ─────────────────────────────────────────────────── */}
      <section data-backdrop="paper-grid" className="relative isolate">
        <div className="relative mx-auto max-w-2xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("faq.title")}</h2>
          </Reveal>
          <FaqList items={faq} />
        </div>
      </section>

      {/* ── 6 · CTA final ───────────────────────────────────────────── */}
      <section data-backdrop="closing" data-hide-floating className="relative isolate px-5 py-24 md:px-8 md:py-32">
        <Reveal className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 rounded-2xl shadow-lg" />
          <h2 className="mt-8 max-w-[20ch] text-balance text-4xl font-extrabold leading-[1.06] tracking-[-0.035em] sm:text-6xl">
            {tf("final.title")} <span className="font-heading font-bold italic text-primary">{tf("final.titleAccent")}</span>
          </h2>
          <p className="mt-5 max-w-[52ch] text-pretty text-base leading-relaxed text-muted-foreground">{tf("final.lead", { preco })}</p>
          <div data-final-cta className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:gap-4">
            <Link
              href="/register"
              data-track="footer_register"
              className={cn(buttonVariants({ size: "lg" }), STACKED_BTN, "pressable min-h-14 px-10 text-lg font-semibold sm:px-12")}
            >
              {t("hero2.cta")}
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="footer_peek"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), STACKED_BTN, "pressable min-h-14 px-8 text-lg sm:px-9")}
            >
              {t("peekCta")}
            </Link>
          </div>
          <p className="mt-5 text-[13px] text-muted-foreground">{tf("trial", { dias })}</p>
        </Reveal>
      </section>
    </div>
  );
}
