/**
 * Versão E (29/10/2026) — RASCUNHO de campanha: "lançamento grátis + livros do Nuno Palma".
 *
 * ⚠️ ANTES DE PUBLICAR:
 *   - O preço não está fechado: aqui não há PricingCards nem preços inventados.
 *   - Contraria os Termos atuais ("Não existe, nesta fase, plano gratuito") e o
 *     teste tests/legal/legal.test.ts, que proíbe "grátis/free" no namespace
 *     marketing. Por isso o texto vive à parte, em messages/rascunhos/landingE.*,
 *     e a página só a serve com LANDING_RASCUNHOS=1 (pré-visualizações da
 *     equipa, nunca em produção). Para publicar: mudar os Termos, levar o texto
 *     para marketing.landingE e ajustar o teste.
 *   - LIVROS_RESTANTES é um valor fixo (TODO: ligar à contagem real de contas
 *     que cumpriram os 3 passos).
 *   - Nuno Palma só aparece como facto (ofereceu os livros). Sem citações.
 */
import { Link } from "@/i18n/routing";
import { createTranslator } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import rascunhoPt from "@/messages/rascunhos/landingE.pt.json";
import rascunhoEn from "@/messages/rascunhos/landingE.en.json";
import { ArrowRight, BookOpen, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Reveal } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";
import { FaqList, LandingJsonLd, heroDelay, heroLead, heroWords } from "./shared";

/** Livros oferecidos pelo autor. */
const LIVROS_TOTAL = 200;
/** TODO(campanha): substituir pela contagem real (contas confirmadas + 1 ação). */
const LIVROS_RESTANTES = 200;

const PASSOS = ["conta", "email", "acao"] as const;
const OFERTA = ["fundamentais", "avaliacao", "dcf", "ia"] as const;
const REGRAS = ["primeiros", "email", "acao", "morada", "fim"] as const;
const FAQ_E = [1, 2, 3, 4, 5] as const;

function BookCounter({
  kicker,
  title,
  author,
  remaining,
  offered,
}: {
  kicker: string;
  title: string;
  author: string;
  remaining: string;
  offered: string;
}) {
  const pct = Math.max(0, Math.min(100, (LIVROS_RESTANTES / LIVROS_TOTAL) * 100));
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border border-border/70 bg-card/80 p-5 text-left shadow-sm sm:flex-row sm:items-center sm:p-6">
      {/* Capa desenhada (placeholder até haver foto do livro) */}
      <div
        aria-hidden
        className="mx-auto flex aspect-[2/3] w-24 shrink-0 flex-col justify-between rounded-r-md rounded-l-sm border border-l-[6px] border-border border-l-primary bg-background p-2.5 sm:mx-0"
      >
        <span className="font-heading text-[11px] font-bold italic leading-tight">{title}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{author}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{kicker}</p>
        <p className="nums mt-1 text-xl font-extrabold tracking-tight" role="status">
          {remaining}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{offered}</p>
      </div>
    </div>
  );
}

export async function LandingE() {
  const [t, locale] = await Promise.all([getTranslations("marketing"), getLocale()]);
  const te = createTranslator({
    locale,
    messages: { landingE: locale === "en" ? rascunhoEn : rascunhoPt },
    namespace: "landingE",
  });
  const total = LIVROS_TOTAL;
  const restantes = LIVROS_RESTANTES;
  const faq = FAQ_E.map((n) => ({ q: te(`faq.q${n}`), a: te(`faq.a${n}`, { total }) }));
  const titleLead = te("draft_titleLead");
  const titleAccent = te("draft_titleAccent");

  return (
    <div className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />
      {/* Aviso visível: rascunho de uma decisão que ainda não foi tomada. */}
      <p role="note" className="relative z-10 mx-auto mt-3 w-fit max-w-[92vw] rounded-full border border-primary/40 bg-card px-4 py-1.5 text-center text-xs font-medium text-muted-foreground">
        {te("draftBanner")}
      </p>

      {/* ── 1 · Topo: lançamento + livro ─────────────────────────────── */}
      <section data-backdrop="paper" className="relative isolate px-5 pb-14 pt-10 md:px-8 md:pb-20 md:pt-20">
        <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
          <p className="hero-in inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-semibold text-muted-foreground" style={heroDelay(0)}>
            <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden />
            {te("eyebrow")}
          </p>
          <h1 className="mt-5 max-w-[20ch] text-balance text-[2.1rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl">
            <span className="sr-only">
              {titleLead} {titleAccent}
            </span>
            {heroLead(titleLead)}
            {heroWords(titleAccent, titleLead.split(" ").length, "font-heading font-bold italic text-primary")}
          </h1>
          <p className="hero-in mt-4 max-w-[58ch] text-[15px] leading-relaxed text-muted-foreground sm:mt-5 sm:text-lg" style={heroDelay(0.18)}>
            {te("subtitle", { total })}
          </p>
          <div data-hero-cta className="hero-in mt-6 flex flex-row flex-wrap items-center justify-center gap-2.5 sm:mt-7 sm:gap-3" style={heroDelay(0.28)}>
            <Link
              href="/register"
              data-track="hero_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 px-6 text-base font-semibold sm:px-8")}
            >
              {te("cta")}
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
            {te("heroNote")}
          </p>
          <div className="hero-in mt-9 w-full" style={heroDelay(0.4)}>
            <BookCounter
              kicker={te("book.kicker")}
              title={te("book.title")}
              author={te("book.author")}
              remaining={te("book.remaining", { restantes, total })}
              offered={te("book.offered", { total })}
            />
          </div>
        </div>
      </section>

      {/* ── 2 · Como funciona: 3 passos ──────────────────────────────── */}
      <section data-backdrop="grid" className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-10 max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {te("steps.title")} <span className="font-heading font-bold italic text-primary">{te("steps.titleAccent")}</span>
            </h2>
          </Reveal>
          <ol className="grid gap-4 md:grid-cols-3">
            {PASSOS.map((k, i) => (
              <li key={k}>
                <Reveal className="h-full rounded-2xl border border-border/60 bg-card/60 p-6">
                  <span className="nums font-heading text-3xl font-bold italic text-primary">{i + 1}</span>
                  <h3 className="mt-3 text-lg font-bold tracking-tight">{te(`steps.items.${k}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{te(`steps.items.${k}.body`)}</p>
                </Reveal>
              </li>
            ))}
          </ol>
          <p className="mx-auto mt-8 max-w-[56ch] text-center text-sm text-muted-foreground">{te("steps.after", { total })}</p>
        </div>
      </section>

      {/* ── 3 · O que tens (sem preços: ainda não estão fechados) ─────── */}
      <section id="planos" data-backdrop="rings" data-hide-floating className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-10 max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              {te("draft_offerTitle")}{" "}
              <span className="font-heading font-bold italic text-primary">{te("draft_offerAccent")}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">{te("offerSubtitle")}</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {OFERTA.map((k) => (
              <Reveal key={k} className="rounded-2xl border border-border/60 bg-card/60 p-6">
                <h3 className="text-lg font-bold tracking-tight">{te(`offer.${k}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{te(`offer.${k}.body`)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4 · Regras ───────────────────────────────────────────────── */}
      <section className="relative isolate">
        <div className="relative mx-auto max-w-2xl px-6 py-16 md:px-8 md:py-20">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
              {te("rules.title")} <span className="font-heading font-bold italic text-primary">{te("rules.titleAccent")}</span>
            </h2>
            <ul className="mt-8 space-y-3">
              {REGRAS.map((k) => (
                <li key={k} className="flex gap-3 rounded-xl border border-border/60 bg-card/50 p-4 text-sm leading-relaxed">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>{te(`rules.items.${k}`, { total })}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── 5 · FAQ da campanha ──────────────────────────────────────── */}
      <section data-backdrop="paper-grid" className="relative isolate">
        <div className="relative mx-auto max-w-2xl px-6 py-16 md:px-8 md:py-24">
          <Reveal>
            <h2 className="text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{te("faq.title")}</h2>
          </Reveal>
          <FaqList items={faq} />
        </div>
      </section>

      {/* ── 6 · CTA final ────────────────────────────────────────────── */}
      <section data-backdrop="closing" data-hide-floating className="relative isolate px-6 py-24 md:px-8 md:py-32">
        <Reveal data-reveal="zoom" className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 rounded-2xl shadow-lg" />
          <h2 className="mt-8 max-w-[18ch] text-balance text-4xl font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-6xl">
            {te("final.title", { restantes })}
          </h2>
          <p className="mt-4 max-w-[48ch] text-base leading-relaxed text-muted-foreground sm:text-lg">{te("final.lead")}</p>
          <div data-final-cta className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/register"
              data-track="footer_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-14 px-12 text-lg font-semibold")}
            >
              {te("cta")}
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="footer_peek"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-14 px-9 text-lg")}
            >
              {t("peekCta")}
            </Link>
          </div>
          <p className="mt-5 text-xs text-muted-foreground/80">{te("final.note")}</p>
        </Reveal>
      </section>
    </div>
  );
}
