import { Link } from "@/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Reveal } from "@/components/fx/Reveal";
import { HeroHorizon } from "@/components/marketing/HeroHorizon";
import { GrowCta } from "@/components/marketing/GrowCta";
import { TeamSignature } from "@/components/marketing/TeamSignature";
import { ShowcaseReel, type ReelChapter } from "@/components/marketing/showcase/ShowcaseReel";
import { ShowcaseGallery } from "@/components/marketing/showcase/ShowcaseGallery";
import { ReelEndCard } from "@/components/marketing/showcase/ReelEndCard";
import {
  DESKTOP_CHAPTERS,
  DESKTOP_DURATIONS,
  MOBILE_CHAPTERS,
  REEL_MEDIA,
  SHOT_KEYS,
  buildGalleryItem,
} from "@/components/marketing/showcase/data";
import { cn } from "@/lib/utils";
import { PLANOS, precoTexto } from "@/lib/planos";
import { LEGAL } from "@/lib/legal/config";
import { PricingCards } from "../pricing/PricingCards";
import { FAQ_IDS, FaqList, LandingJsonLd, TEAM, heroDelay, heroLead, heroWords } from "./shared";

/**
 * Versão C (27/10/2026): igual à A, só muda a forma de mostrar o produto.
 *   - hero: o vídeo real com capítulos (saltar para o que interessa), a tocar
 *     uma vez e a acabar num cartão final com outra empresa sem conta;
 *   - "a plataforma por dentro": recortes legíveis dos prints com marcas
 *     numeradas, em vez do print inteiro a 0,4x (carrossel no telemóvel).
 * Media em public/media/c (gerados por scripts/media/landing-c.mjs).
 * Texto novo em marketing.landingC.*; o resto reutiliza o da A.
 */
export async function LandingC() {
  const [t, tc, locale] = await Promise.all([
    getTranslations("marketing"),
    getTranslations("marketing.landingC"),
    getLocale(),
  ]);
  // Dias grátis do plano com comunidade (lib/planos.ts, igual ao trial da Whop).
  const dias = PLANOS.comunidade.diasGratis ?? 0;
  const faq = FAQ_IDS.map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`, { dias }) }));
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const sizeLabel = (mb: number) => tc("reel.videoSize", { mb: nf.format(mb) });

  const chapter = (
    c: { key: string; start: number; end: number; seekTo: number },
    i: number,
    total: number,
    source: number,
    duration: number,
  ): ReelChapter => {
    const label = tc(`reel.chapters.${c.key}.label`);
    return {
      key: c.key,
      label,
      caption: tc(`reel.chapters.${c.key}.caption`),
      aria: tc("reel.chapterAria", { n: i + 1, total, label }),
      source,
      start: c.start,
      end: c.end,
      seekTo: c.seekTo,
      weight: Math.min(c.end, duration) - c.start,
    };
  };

  const galleryItems = SHOT_KEYS.map((k, i) =>
    buildGalleryItem(
      k,
      { index: i, total: SHOT_KEYS.length },
      { label: t(`inside.items.${k}.label`), caption: t(`inside.items.${k}.caption`), alt: t(`inside.items.${k}.alt`) },
      tc,
    ),
  );

  return (
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />

      {/* ── 1 · Topo: igual à A, com o vídeo em capítulos ────────────── */}
      <section data-backdrop="paper" className="relative isolate px-5 pt-10 md:px-8 md:pt-20">
        <div className="hero-aurora" aria-hidden />
        <HeroHorizon />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
          <h1 className="max-w-[22ch] text-balance text-[2.1rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl">
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
          <ShowcaseReel
            desktop={{
              sources: [
                {
                  ...REEL_MEDIA.terminal,
                  alt: t("hero2.altCompany"),
                  address: "thebullvalue.com/stock/MSFT",
                  sizeLabel: sizeLabel(REEL_MEDIA.terminal.mb),
                },
                {
                  ...REEL_MEDIA.tour,
                  alt: t("hero2.altDcf"),
                  address: "thebullvalue.com/dcf",
                  sizeLabel: sizeLabel(REEL_MEDIA.tour.mb),
                },
              ],
              chapters: DESKTOP_CHAPTERS.map((c, i) =>
                chapter(c, i, DESKTOP_CHAPTERS.length, c.source, DESKTOP_DURATIONS[c.source]),
              ),
              groups: [
                { label: t("hero2.tabCompany"), from: 0, to: 3 },
                { label: t("hero2.tabDcf"), from: 4, to: 5 },
              ],
            }}
            mobile={{
              sources: [{ ...REEL_MEDIA.mobile, alt: t("hero2.altCompany"), sizeLabel: sizeLabel(REEL_MEDIA.mobile.mb) }],
              chapters: MOBILE_CHAPTERS.map((c, i) => chapter(c, i, MOBILE_CHAPTERS.length, 0, 28.17)),
            }}
            labels={{
              chapters: tc("reel.chaptersLabel"),
              pause: tc("reel.pause"),
              play: tc("reel.play"),
              openPage: tc("reel.openPage"),
              openPageAria: tc("reel.openPageAria"),
              startPlay: tc("reel.startPlay"),
              replay: tc("reel.replay"),
            }}
            endCard={
              <ReelEndCard
                title={tc("reel.end.title")}
                lead={tc("reel.end.lead")}
                tickers={[{ ticker: "AAPL", aria: tc("reel.end.tickerAria", { ticker: "AAPL" }) }]}
                cta={t("hero2.cta")}
              />
            }
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

      {/* ── 3 · A plataforma por dentro: recortes legíveis ─────────── */}
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
            <ShowcaseGallery
              items={galleryItems}
              labels={{
                seeFull: tc("gallery.seeFull"),
                carousel: tc("gallery.carouselLabel"),
                carouselRole: tc("gallery.carouselRole"),
                slideRole: tc("gallery.slideRole"),
                swipeHint: tc("gallery.swipeHint"),
                marksTitle: tc("gallery.marksTitle"),
                lightbox: {
                  titles: galleryItems.map((x) => tc("lightbox.title", { label: x.label })),
                  counters: galleryItems.map((x) => x.counter),
                  close: tc("lightbox.close"),
                  prev: tc("lightbox.prev"),
                  next: tc("lightbox.next"),
                  fit: tc("lightbox.fit"),
                  actual: tc("lightbox.actual"),
                  hintTouch: tc("lightbox.hintTouch"),
                },
              }}
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
