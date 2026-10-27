import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Reveal } from "@/components/fx/Reveal";
import { HeroHorizon } from "@/components/marketing/HeroHorizon";
import { HeroVideo } from "@/components/marketing/HeroVideo";
import { GrowCta } from "@/components/marketing/GrowCta";
import { LANDING_MEDIA } from "@/components/marketing/media";
import { TeamSignature } from "@/components/marketing/TeamSignature";
import { PlatformInside } from "@/components/marketing/PlatformInside";
import { cn } from "@/lib/utils";
import { PLANOS, precoTexto } from "@/lib/planos";
import { LEGAL } from "@/lib/legal/config";
import { PricingCards } from "../pricing/PricingCards";
import { FAQ_IDS, FaqList, LandingJsonLd, TEAM, heroDelay, heroLead, heroWords } from "./shared";

/**
 * Landing v3 — direta ao ponto (27/10/2026, "temos de fazer vendas"; modelo:
 * a Qualtrim, ~4 ecrãs). Ordem: título curto + CTA com o preço → VÍDEO REAL da
 * plataforma logo no primeiro ecrã → faixa de prova → a plataforma por dentro
 * (prints reais) → os dois planos → FAQ → CTA final. A v2 (scroll
 * cinematográfico, manifesto, stories animadas, bento, contadores, equipa em
 * grande) tinha ~19 ecrãs; os componentes continuam em components/marketing/.
 * Todo o texto via i18n (marketing.*).
 */
export async function LandingA() {
  const t = await getTranslations("marketing");
  // Dias grátis do plano com comunidade (lib/planos.ts, igual ao trial da Whop).
  const dias = PLANOS.comunidade.diasGratis ?? 0;
  const faq = FAQ_IDS.map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`, { dias }) }));

  return (
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />

      {/* ── 1 · Topo: o que é, o preço e o produto a ser usado ─────── */}
      <section data-backdrop="paper" className="relative isolate px-5 pt-10 md:px-8 md:pt-20">
        <div className="hero-aurora" aria-hidden />
        <HeroHorizon />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
          <h1 className="max-w-[22ch] text-balance text-[2.1rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl">
            {/* Texto real para leitores de ecrã e SEO; o visível é animado palavra a palavra */}
            <span className="sr-only">{t("titleLead")} {t("titleAccent")}</span>
            {heroLead(t("titleLead"))}
            {heroWords(
              t("titleAccent"),
              t("titleLead").split(" ").length,
              "font-heading font-bold italic text-primary gold-sheen-text",
            )}
          </h1>
          <p className="hero-in mt-4 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground sm:mt-5 sm:text-lg" style={heroDelay(0.18)}>
            {t("hero2.subtitle")}
          </p>
          <div data-hero-cta className="hero-in mt-6 flex flex-row flex-wrap items-center justify-center gap-2.5 sm:mt-7 sm:gap-3" style={heroDelay(0.28)}>
            <Link
              href="/register"
              data-track="hero_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable cta-sheen min-h-12 px-6 text-base font-semibold sm:px-8")}
            >
              {t("hero2.cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="hero_demo"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-12 px-5 text-base sm:px-7")}
            >
              {t("peekCta")}
            </Link>
          </div>
          <p className="hero-in mt-3 text-xs text-muted-foreground" style={heroDelay(0.34)}>
            {t("hero2.priceNote", { preco: precoTexto(PLANOS.pro.preco), dias })}
          </p>
        </div>

        <div className="hero-in relative mx-auto mt-7 max-w-6xl md:mt-12" style={heroDelay(0.4)}>
          <HeroVideo
            items={[
              {
                key: "empresa",
                label: t("hero2.tabCompany"),
                video: LANDING_MEDIA.showcaseTerminal?.video ?? "",
                poster: LANDING_MEDIA.showcaseTerminal?.poster ?? "",
                alt: t("hero2.altCompany"),
              },
              {
                key: "dcf",
                label: t("hero2.tabDcf"),
                video: LANDING_MEDIA.featureTour?.video ?? "",
                poster: LANDING_MEDIA.featureTour?.poster ?? "",
                alt: t("hero2.altDcf"),
              },
            ]}
            mobile={{ video: "/media/showcase-mobile.mp4", poster: "/media/showcase-mobile.jpg", alt: t("hero2.altCompany") }}
          />
        </div>
      </section>

      {/* ── 2 · Prova, numa linha ───────────────────────────────────── */}
      <section className="relative isolate px-6 py-12 md:px-8 md:py-16">
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

      {/* ── 3 · A plataforma por dentro (prints reais) ──────────────── */}
      <section data-backdrop="grid" className="relative isolate">
        <div className="relative mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-10 max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {t("inside.title")}{" "}
              <span className="font-heading font-bold italic text-primary">{t("inside.titleAccent")}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">{t("inside.subtitle")}</p>
          </Reveal>
          <Reveal>
            <PlatformInside
              items={(["fund", "val", "dcf", "fmva", "ai", "cal"] as const).map((k) => ({
                key: k,
                label: t(`inside.items.${k}.label`),
                caption: t(`inside.items.${k}.caption`),
                alt: t(`inside.items.${k}.alt`),
                src: `/media/plataforma/${k}.jpg`,
              }))}
            />
          </Reveal>
        </div>
      </section>

      {/* ── 4 · Planos ──────────────────────────────────────────────── */}
      <section id="planos" data-backdrop="rings" data-hide-floating className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">{t("pricing.title")}</h2>
            <p className="mx-auto mt-4 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">{t("pricing.subtitle", { dias })}</p>
          </Reveal>
          {/* Quem vê a landing não tem sessão (com sessão redireciona), daí "anonimo". */}
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
        <Reveal data-reveal="zoom" className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 rounded-2xl shadow-lg" />
          <h2 className="mt-8 max-w-[18ch] text-balance text-4xl font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-6xl">
            {t("ctaTitle")}
          </h2>
          <div data-final-cta className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
            <GrowCta>
              <Link
                href="/register"
                data-track="footer_register"
                className={cn(buttonVariants({ size: "lg" }), "pressable cta-sheen min-h-14 px-12 text-lg font-semibold")}
              >
                {t("hero2.cta")}
              </Link>
            </GrowCta>
            <Link
              href="/stock/AAPL"
              data-track="footer_peek"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-14 px-9 text-lg")}
            >
              {t("peekCta")}
            </Link>
          </div>
          <p className="mt-5 text-xs text-muted-foreground/80">{t("hero2.priceNote", { preco: precoTexto(PLANOS.pro.preco), dias })}</p>
        </Reveal>
      </section>
    </div>
  );
}
