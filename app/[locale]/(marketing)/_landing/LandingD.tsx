import { Link } from "@/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/fx/Reveal";
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
import { FAQ_IDS, FaqList, LandingJsonLd, TEAM, heroDelay } from "./shared";

/**
 * Versão D (29/10/2026): "editorial". Lê-se como uma publicação financeira
 * calma: título serifado grande, grelha assimétrica de 12 colunas, secções
 * numeradas (01–04) com filetes finos, sem brilhos nem loops. Pensada para
 * ficar bem em modo escuro (só tokens: background/foreground/border/primary).
 * Produto: o mesmo vídeo em capítulos e os recortes da C.
 * Texto novo em marketing.landingD.* (messages/_landing/d.*.json).
 */

/** Cabeçalho de secção editorial: número, filete e etiqueta. */
function SectionHead({ n, eyebrow }: { n: string; eyebrow: string }) {
  return (
    <div className="flex items-baseline gap-4 border-t border-foreground/80 pt-3">
      <span className="nums font-heading text-sm italic text-primary">{n}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</span>
    </div>
  );
}

export async function LandingD() {
  const [t, tc, td, locale] = await Promise.all([
    getTranslations("marketing"),
    getTranslations("marketing.landingC"),
    getTranslations("marketing.landingD"),
    getLocale(),
  ]);
  // Dias grátis do plano com comunidade (lib/planos.ts, igual ao trial da Whop).
  const dias = PLANOS.comunidade.diasGratis ?? 0;
  const faq = FAQ_IDS.map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`, { dias }) }));
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const sizeLabel = (mb: number) => tc("reel.videoSize", { mb: nf.format(mb) });
  const priceNote = t("hero2.priceNote", { preco: precoTexto(PLANOS.pro.preco), dias });

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

  const facts = [
    { value: "500", label: t("hero2.proofCompanies") },
    { value: "10", label: t("hero2.proofYears") },
  ];

  return (
    // "dark" no topo: escuro por defeito, mesmo com o site em claro (os tokens
    // de .dark aplicam-se à subárvore; ThemedImg usa dark:, segue o fundo).
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />

      {/* ── Topo: título serifado à esquerda, entrada + CTA à direita ── */}
      <section data-backdrop="paper" className="relative isolate px-4 pt-10 sm:px-6 md:px-8 md:pt-20">
        <div className="relative mx-auto max-w-6xl">
          <p className="hero-in flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground" style={heroDelay(0)}>
            <span aria-hidden className="h-px w-8 bg-primary" />
            {td("kicker")}
          </p>
          <div className="mt-6 grid gap-8 md:mt-10 md:grid-cols-12 md:gap-10">
            <h1
              className="hero-in text-balance font-heading text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-6xl md:col-span-8 md:text-7xl"
              style={heroDelay(0.08)}
            >
              {td("titleLead")} <span className="italic text-primary">{td("titleAccent")}</span>
            </h1>
            <div className="flex flex-col justify-end md:col-span-4 md:border-l md:border-border md:pl-8">
              <p className="hero-in text-[15px] leading-relaxed text-muted-foreground sm:text-lg" style={heroDelay(0.18)}>
                {td("lead")}
              </p>
              <div data-hero-cta className="hero-in mt-6 flex flex-row flex-wrap items-center gap-2.5" style={heroDelay(0.26)}>
                <Link
                  href="/register"
                  data-track="hero_register"
                  className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 px-6 text-base font-semibold")}
                >
                  {t("hero2.cta")}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
                <Link
                  href="/stock/AAPL"
                  data-track="hero_demo"
                  className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "pressable min-h-12 px-3 text-base underline-offset-4 hover:underline")}
                >
                  {td("peek")}
                </Link>
              </div>
              <p className="hero-in mt-3 text-xs text-muted-foreground" style={heroDelay(0.32)}>
                {priceNote}
              </p>
            </div>
          </div>

          {/* Faixa de factos, entre filetes, como a ficha técnica de um artigo. */}
          <div className="hero-in mt-10 grid grid-cols-3 border-y border-border md:mt-14" style={heroDelay(0.36)}>
            {facts.map((f) => (
              <p key={f.value} className="border-r border-border px-2 py-4 sm:px-4">
                <span className="nums block font-heading text-2xl font-semibold sm:text-3xl">{f.value}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground sm:text-sm">{f.label}</span>
              </p>
            ))}
            <p className="flex items-center px-2 py-4 font-heading text-sm italic leading-snug text-primary sm:px-4 sm:text-base">
              {t("hero2.proofLanguage")}
            </p>
          </div>
        </div>

        <figure className="hero-in relative mx-auto mt-8 max-w-6xl md:mt-12" style={heroDelay(0.42)}>
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
          <figcaption className="mt-3 border-l-2 border-primary pl-3 text-xs italic leading-relaxed text-muted-foreground sm:text-sm">
            {td("figure")}
          </figcaption>
        </figure>
      </section>

      {/* ── 01 · O que vês numa empresa ─────────────────────────────── */}
      <section className="relative isolate px-4 py-16 sm:px-6 md:px-8 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-12">
          <Reveal className="md:col-span-4">
            <div className="md:sticky md:top-24">
              <SectionHead n={td("inside.n")} eyebrow={td("inside.eyebrow")} />
              <h2 className="mt-6 text-balance font-heading text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
                {td("inside.title")} <span className="italic text-primary">{td("inside.titleAccent")}</span>
              </h2>
              <p className="mt-5 max-w-[42ch] leading-relaxed text-muted-foreground">{td("inside.lead")}</p>
            </div>
          </Reveal>
          <Reveal className="min-w-0 md:col-span-8">
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

      {/* ── 02 · Manifesto ──────────────────────────────────────────── */}
      <section className="relative isolate border-y border-border bg-card/40 px-4 py-16 sm:px-6 md:px-8 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-12">
          <Reveal className="md:col-span-4">
            <SectionHead n={td("manifesto.n")} eyebrow={td("manifesto.eyebrow")} />
          </Reveal>
          <Reveal className="md:col-span-8">
            <blockquote className="text-balance font-heading text-3xl font-medium italic leading-[1.15] tracking-[-0.01em] sm:text-4xl md:text-5xl">
              <span aria-hidden className="text-primary">“</span>
              {td("manifesto.quote")}
              <span aria-hidden className="text-primary">”</span>
            </blockquote>
            <div className="mt-10 grid gap-6 text-[15px] leading-relaxed text-muted-foreground sm:grid-cols-2 sm:text-base">
              <p>{td("manifesto.p1")}</p>
              <p>{td("manifesto.p2")}</p>
            </div>
            <TeamSignature
              faces={TEAM}
              label={t("hero2.proofTeam")}
              className="mt-10 inline-flex items-center gap-3 border-t border-border pt-4"
            />
          </Reveal>
        </div>
      </section>

      {/* ── 03 · Planos ─────────────────────────────────────────────── */}
      <section id="planos" data-hide-floating className="relative isolate px-4 py-16 sm:px-6 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="grid gap-6 md:grid-cols-12 md:gap-10">
            <div className="md:col-span-4">
              <SectionHead n={td("pricing.n")} eyebrow={td("pricing.eyebrow")} />
            </div>
            <div className="md:col-span-8">
              <h2 className="text-balance font-heading text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
                {t("pricing.title")}
              </h2>
              <p className="mt-4 max-w-[62ch] leading-relaxed text-muted-foreground sm:text-lg">{t("pricing.subtitle", { dias })}</p>
            </div>
          </Reveal>
          <div className="mt-12">
            <PricingCards supportEmail={LEGAL.email} estado="anonimo" />
          </div>
        </div>
      </section>

      {/* ── 04 · FAQ ────────────────────────────────────────────────── */}
      <section className="relative isolate border-t border-border px-4 py-16 sm:px-6 md:px-8 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-12">
          <Reveal className="md:col-span-4">
            <SectionHead n={td("faq.n")} eyebrow={td("faq.eyebrow")} />
            <h2 className="mt-6 text-balance font-heading text-4xl font-semibold leading-[1.05] tracking-[-0.02em]">
              {t("faq.title")}
            </h2>
          </Reveal>
          <div className="min-w-0 md:col-span-8">
            <FaqList items={faq} className="space-y-3" />
          </div>
        </div>
      </section>

      {/* ── Fecho ───────────────────────────────────────────────────── */}
      <section data-hide-floating className="relative isolate border-t border-foreground/80 px-4 py-20 sm:px-6 md:px-8 md:py-32">
        <Reveal className="mx-auto grid max-w-6xl gap-8 md:grid-cols-12 md:items-end">
          <h2 className="text-balance font-heading text-4xl font-semibold leading-[1.04] tracking-[-0.02em] sm:text-6xl md:col-span-8">
            {td("closing.titleLead")} <span className="italic text-primary">{td("closing.titleAccent")}</span>
          </h2>
          <div className="md:col-span-4">
            <div data-final-cta className="flex flex-row flex-wrap items-center gap-2.5">
              <Link
                href="/register"
                data-track="footer_register"
                className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 px-6 text-base font-semibold")}
              >
                {t("hero2.cta")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
              <Link
                href="/stock/AAPL"
                data-track="footer_peek"
                className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "pressable min-h-12 px-3 text-base underline-offset-4 hover:underline")}
              >
                {td("peek")}
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{priceNote}</p>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
