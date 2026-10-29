import Image from "next/image";
import { Link } from "@/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Check, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Reveal } from "@/components/fx/Reveal";
import { TeamSignature } from "@/components/marketing/TeamSignature";
import { ShowcaseReel, type ReelChapter } from "@/components/marketing/showcase/ShowcaseReel";
import { ReelEndCard } from "@/components/marketing/showcase/ReelEndCard";
import {
  DESKTOP_CHAPTERS,
  DESKTOP_DURATIONS,
  MOBILE_CHAPTERS,
  REEL_MEDIA,
} from "@/components/marketing/showcase/data";
import { cn } from "@/lib/utils";
import { PLANOS, precoTexto } from "@/lib/planos";
import { LEGAL } from "@/lib/legal/config";
import { PricingCards } from "../pricing/PricingCards";
import { FAQ_IDS, FaqList, LandingJsonLd, TEAM, heroDelay, heroWords } from "./shared";

/**
 * Versão H — "Feito pela Bullocracy": a landing para quem chega do canal.
 * Primeiro quem fez e porquê (a equipa, com as funções de marketing.about),
 * depois a ferramenta que usamos nos vídeos (o mesmo reel da C), os três
 * trabalhos, o que isto NÃO é, planos, FAQ e CTA final.
 * Texto novo em marketing.landingH.* (messages/_landing/h.*.json).
 */
const JOBS = ["read", "value", "ask"] as const;
const NOTS = ["advice", "tips", "lockin"] as const;

export async function LandingH() {
  const [t, th, tc, locale] = await Promise.all([
    getTranslations("marketing"),
    getTranslations("marketing.landingH"),
    getTranslations("marketing.landingC"),
    getLocale(),
  ]);
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

  const titleLead = th("hero.titleLead");

  return (
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />

      {/* ── 1 · Topo: quem fez e porquê ─────────────────────────────── */}
      <section data-backdrop="paper" className="relative isolate px-5 pb-12 pt-10 md:px-8 md:pb-20 md:pt-20">
        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className="hero-in text-xs font-semibold uppercase tracking-[0.18em] text-primary" style={heroDelay(0)}>
            {th("hero.eyebrow")}
          </p>
          <h1 className="mt-4 max-w-[20ch] text-balance text-[2.1rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-6xl md:text-7xl">
            <span className="sr-only">
              {titleLead} {th("hero.titleAccent")}
            </span>
            {heroWords(titleLead, 0)}{" "}
            {heroWords(th("hero.titleAccent"), titleLead.split(" ").length, "font-heading font-bold italic text-primary")}
          </h1>
          <p
            className="hero-in mt-5 max-w-[58ch] text-[15px] leading-relaxed text-muted-foreground sm:text-lg"
            style={heroDelay(0.18)}
          >
            {th("hero.subtitle")}
          </p>
          <div
            data-hero-cta
            className="hero-in mt-7 flex flex-row flex-wrap items-center justify-center gap-2.5 sm:gap-3"
            style={heroDelay(0.28)}
          >
            <Link
              href="/register"
              data-track="hero_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 px-6 text-base font-semibold sm:px-8")}
            >
              {t("hero2.cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="hero_demo"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-12 px-5 text-base sm:px-7")}
            >
              {th("hero.peek")}
            </Link>
          </div>
          <p className="hero-in mt-3 text-xs text-muted-foreground" style={heroDelay(0.34)}>
            {priceNote}
          </p>
          <div className="hero-in mt-8" style={heroDelay(0.4)}>
            <TeamSignature
              faces={TEAM}
              label={th("hero.signature")}
              className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/50 py-1.5 pl-1.5 pr-4 text-sm"
            />
          </div>
        </div>
      </section>

      {/* ── 2 · A equipa ─────────────────────────────────────────────── */}
      <section className="relative isolate border-y border-border/50 bg-card/30">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1fr_1.2fr] md:px-8 md:py-24">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{th("team.eyebrow")}</p>
            <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {th("team.title")} <span className="font-heading font-bold italic text-primary">{th("team.titleAccent")}</span>
            </h2>
            <p className="mt-5 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">{t("about.p1")}</p>
            <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">{t("about.p2")}</p>
            <p className="mt-6 border-l-2 border-primary pl-4 text-[15px] font-medium leading-relaxed">{th("team.note")}</p>
          </Reveal>
          <Reveal>
            <ul className="grid gap-3">
              {TEAM.map((m) => (
                <li key={m.name} className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/70 p-4">
                  {m.image ? (
                    <Image
                      src={m.image}
                      alt={m.name}
                      width={64}
                      height={64}
                      className="h-16 w-16 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
                      {m.initials}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-base font-bold">{m.name}</div>
                    <div className="text-sm text-muted-foreground">{t(`about.team.${m.roleKey}`)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── 3 · A ferramenta dos vídeos ─────────────────────────────── */}
      <section data-backdrop="grid" className="relative isolate">
        <div className="relative mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-10 max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{th("tool.eyebrow")}</p>
            <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {th("tool.title")} <span className="font-heading font-bold italic text-primary">{th("tool.titleAccent")}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[58ch] text-lg leading-relaxed text-muted-foreground">{th("tool.subtitle")}</p>
          </Reveal>
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

      {/* ── 4 · Os três trabalhos + o que isto não é ────────────────── */}
      <section className="relative isolate">
        <div className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-10 max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {th("jobs.title")} <span className="font-heading font-bold italic text-primary">{th("jobs.titleAccent")}</span>
            </h2>
          </Reveal>
          <ol className="grid gap-4 md:grid-cols-3">
            {JOBS.map((k, i) => (
              <li key={k}>
                <Reveal className="h-full rounded-2xl border border-border/60 bg-card/60 p-6">
                  <div className="nums font-heading text-3xl font-bold italic text-primary">0{i + 1}</div>
                  <h3 className="mt-3 text-lg font-bold leading-snug">{th(`jobs.items.${k}.title`)}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{th(`jobs.items.${k}.text`)}</p>
                </Reveal>
              </li>
            ))}
          </ol>
          <Reveal className="mx-auto mt-12 max-w-2xl rounded-2xl border border-border/60 p-6">
            <h3 className="text-lg font-bold">{th("not.title")}</h3>
            <ul className="mt-4 space-y-3">
              {NOTS.map((k) => (
                <li key={k} className="flex items-start gap-3 text-[15px] leading-relaxed">
                  {k === "lockin" ? (
                    <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <X className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span>{th(`not.items.${k}`)}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── 5 · Planos ──────────────────────────────────────────────── */}
      <section id="planos" data-backdrop="rings" data-hide-floating className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">{t("pricing.title")}</h2>
            <p className="mx-auto mt-4 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">
              {t("pricing.subtitle", { dias })}
            </p>
          </Reveal>
          <PricingCards supportEmail={LEGAL.email} estado="anonimo" />
          <p className="mx-auto mt-8 max-w-[62ch] text-center text-sm text-muted-foreground">{th("pricing.facts")}</p>
        </div>
      </section>

      {/* ── 6 · FAQ ─────────────────────────────────────────────────── */}
      <section data-backdrop="paper-grid" className="relative isolate">
        <div className="relative mx-auto max-w-2xl px-6 py-16 md:px-8 md:py-24">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("faq.title")}</h2>
          </Reveal>
          <FaqList items={faq} />
        </div>
      </section>

      {/* ── 7 · CTA final ───────────────────────────────────────────── */}
      <section data-backdrop="closing" data-hide-floating className="relative isolate px-6 py-24 md:px-8 md:py-32">
        <Reveal className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 rounded-2xl shadow-lg" />
          <h2 className="mt-8 max-w-[22ch] text-balance text-3xl font-extrabold leading-[1.06] tracking-[-0.035em] sm:text-5xl">
            {th("final.title")}{" "}
            <span className="font-heading font-bold italic text-primary">{th("final.titleAccent")}</span>
          </h2>
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
              {th("hero.peek")}
            </Link>
          </div>
          <p className="mt-5 text-xs text-muted-foreground/80">{priceNote}</p>
        </Reveal>
      </section>
    </div>
  );
}
