import type { CSSProperties } from "react";
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
 * Versão D: "editorial". Lê-se como uma publicação financeira calma: título
 * serifado grande, secções numeradas (01–04) com filetes finos, sem brilhos
 * nem loops. Uma só grelha de 12 colunas a partir de lg: etiqueta da secção
 * nas colunas 1–4, título e conteúdo nas 5–12 (a galeria ocupa as 12 porque
 * já tem a mesma divisão por dentro). Abaixo de lg tudo empilha, para o título
 * e os cartões não ficarem espremidos em tablet. Só tokens de tema
 * (background/foreground/border/primary), por isso o modo escuro sai sozinho.
 * Texto próprio em marketing.landingD.* (messages/pt.json e en.json).
 */

const SECTION = "relative isolate px-4 py-16 sm:px-6 md:px-8 md:py-24";
const GRID = "mx-auto grid max-w-6xl gap-6 lg:grid-cols-12 lg:gap-10";
const H2 = "text-balance font-heading text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl";
const LEAD = "mt-4 max-w-[60ch] text-base leading-relaxed text-muted-foreground sm:text-lg";
/** Ligação de texto (a segunda ação de cada bloco): sublinhado discreto, 44px de alvo. */
const TEXT_LINK =
  "inline-flex min-h-11 items-center font-medium underline decoration-foreground/30 underline-offset-[5px] transition-colors hover:decoration-foreground";

/** Cabeçalho de secção editorial: filete, número e etiqueta. */
function SectionHead({ n, eyebrow, id }: { n: string; eyebrow: string; id?: string }) {
  // Sem título próprio (manifesto), a etiqueta é o h2 da secção.
  const Label = id ? "h2" : "p";
  return (
    <div className="flex items-baseline gap-3 border-t border-foreground/80 pt-3">
      <span aria-hidden className="nums font-heading text-base italic text-primary">
        {n}
      </span>
      <Label id={id} className="text-[13px] font-medium text-muted-foreground sm:text-sm">
        {eyebrow}
      </Label>
    </div>
  );
}

/** Botão principal + ligação "ver a Apple": o mesmo par no topo e no fecho. */
function CtaPair({
  kind,
  cta,
  peek,
  className,
  style,
}: {
  kind: "hero" | "final";
  cta: string;
  peek: string;
  className?: string;
  style?: CSSProperties;
}) {
  const hero = kind === "hero";
  return (
    <div
      data-hero-cta={hero ? "" : undefined}
      data-final-cta={hero ? undefined : ""}
      className={cn("flex flex-wrap items-center gap-x-6 gap-y-1", className)}
      style={style}
    >
      <Link
        href="/register"
        data-track={hero ? "hero_register" : "footer_register"}
        className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 px-6 text-base font-semibold")}
      >
        {cta}
        <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
      </Link>
      <Link href="/stock/AAPL" data-track={hero ? "hero_demo" : "footer_peek"} className={cn(TEXT_LINK, "text-[15px]")}>
        {peek}
      </Link>
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

  // Ficha técnica do topo: três números com a mesma forma (valor + legenda).
  // Os três cenários são os da DCF simples (Bear, Base e Bull).
  const facts = [
    { value: "500", label: t("hero2.proofCompanies") },
    { value: "10", label: t("hero2.proofYears") },
    { value: "3", label: td("factScenarios") },
  ];

  return (
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />

      {/* ── Topo: título serifado à esquerda, entrada + CTA à direita ── */}
      <section
        data-backdrop="paper"
        aria-labelledby="d-hero-title"
        className="relative isolate px-4 pt-10 sm:px-6 md:px-8 md:pt-20"
      >
        <div className="relative mx-auto max-w-6xl">
          <p
            className="hero-in flex items-center gap-3 text-[13px] font-medium text-muted-foreground sm:text-sm"
            style={heroDelay(0)}
          >
            <span aria-hidden className="h-px w-8 bg-primary" />
            {td("kicker")}
          </p>
          <div className="mt-6 grid gap-8 md:mt-10 lg:grid-cols-12 lg:gap-10">
            <h1
              id="d-hero-title"
              className="hero-in text-balance font-heading text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:col-span-8 xl:text-7xl"
              style={heroDelay(0.08)}
            >
              {td("titleLead")} <span className="italic text-primary">{td("titleAccent")}</span>
            </h1>
            <div className="max-w-xl lg:col-span-4 lg:max-w-none lg:border-l lg:border-border lg:pl-8">
              <p className="hero-in text-base leading-relaxed text-muted-foreground sm:text-lg" style={heroDelay(0.18)}>
                {td("lead")}
              </p>
              <CtaPair kind="hero" cta={t("hero2.cta")} peek={td("peek")} className="hero-in mt-6" style={heroDelay(0.26)} />
              <p className="hero-in mt-2 text-[13px] leading-relaxed text-muted-foreground" style={heroDelay(0.32)}>
                {priceNote}
              </p>
            </div>
          </div>

          {/* Ficha técnica, entre filetes, como a de um artigo. */}
          <div className="hero-in mt-10 grid grid-cols-3 border-y border-border md:mt-14" style={heroDelay(0.36)}>
            {facts.map((f) => (
              <p key={f.value} className="border-r border-border py-4 pl-3 pr-2 first:pl-0 last:border-r-0 sm:pl-6 sm:pr-4">
                <span className="nums block font-heading text-2xl font-semibold sm:text-3xl">{f.value}</span>{" "}
                <span className="mt-1 block text-[13px] leading-snug text-muted-foreground sm:text-sm">{f.label}</span>
              </p>
            ))}
          </div>
        </div>

        <figure className="hero-in relative mx-auto mt-8 max-w-6xl md:mt-12" style={heroDelay(0.42)}>
          {/* Legenda por cima: por baixo o vídeo já tem a legenda de cada capítulo. */}
          <figcaption className="mb-4 text-center text-[13px] italic leading-relaxed text-muted-foreground sm:text-sm md:border-l-2 md:border-primary md:pl-3 md:text-left">
            {td("figure")}
          </figcaption>
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
        </figure>
      </section>

      {/* ── 01 · A plataforma ───────────────────────────────────────── */}
      <section aria-labelledby="d-inside-title" className={SECTION}>
        <div className="mx-auto max-w-6xl">
          <Reveal className={GRID}>
            <div className="lg:col-span-4">
              <SectionHead n={td("inside.n")} eyebrow={td("inside.eyebrow")} />
            </div>
            <div className="lg:col-span-8">
              <h2 id="d-inside-title" className={H2}>
                {td("inside.title")} <span className="italic text-primary">{td("inside.titleAccent")}</span>
              </h2>
              <p className={LEAD}>{td("inside.lead")}</p>
            </div>
          </Reveal>
          {/* A galeria ocupa as 12 colunas: a lista fica nas 1–4 e o recorte nas 5–12. */}
          <Reveal className="mt-10 min-w-0 lg:mt-14">
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

      {/* ── 02 · Porque existimos ───────────────────────────────────── */}
      <section aria-labelledby="d-manifesto-title" className={cn(SECTION, "border-y border-border bg-card/40")}>
        <div className={GRID}>
          <Reveal className="lg:col-span-4">
            <SectionHead n={td("manifesto.n")} eyebrow={td("manifesto.eyebrow")} id="d-manifesto-title" />
          </Reveal>
          <Reveal className="lg:col-span-8">
            {/* Uma frase nossa, não uma citação: sem aspas nem autor inventado. */}
            <p className="text-balance font-heading text-3xl font-medium italic leading-[1.15] tracking-[-0.01em] sm:text-4xl lg:text-5xl">
              {td("manifesto.quote")}
            </p>
            <div className="mt-8 grid gap-6 text-base leading-relaxed text-muted-foreground sm:grid-cols-2 lg:mt-10">
              <p>{td("manifesto.p1")}</p>
              <p>{td("manifesto.p2")}</p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 lg:mt-10">
              <TeamSignature faces={TEAM} label={t("hero2.proofTeam")} className="inline-flex items-center gap-3" />
              <Link href="/about" data-track="manifesto_team" className={cn(TEXT_LINK, "text-sm")}>
                {td("manifesto.teamLink")}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 03 · Planos ─────────────────────────────────────────────── */}
      <section id="planos" data-hide-floating aria-labelledby="d-pricing-title" className={SECTION}>
        <div className="mx-auto max-w-6xl">
          <Reveal className={GRID}>
            <div className="lg:col-span-4">
              <SectionHead n={td("pricing.n")} eyebrow={td("pricing.eyebrow")} />
            </div>
            <div className="lg:col-span-8">
              <h2 id="d-pricing-title" className={H2}>
                {t("pricing.title")}
              </h2>
              <p className={LEAD}>{t("pricing.subtitle", { dias })}</p>
            </div>
          </Reveal>
          {/* Em xl os cartões alinham com o título (colunas 5–12); abaixo disso
              precisam da largura toda e encostam à esquerda, como a etiqueta. */}
          <div className="mt-10 grid lg:mt-14 xl:grid-cols-12 xl:gap-10">
            <div className="min-w-0 max-w-4xl xl:col-span-8 xl:col-start-5">
              <PricingCards supportEmail={LEGAL.email} estado="anonimo" />
            </div>
          </div>
        </div>
      </section>

      {/* ── 04 · Perguntas frequentes ───────────────────────────────── */}
      <section aria-labelledby="d-faq-title" className={cn(SECTION, "border-t border-border")}>
        <div className={GRID}>
          <Reveal className="lg:col-span-4">
            <SectionHead n={td("faq.n")} eyebrow={td("faq.eyebrow")} />
          </Reveal>
          <div className="min-w-0 lg:col-span-8">
            <Reveal>
              <h2 id="d-faq-title" className={H2}>
                {td("faq.title")}
              </h2>
            </Reveal>
            <FaqList items={faq} className="mt-8 space-y-3 lg:mt-10" />
          </div>
        </div>
      </section>

      {/* ── Fecho: o mesmo par de ações do topo ─────────────────────── */}
      <section
        data-hide-floating
        aria-labelledby="d-final-title"
        className="relative isolate border-t border-foreground/80 px-4 py-20 sm:px-6 md:px-8 md:py-28"
      >
        <Reveal className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-12 lg:items-end lg:gap-10">
          <h2
            id="d-final-title"
            className="text-balance font-heading text-4xl font-semibold leading-[1.04] tracking-[-0.02em] sm:text-6xl lg:col-span-8"
          >
            {td("closing.titleLead")} <span className="italic text-primary">{td("closing.titleAccent")}</span>
          </h2>
          <div className="lg:col-span-4 lg:border-l lg:border-border lg:pl-8">
            <CtaPair kind="final" cta={t("hero2.cta")} peek={td("peek")} />
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{priceNote}</p>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
