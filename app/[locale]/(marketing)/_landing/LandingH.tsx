import Image from "next/image";
import { Link } from "@/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, X } from "lucide-react";
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
 * Topo com o que é a BullValue e as caras de quem a fez; depois a equipa
 * (retratos + a história), a plataforma gravada tal como está (o mesmo reel
 * da C), para que serve e o que NÃO é, planos, FAQ e CTA final.
 * Texto próprio em marketing.landingH.* (messages/pt.json e en.json).
 */
const JOBS = ["read", "value", "ask"] as const;
const NOTS = ["advice", "tips", "broker"] as const;

/* Ritmo comum: a mesma margem lateral do header (20 px no telemóvel) e o
   mesmo eyebrow em todas as secções que o têm (13 px: nada abaixo disso). */
const GUTTER = "px-5 md:px-8";
const EYEBROW = "text-[13px] font-semibold uppercase tracking-[0.16em] text-primary";
const H2 = "text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl";
const ACCENT = "font-heading font-bold italic text-primary";

/* A nota de preço partilhada vem como "a · b · c". No telemóvel cada parte
   fica na sua linha (com maiúscula inicial) em vez de partir a meio de uma
   frase; a partir de sm volta a ser uma linha só, com os separadores. */
function PriceNote({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {text.split(" · ").map((part, i) => (
        <span key={part}>
          {i > 0 && <span className="hidden sm:inline"> · </span>}
          <span className="block first-letter:uppercase sm:inline">{part}</span>
        </span>
      ))}
    </p>
  );
}

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
  // "Rodrigo, Tiago e Alexandre": os primeiros nomes saem de TEAM, nunca de texto à mão.
  const teamNames = new Intl.ListFormat(locale, { type: "conjunction" }).format(TEAM.map((m) => m.name.split(" ")[0]));

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
  const titleAccent = th("hero.titleAccent");

  return (
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />

      {/* ── 1 · Topo: o que é e quem fez ────────────────────────────── */}
      <section data-backdrop="paper" className={cn("relative isolate pb-14 pt-10 md:pb-20 md:pt-20", GUTTER)}>
        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className={cn("hero-in", EYEBROW)} style={heroDelay(0)}>
            {th("hero.eyebrow")}
          </p>
          <h1 className="mt-4 max-w-[20ch] text-balance text-[2.1rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-6xl md:text-7xl">
            <span className="sr-only">
              {titleLead} {titleAccent}
            </span>
            {/* Sem {" "} entre as duas partes: o espaço entre palavras já vem do
                padding de .hero-clip, e um espaço a mais abria um buraco antes do itálico. */}
            {heroWords(titleLead, 0)}
            {heroWords(titleAccent, titleLead.split(" ").length, ACCENT)}
          </h1>
          <p
            className="hero-in mt-5 max-w-[56ch] text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-lg"
            style={heroDelay(0.18)}
          >
            {th("hero.subtitle")}
          </p>
          <div
            data-hero-cta
            className="hero-in mt-7 flex w-full max-w-sm flex-col gap-2.5 sm:w-auto sm:max-w-none sm:flex-row sm:justify-center sm:gap-3"
            style={heroDelay(0.28)}
          >
            <Link
              href="/register"
              data-track="hero_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 w-full px-8 text-base font-semibold sm:w-auto")}
            >
              {t("hero2.cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="hero_demo"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-12 w-full px-7 text-base sm:w-auto")}
            >
              {th("hero.peek")}
            </Link>
          </div>
          <div className="hero-in" style={heroDelay(0.34)}>
            <PriceNote text={priceNote} className="mt-4 text-[13px] leading-relaxed text-muted-foreground" />
          </div>
          {/* Assinatura: as caras e os nomes de quem fez. aria-hidden porque a
              secção seguinte diz o mesmo por extenso (nome e função de cada um). */}
          <div aria-hidden className="hero-in mt-8" style={heroDelay(0.4)}>
            <TeamSignature
              faces={TEAM}
              label={teamNames}
              className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/50 py-1.5 pl-1.5 pr-4"
            />
          </div>
        </div>
      </section>

      {/* ── 2 · A equipa: a história à esquerda, os retratos à direita ── */}
      <section className="relative isolate border-y border-border/50 bg-card/30">
        <div
          className={cn(
            "mx-auto grid max-w-6xl gap-10 py-16 md:py-24 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14",
            GUTTER,
          )}
        >
          <Reveal>
            <p className={EYEBROW}>{th("team.eyebrow")}</p>
            <h2 className={cn("mt-3", H2)}>
              {th("team.title")} <span className={ACCENT}>{th("team.titleAccent")}</span>
            </h2>
            <p className="mt-5 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">{th("team.p1")}</p>
            <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">{th("team.p2")}</p>
            <p className="mt-6 max-w-[56ch] border-l-2 border-primary pl-4 text-[15px] font-medium leading-relaxed sm:text-base">
              {th("team.note")}
            </p>
          </Reveal>
          <Reveal>
            {/* Telemóvel: linhas com a cara recortada (as fotos são de corpo até
                à cintura, por isso o zoom). A partir de sm: retratos 4:5 lado a lado. */}
            <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
              {TEAM.map((m) => (
                <li
                  key={m.name}
                  className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/70 p-3 sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:p-0"
                >
                  <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-secondary sm:aspect-[4/5] sm:h-auto sm:w-full sm:rounded-none">
                    {m.image ? (
                      <Image
                        src={m.image}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 240px, 130px"
                        className="origin-[50%_32%] scale-[1.8] object-cover object-[50%_22%] sm:scale-100 sm:object-[50%_30%]"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center font-semibold text-primary">
                        {m.initials}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 sm:px-4 sm:pb-4 sm:pt-3.5">
                    <div className="text-base font-bold leading-snug sm:text-[15px]">{m.name}</div>
                    <div className="mt-0.5 text-sm leading-snug text-muted-foreground sm:text-[13px]">
                      {t(`about.team.${m.roleKey}`)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── 3 · A plataforma, gravada tal como está ─────────────────── */}
      <section data-backdrop="grid" className="relative isolate">
        <div className={cn("relative mx-auto max-w-6xl py-16 md:py-24", GUTTER)}>
          <Reveal className="mx-auto mb-10 max-w-3xl text-center">
            <p className={EYEBROW}>{th("tool.eyebrow")}</p>
            <h2 className={cn("mt-3", H2)}>
              {th("tool.title")} <span className={ACCENT}>{th("tool.titleAccent")}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[58ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {th("tool.subtitle")}
            </p>
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

      {/* ── 4 · Para que serve + o que isto não é ───────────────────── */}
      <section className="relative isolate">
        <div className={cn("mx-auto max-w-6xl py-16 md:py-24", GUTTER)}>
          <Reveal className="mx-auto mb-10 max-w-3xl text-center">
            <p className={EYEBROW}>{th("jobs.eyebrow")}</p>
            <h2 className={cn("mt-3", H2)}>
              {th("jobs.title")} <span className={ACCENT}>{th("jobs.titleAccent")}</span>
            </h2>
          </Reveal>
          <ol className="grid gap-4 md:grid-cols-3">
            {JOBS.map((k, i) => (
              <li key={k}>
                <Reveal className="h-full rounded-2xl border border-border/60 bg-card/60 p-6">
                  <div aria-hidden className="nums font-heading text-3xl font-bold italic text-primary">
                    0{i + 1}
                  </div>
                  <h3 className="mt-3 text-lg font-bold leading-snug">{th(`jobs.items.${k}.title`)}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{th(`jobs.items.${k}.text`)}</p>
                </Reveal>
              </li>
            ))}
          </ol>
          {/* Mesma largura e colunas da grelha de cima, sem fundo: lê-se como a
              nota de rodapé honesta dos três cartões, não como mais um cartão. */}
          <Reveal className="mt-4 rounded-2xl border border-border/60 p-6">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{th("not.title")}</h3>
            <ul className="mt-4 grid gap-4 md:grid-cols-3 md:gap-6">
              {NOTS.map((k) => (
                <li key={k} className="flex items-start gap-3 text-pretty text-[15px] leading-relaxed">
                  <X className="mt-[5px] h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <p>
                    <span className="font-semibold">{th(`not.items.${k}.title`)}</span>{" "}
                    <span className="text-muted-foreground">{th(`not.items.${k}.text`)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── 5 · Planos ──────────────────────────────────────────────── */}
      <section id="planos" data-backdrop="rings" data-hide-floating className="relative isolate">
        <div className={cn("relative mx-auto max-w-5xl py-16 md:py-24", GUTTER)}>
          <Reveal className="mx-auto mb-10 max-w-3xl text-center md:mb-12">
            <p className={EYEBROW}>{t("pricing.eyebrow")}</p>
            <h2 className={cn("mt-3", H2)}>{t("pricing.title")}</h2>
            <p className="mx-auto mt-4 max-w-[62ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("pricing.subtitle", { dias })}
            </p>
          </Reveal>
          <PricingCards supportEmail={LEGAL.email} estado="anonimo" />
          <p className="mx-auto mt-8 max-w-[52ch] text-balance text-center text-sm leading-relaxed text-muted-foreground">
            {th("pricing.facts")}
          </p>
        </div>
      </section>

      {/* ── 6 · FAQ ─────────────────────────────────────────────────── */}
      <section data-backdrop="paper-grid" className="relative isolate">
        <div className={cn("relative mx-auto max-w-2xl py-16 md:py-24", GUTTER)}>
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("faq.title")}</h2>
          </Reveal>
          <FaqList items={faq} />
        </div>
      </section>

      {/* ── 7 · CTA final ───────────────────────────────────────────── */}
      <section data-backdrop="closing" data-hide-floating className={cn("relative isolate py-20 md:py-32", GUTTER)}>
        <Reveal className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 rounded-2xl shadow-lg" />
          <h2 className="mt-8 max-w-[22ch] text-balance text-3xl font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-5xl">
            {th("final.title")}
            {/* Linha própria: a frase em itálico não começa a meio de uma linha. */}
            <span className={cn("mt-1 block", ACCENT)}>{th("final.titleAccent")}</span>
          </h2>
          <div data-final-cta className="mt-9 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
            <Link
              href="/register"
              data-track="footer_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-14 w-full px-10 text-lg font-semibold sm:w-auto")}
            >
              {t("hero2.cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="footer_peek"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-14 w-full px-9 text-lg sm:w-auto")}
            >
              {th("hero.peek")}
            </Link>
          </div>
          <PriceNote text={priceNote} className="mt-5 text-[13px] leading-relaxed text-muted-foreground" />
        </Reveal>
      </section>
    </div>
  );
}
