import { Link } from "@/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Calculator, FileText, MessageSquareText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Reveal } from "@/components/fx/Reveal";
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
import { FAQ_IDS, FaqList, LandingJsonLd, heroDelay } from "./shared";

/**
 * Versão G (29/10/2026): ultra-curta, para quem chega do Instagram/TikTok
 * pelo telemóvel. Promessa de 7 palavras + preço + CTA acima da dobra a 360px,
 * o vídeo (moldura de telemóvel; no desktop, o leitor 16:10), as três provas
 * num só cartão (lista no telemóvel, três colunas no desktop), planos,
 * 4 perguntas e o CTA final. Texto em marketing.landingG.* (messages/pt.json
 * e en.json).
 *
 * Ritmo: topo + vídeo + provas formam um bloco só (espaços curtos, para o
 * vídeo aparecer cedo); daí para baixo cada secção leva py-16 md:py-24.
 * Notas pequenas a 13px (nada abaixo disso no telemóvel).
 */
export async function LandingG() {
  const [t, tc, tg, locale] = await Promise.all([
    getTranslations("marketing"),
    getTranslations("marketing.landingC"),
    getTranslations("marketing.landingG"),
    getLocale(),
  ]);
  const dias = PLANOS.comunidade.diasGratis ?? 0;
  // Só as 4 primeiras perguntas — o JSON-LD leva exatamente as que estão à vista.
  const faq = FAQ_IDS.slice(0, 4).map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`, { dias }) }));
  const priceNote = t("hero2.priceNote", { preco: precoTexto(PLANOS.pro.preco), dias });
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

  const proof = [
    { key: "sec", Icon: FileText },
    { key: "dcf", Icon: Calculator },
    { key: "ai", Icon: MessageSquareText },
  ] as const;

  return (
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />

      {/* ── 1 · Topo: promessa, preço e CTA acima da dobra ─────────── */}
      <section data-backdrop="paper" className="relative isolate px-4 pb-10 pt-8 sm:px-6 md:pb-16 md:pt-20">
        <div className="relative mx-auto flex max-w-xl flex-col items-center text-center">
          <h1
            className="hero-in text-balance text-[2.15rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-5xl"
            style={heroDelay(0.05)}
          >
            {tg("hero.titleLead")}{" "}
            <span className="font-heading font-bold italic text-primary">{tg("hero.titleAccent")}</span>
          </h1>
          <p
            className="hero-in mt-3 max-w-[40ch] text-pretty text-[15px] leading-relaxed text-muted-foreground sm:mt-4 sm:text-base"
            style={heroDelay(0.15)}
          >
            {tg("hero.subtitle")}
          </p>
          <div
            data-hero-cta
            className="hero-in mt-5 flex w-full flex-col items-stretch gap-2.5 min-[400px]:w-auto min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-center"
            style={heroDelay(0.25)}
          >
            <Link
              href="/register"
              data-track="hero_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 px-7 text-base font-semibold")}
            >
              {t("hero2.cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="hero_demo"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-12 px-6 text-base")}
            >
              {t("peekCta")}
            </Link>
          </div>
          <p
            className="hero-in mt-3 max-w-[46ch] text-balance text-[13px] leading-snug text-muted-foreground sm:max-w-none"
            style={heroDelay(0.3)}
          >
            {priceNote}
          </p>
        </div>
      </section>

      {/* ── 2 · O vídeo (moldura de telemóvel no telemóvel) ────────── */}
      {/* O título entra com o topo (hero-in), não com o scroll: está acima da
          dobra em todos os ecrãs e com o Reveal aparecia depois do vídeo. */}
      <section className="relative isolate px-4 pb-10 sm:px-6 md:pb-14">
        <h2
          className="hero-in mx-auto mb-5 max-w-xl text-balance text-center text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl md:mb-8"
          style={heroDelay(0.3)}
        >
          {tg("reel.title")}{" "}
          {/* nowrap: a quebra cai antes do acento, nunca a meio dele */}
          <span className="whitespace-nowrap font-heading font-bold italic text-primary">{tg("reel.titleAccent")}</span>
        </h2>
        <div className="hero-in mx-auto max-w-sm md:max-w-3xl" style={heroDelay(0.4)}>
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

      {/* ── 3 · Três provas: um cartão só, com a largura do vídeo ───── */}
      {/* Antes eram três caixas soltas com contorno fino, que pareciam campos
          de formulário; agora é uma ficha com divisórias (colunas no desktop). */}
      <section className="relative isolate px-4 pb-16 sm:px-6 md:pb-24">
        <ul
          aria-label={tg("proof.label")}
          className="mx-auto grid max-w-sm divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/70 md:max-w-3xl md:grid-cols-3 md:divide-x md:divide-y-0"
        >
          {proof.map(({ key, Icon }) => (
            <li
              key={key}
              className="flex items-center gap-3.5 px-4 py-3.5 md:flex-col md:gap-3 md:px-6 md:py-7 md:text-center"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              {/* Facto curto + o que ganhas: duas linhas certas, em vez de uma
                  frase longa a partir onde calha nas colunas do desktop. */}
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug">{tg(`proof.${key}.title`)}</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{tg(`proof.${key}.text`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 4 · Planos ──────────────────────────────────────────────── */}
      <section id="planos" data-backdrop="rings" data-hide-floating className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-24">
          <Reveal className="mx-auto mb-8 max-w-xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("pricing.title")}</h2>
            <p className="mx-auto mt-3 max-w-[52ch] text-base leading-relaxed text-muted-foreground">
              {t("pricing.subtitle", { dias })}
            </p>
          </Reveal>
          <PricingCards supportEmail={LEGAL.email} estado="anonimo" />
        </div>
      </section>

      {/* ── 5 · 4 perguntas ─────────────────────────────────────────── */}
      <section className="relative isolate">
        <div className="relative mx-auto max-w-xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="text-center text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">{tg("faq.title")}</h2>
          <FaqList items={faq} className="mt-6 space-y-2.5" />
        </div>
      </section>

      {/* ── 6 · CTA final ───────────────────────────────────────────── */}
      <section data-backdrop="closing" data-hide-floating className="relative isolate px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="mx-auto flex max-w-xl flex-col items-center text-center">
          <BrandMark className="h-12 w-12 rounded-2xl shadow-lg" />
          <h2 className="mt-6 text-balance text-3xl font-extrabold leading-[1.06] tracking-[-0.035em] sm:text-5xl">
            {tg("final.titleLead")}{" "}
            <span className="whitespace-nowrap font-heading font-bold italic text-primary">{tg("final.titleAccent")}</span>
          </h2>
          {/* Mesmos botões do topo, com o mesmo tamanho: a força do fecho vem do
              título, não de botões maiores (a 390px os de 56px pesavam). */}
          <div data-final-cta className="mt-7 flex w-full flex-col items-stretch gap-2.5 min-[400px]:w-auto min-[400px]:flex-row">
            <Link
              href="/register"
              data-track="footer_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 px-7 text-base font-semibold")}
            >
              {t("hero2.cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="footer_peek"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-12 px-6 text-base")}
            >
              {t("peekCta")}
            </Link>
          </div>
          {/* A nota de preço já diz "cancelas quando quiseres"; a letra miúda
              não repete (só IVA e o aviso). Sem /80: a 13px precisa do contraste. */}
          <p className="mt-4 max-w-[46ch] text-balance text-[13px] leading-snug text-muted-foreground sm:max-w-none">{priceNote}</p>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{tg("final.finePrint")}</p>
        </Reveal>
      </section>
    </div>
  );
}
