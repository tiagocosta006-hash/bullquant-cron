import { Link } from "@/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Columns3,
  Compass,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Reveal } from "@/components/fx/Reveal";
import { TeamSignature } from "@/components/marketing/TeamSignature";
import { ShowcaseReel, type ReelChapter } from "@/components/marketing/showcase/ShowcaseReel";
import { ReelEndCard } from "@/components/marketing/showcase/ReelEndCard";
import { DESKTOP_CHAPTERS, MOBILE_CHAPTERS, REEL_MEDIA, buildGalleryItem, type ShotKey } from "@/components/marketing/showcase/data";
import { JobRow } from "@/components/marketing/landing-b/JobRow";
import { JobsZoomProvider } from "@/components/marketing/landing-b/JobsZoom";
import { FitCards } from "@/components/marketing/landing-b/FitCards";
import { BuyingFacts } from "@/components/marketing/landing-b/BuyingFacts";
import { cn } from "@/lib/utils";
import { PLANOS, precoTexto } from "@/lib/planos";
import { LEGAL } from "@/lib/legal/config";
import { PricingCards } from "../pricing/PricingCards";
import { FaqList, LandingJsonLd, TEAM, centimosPorDia, heroDelay, heroWords, type FaqItem } from "./shared";

const JOBS: ShotKey[] = ["fund", "dcf", "ai"];
const MORE: { key: string; icon: LucideIcon }[] = [
  { key: "fmva", icon: Table2 },
  { key: "cal", icon: CalendarDays },
  { key: "compare", icon: Columns3 },
  { key: "explore", icon: Compass },
  { key: "insider", icon: ArrowLeftRight },
  { key: "glossary", icon: BookOpen },
];

/**
 * Versão B (27/10/2026): a landing toda repensada à volta da pergunta de quem
 * compra uma ação, "quanto vale?". Sete secções:
 *   1. hero com o resultado (perceber quanto vale), CTA + preço e a saída
 *      (cancelar, 14 dias), e o vídeo em capítulos da versão C;
 *   2. prova verificável (500 empresas, 10 anos, os autores);
 *   3. três perguntas de compra, cada uma respondida por um ecrã real
 *      anotado, mais o resto do PRO numa lista;
 *   4. "é para ti / não é para ti" (iniciantes, não é aconselhamento);
 *   5. planos com o preço por dia, as condições e o que abre sem conta;
 *   6. FAQ (o mesmo array alimenta o JSON-LD);
 *   7. fecho que repete a promessa.
 * Só a Apple abre sem conta (middleware), por isso é o único /stock ligado.
 * Texto em marketing.landingB (+ landingC para o vídeo e as marcas).
 */
export async function LandingB() {
  const [t, tb, tc, locale] = await Promise.all([
    getTranslations("marketing"),
    getTranslations("marketing.landingB"),
    getTranslations("marketing.landingC"),
    getLocale(),
  ]);
  const preco = precoTexto(PLANOS.pro.preco, locale);
  const comunidade = precoTexto(PLANOS.comunidade.preco, locale);
  const dias = PLANOS.comunidade.diasGratis ?? 0;
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const bold = { b: (c: React.ReactNode) => <strong className="font-semibold text-foreground">{c}</strong> };

  const faq: FaqItem[] = [
    { q: tb("faq.free.q"), a: tb("faq.free.a", { dias }) },
    { q: t("faq.q6"), a: t("faq.a6") },
    { q: tb("faq.lang.q"), a: tb("faq.lang.a") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: tb("faq.plans.q"), a: tb("faq.plans.a", { preco, comunidade, dias }) },
    { q: t("faq.q7"), a: t("faq.a7") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q5"), a: t("faq.a5", { dias }) },
  ];

  const chapter = (c: { key: string; start: number; end: number; seekTo: number }, i: number, total: number, duration: number): ReelChapter => {
    const label = tc(`reel.chapters.${c.key}.label`);
    return {
      key: c.key,
      label,
      caption: tc(`reel.chapters.${c.key}.caption`),
      aria: tc("reel.chapterAria", { n: i + 1, total, label }),
      source: 0,
      start: c.start,
      end: c.end,
      seekTo: c.seekTo,
      weight: Math.min(c.end, duration) - c.start,
    };
  };
  const desktopChapters = DESKTOP_CHAPTERS.filter((c) => c.source === 0);

  const jobs = JOBS.map((k, i) =>
    buildGalleryItem(
      k,
      { index: i, total: JOBS.length },
      { label: tb(`jobs.items.${k}.label`), caption: tb(`jobs.items.${k}.title`), alt: tb(`jobs.items.${k}.alt`) },
      tc,
    ),
  );

  const peek = (track: string, className: string) => (
    <Link href="/stock/AAPL" data-track={track} className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable", className)}>
      {tb("hero.peek")}
    </Link>
  );

  return (
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />

      {/* ── 1 · Hero: o resultado, o preço, a saída e o produto ──────── */}
      <section data-backdrop="paper" aria-labelledby="b-hero-title" className="relative isolate px-4 pt-8 sm:px-5 md:px-8 md:pt-20">
        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className="glass hidden rounded-full px-3.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">{tb("hero.pill")}</p>
          <h1
            id="b-hero-title"
            className="mt-5 max-w-[18ch] text-balance text-[2.1rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl"
          >
            <span className="sr-only">
              {tb("hero.titleLead")} {tb("hero.titleAccent")} {tb("hero.titleTail")}
            </span>
            {heroWords(tb("hero.titleLead"), 0)}
            {heroWords(tb("hero.titleAccent"), tb("hero.titleLead").split(" ").length, "font-heading font-bold italic text-primary")}
            {heroWords(
              tb("hero.titleTail"),
              tb("hero.titleLead").split(" ").length + tb("hero.titleAccent").split(" ").length,
            )}
          </h1>
          <p className="hero-in mt-5 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground sm:text-lg" style={heroDelay(0.18)}>
            {tb("hero.subtitle")}
          </p>
          <div
            data-hero-cta
            className="hero-in mt-7 flex w-full flex-col items-stretch gap-2.5 sm:w-auto sm:flex-row sm:items-center sm:justify-center sm:gap-3"
            style={heroDelay(0.28)}
          >
            <Link
              href="/register"
              data-track="b_hero_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable cta-sheen min-h-12 w-full px-8 text-base font-semibold sm:w-auto")}
            >
              {t("hero2.cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
            {peek("b_hero_peek", "min-h-12 w-full px-7 text-base sm:w-auto")}
          </div>
          <p className="hero-in mt-3 max-w-[40ch] text-balance text-xs text-muted-foreground" style={heroDelay(0.34)}>
            {tb("hero.note", { preco, dias })}
          </p>
        </div>

        <div className="hero-in relative mx-auto mt-8 max-w-6xl md:mt-12" style={heroDelay(0.4)}>
          <ShowcaseReel
            trackPrefix="b_reel"
            desktop={{
              sources: [
                {
                  ...REEL_MEDIA.terminal,
                  alt: t("hero2.altCompany"),
                  address: "thebullvalue.com/stock/MSFT",
                  sizeLabel: tc("reel.videoSize", { mb: nf.format(REEL_MEDIA.terminal.mb) }),
                },
              ],
              chapters: desktopChapters.map((c, i) => chapter(c, i, desktopChapters.length, 27.73)),
              groups: [],
            }}
            mobile={{
              sources: [
                {
                  ...REEL_MEDIA.mobile,
                  alt: t("hero2.altCompany"),
                  sizeLabel: tc("reel.videoSize", { mb: nf.format(REEL_MEDIA.mobile.mb) }),
                },
              ],
              chapters: MOBILE_CHAPTERS.map((c, i) => chapter(c, i, MOBILE_CHAPTERS.length, 28.17)),
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
                track="b_reel_end"
                title={tb("reel.end.title")}
                lead={tb("reel.end.lead")}
                tickers={[{ ticker: "AAPL", aria: tb("reel.end.appleAria") }]}
                cta={t("hero2.cta")}
              />
            }
          />
        </div>
      </section>

      {/* ── 2 · Prova verificável ───────────────────────────────────── */}
      <section aria-label={tb("proof.aria")} className="relative isolate px-4 py-10 sm:px-6 md:px-8 md:py-14">
        <div className="mx-auto grid max-w-5xl grid-cols-2 items-center justify-items-center gap-y-5 text-center sm:flex sm:flex-wrap sm:justify-center sm:gap-x-10">
          <div>
            <div className="nums text-3xl font-extrabold tracking-tight">500</div>
            <div className="text-sm text-muted-foreground">{t("hero2.proofCompanies")}</div>
          </div>
          <div>
            <div className="nums text-3xl font-extrabold tracking-tight">10</div>
            <div className="text-sm text-muted-foreground">{t("hero2.proofYears")}</div>
          </div>
          <div className="col-span-2 text-sm font-semibold">{tb("proof.language")}</div>
          <Link
            href="/about"
            data-track="b_team_about"
            aria-label={tb("proof.teamAria")}
            className="col-span-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <TeamSignature
              faces={TEAM}
              label={t("hero2.proofTeam")}
              className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/50 py-1.5 pl-1.5 pr-4 transition-colors hover:border-primary/50"
            />
          </Link>
        </div>
      </section>

      {/* ── 3 · Três perguntas antes de comprar ─────────────────────── */}
      <section data-backdrop="grid" aria-labelledby="b-jobs-title" className="relative isolate">
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 md:px-8 md:py-24">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2 id="b-jobs-title" className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {tb("jobs.title")} <span className="font-heading font-bold italic text-primary">{tb("jobs.titleAccent")}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">{tb("jobs.subtitle")}</p>
          </Reveal>

          <JobsZoomProvider
            items={jobs}
            labels={{
              titles: jobs.map((x) => tc("lightbox.title", { label: x.label })),
              counters: jobs.map((x) => x.counter),
              close: tc("lightbox.close"),
              prev: tc("lightbox.prev"),
              next: tc("lightbox.next"),
              fit: tc("lightbox.fit"),
              actual: tc("lightbox.actual"),
              hintTouch: tc("lightbox.hintTouch"),
            }}
          >
            {jobs.map((x, i) => (
              <Reveal key={x.key} className="mt-16 md:mt-24">
                <JobRow
                  n={String(i + 1).padStart(2, "0")}
                  title={tb(`jobs.items.${x.key}.title`)}
                  body={tb.rich(`jobs.items.${x.key}.body`, bold)}
                  alt={x.alt}
                  seeFull={tb("jobs.seeFull")}
                  seeFullAria={tb("jobs.seeFullAria", { label: x.label })}
                  marksTitle={tc("gallery.marksTitle")}
                  index={i}
                  wide={{ src: x.wide, fade: x.fade.wide, marks: x.marksWide }}
                  square={{ src: x.square, fade: x.fade.square, marks: x.marksSquare }}
                  reverse={i === 1}
                  trackKey={x.key}
                />
              </Reveal>
            ))}
          </JobsZoomProvider>

          <Reveal className="glass mt-16 rounded-3xl p-5 sm:p-6 md:mt-20 md:p-8">
            <h3 className="text-lg font-bold">{tb("jobs.more.title")}</h3>
            <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {MORE.map(({ key, icon: Icon }) => (
                <li key={key} className="flex gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <strong className="block text-[15px]">{tb(`jobs.more.items.${key}.title`)}</strong>
                    <span className="text-sm text-muted-foreground">{tb(`jobs.more.items.${key}.body`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── 4 · É para ti? ──────────────────────────────────────────── */}
      <section aria-labelledby="b-fit-title" className="relative isolate px-4 py-16 sm:px-6 md:px-8 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 id="b-fit-title" className="text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
            {tb("fit.title")}
          </h2>
          <FitCards
            yesTitle={tb("fit.yesTitle")}
            yes={[tb("fit.y1"), tb("fit.y2"), tb("fit.y3"), tb("fit.y4")]}
            noTitle={tb("fit.noTitle")}
            no={[tb("fit.n1"), tb("fit.n2"), tb("fit.n3")]}
          />
        </div>
      </section>

      {/* ── 5 · Planos ──────────────────────────────────────────────── */}
      <section id="planos" data-backdrop="rings" data-hide-floating aria-labelledby="b-pricing-title" className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center">
            <h2 id="b-pricing-title" className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {tb("pricing.titleLead", { preco })}{" "}
              <span className="font-heading font-bold italic text-primary">
                {tb("pricing.titleAccent", { cents: centimosPorDia(PLANOS.pro.preco) })}
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">
              {tb("pricing.subtitle", { preco, comunidade, dias })}
            </p>
          </Reveal>
          <PricingCards supportEmail={LEGAL.email} estado="anonimo" />
          <BuyingFacts
            label={tb("pricing.factsLabel")}
            facts={(["cancel", "withdrawal", "vat"] as const).map((icon) => ({ icon, text: tb(`pricing.facts.${icon}`) }))}
            peekTitle={tb("pricing.peekTitle")}
            peekBody={tb("pricing.peekBody", { dias })}
            peekCta={tb("hero.peek")}
          />
        </div>
      </section>

      {/* ── 6 · FAQ ─────────────────────────────────────────────────── */}
      <section data-backdrop="paper-grid" aria-labelledby="b-faq-title" className="relative isolate">
        <div className="relative mx-auto max-w-2xl px-4 py-16 sm:px-6 md:px-8 md:py-24">
          <Reveal>
            <h2 id="b-faq-title" className="text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
              {tb("faq.title")}
            </h2>
          </Reveal>
          <FaqList items={faq} />
        </div>
      </section>

      {/* ── 7 · Fecho ───────────────────────────────────────────────── */}
      <section data-backdrop="closing" data-hide-floating aria-labelledby="b-final-title" className="relative isolate px-4 py-24 sm:px-6 md:px-8 md:py-28">
        <Reveal className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 rounded-2xl shadow-lg" />
          <h2
            id="b-final-title"
            className="mt-8 max-w-[20ch] text-balance text-[2.25rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-6xl"
          >
            {tb("final.titleLead")} <span className="font-heading font-bold italic text-primary">{tb("final.titleAccent")}</span>
          </h2>
          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/register"
              data-track="b_final_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable cta-sheen min-h-14 w-full px-10 text-lg font-semibold sm:w-auto")}
            >
              {t("hero2.cta")}
            </Link>
            {peek("b_final_peek", "min-h-14 w-full px-8 text-lg sm:w-auto")}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">{tb("hero.note", { preco, dias })}</p>
          <Link
            href="/about"
            data-track="b_team_about"
            className="group mt-8 inline-flex flex-col items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <TeamSignature faces={TEAM} label={tb("final.team")} className="inline-flex items-center gap-3" />
            <span className="text-sm underline-offset-4 group-hover:underline">{tb("final.teamLink")}</span>
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
