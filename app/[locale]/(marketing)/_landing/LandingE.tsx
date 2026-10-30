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
 *   - O funil ainda é o pago: o CTA do cabeçalho vai para /pricing, o /register
 *     mostra a escolha de plano e o JSON-LD anuncia os preços. Antes de abrir a
 *     campanha é preciso um modo "campanha" no registo e no cabeçalho.
 *   - A FAQ "E o acesso grátis, até quando?" tem a resposta por definir, de
 *     propósito: não se inventam prazos nem condições.
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
import { ThemedImg } from "@/components/marketing/showcase/ThemedImg";
import { shotPaths, type ShotKey } from "@/components/marketing/showcase/data";
import { FaqList, LandingJsonLd, heroDelay, heroLead, heroWords } from "./shared";

/** Livros oferecidos pelo autor. */
const LIVROS_TOTAL = 200;
/** TODO(campanha): substituir pela contagem real (contas confirmadas + 1 ação). */
const LIVROS_RESTANTES = 200;

const PASSOS = ["conta", "email", "usar"] as const;
/** Cada cartão do que é grátis mostra o ecrã real correspondente. */
const OFERTA = [
  { k: "fundamentais", shot: "fund" },
  { k: "avaliacao", shot: "val" },
  { k: "dcf", shot: "dcf" },
  { k: "ia", shot: "ai" },
] as const satisfies readonly { k: string; shot: ShotKey }[];
const REGRAS = ["primeiros", "email", "usar", "morada", "fim"] as const;
const FAQ_E = [1, 2, 3, 4, 5, 6] as const;

/** Oferta do livro: bloco tipográfico (sem capa desenhada nem barra de progresso). */
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
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border/70 bg-card/80 p-6 text-center shadow-sm">
      <p className="text-[13px] font-semibold uppercase tracking-wider text-foreground/80">{kicker}</p>
      <p className="mt-3 font-heading text-2xl font-bold italic leading-tight">{title}</p>
      <p className="mt-1 text-[13px] font-medium text-muted-foreground">{author}</p>
      <p className="nums mt-5 border-t border-border/60 pt-4 text-xl font-extrabold tracking-tight">{remaining}</p>
      <p className="mt-2 text-balance text-sm leading-relaxed text-muted-foreground">{offered}</p>
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
    // data-hide-floating na raiz: a pill flutuante anuncia "desde 7 €" e o
    // registo pago, o que contradiz esta página.
    <div data-hide-floating className="relative flex-1 overflow-x-clip">
      <LandingJsonLd faq={faq} />
      {/* Aviso visível: rascunho de uma decisão que ainda não foi tomada. */}
      <p role="note" className="relative z-10 mx-auto mt-5 w-fit max-w-[92vw] rounded-2xl border border-dashed border-primary/50 bg-card px-4 py-1.5 text-center text-[13px] font-medium text-muted-foreground sm:rounded-full">
        {te("draftBanner")}
      </p>

      {/* ── 1 · Topo: lançamento + livro ─────────────────────────────── */}
      <section data-backdrop="paper" className="relative isolate px-6 pb-14 pt-10 md:px-8 md:pb-20 md:pt-20">
        <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
          <p className="hero-in inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[13px] font-semibold text-muted-foreground" style={heroDelay(0)}>
            <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden />
            {te("eyebrow")}
          </p>
          <h1 className="mt-5 max-w-[20ch] text-balance text-[2.1rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-5xl md:text-6xl lg:text-7xl">
            <span className="sr-only">
              {titleLead} {titleAccent}
            </span>
            {heroLead(titleLead)}
            {heroWords(titleAccent, titleLead.split(" ").length, "font-heading font-bold italic text-primary")}
          </h1>
          <p className="hero-in mt-4 max-w-[58ch] text-balance text-[15px] leading-relaxed text-muted-foreground sm:mt-5 sm:text-lg" style={heroDelay(0.18)}>
            {te("subtitle")}
          </p>
          <div data-hero-cta className="hero-in mt-6 flex w-full flex-col items-center justify-center gap-2.5 sm:mt-7 sm:w-auto sm:flex-row sm:gap-3" style={heroDelay(0.28)}>
            <Link
              href="/register"
              data-track="hero_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-12 w-full max-w-[20rem] px-6 text-base font-semibold sm:w-auto sm:max-w-none sm:px-8")}
            >
              {te("cta")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="hero_demo"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-12 w-full max-w-[20rem] px-5 text-base sm:w-auto sm:max-w-none sm:px-7")}
            >
              {t("peekCta")}
            </Link>
          </div>
          <p className="hero-in mt-3 text-balance text-[13px] text-muted-foreground" style={heroDelay(0.34)}>
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
                  <span aria-hidden className="nums font-heading text-3xl font-bold italic text-primary">{i + 1}</span>
                  <h3 className="mt-3 text-lg font-bold tracking-tight">{te(`steps.items.${k}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{te(`steps.items.${k}.body`)}</p>
                </Reveal>
              </li>
            ))}
          </ol>
          <p className="mx-auto mt-8 max-w-[56ch] text-balance text-center text-sm text-muted-foreground">{te("steps.after", { total })}</p>
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
            <p className="mx-auto mt-4 max-w-[56ch] text-balance text-lg leading-relaxed text-muted-foreground">{te("offerSubtitle")}</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {OFERTA.map(({ k, shot }) => (
              <Reveal key={k} className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60">
                <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-border/60 bg-card">
                  <ThemedImg
                    src={shotPaths(shot).wide}
                    alt={te(`offer.${k}.alt`)}
                    className="absolute inset-0 h-full w-full object-cover object-top"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-bold tracking-tight">{te(`offer.${k}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{te(`offer.${k}.body`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4 · Regras ───────────────────────────────────────────────── */}
      <section className="relative isolate">
        <div className="relative mx-auto max-w-2xl px-6 py-16 md:px-8 md:py-24">
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
            <h2 className="text-balance text-center text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
              {te("faq.title")} <span className="font-heading font-bold italic text-primary">{te("faq.titleAccent")}</span>
            </h2>
          </Reveal>
          <FaqList items={faq} />
        </div>
      </section>

      {/* ── 6 · CTA final ────────────────────────────────────────────── */}
      <section data-backdrop="closing" data-hide-floating className="relative isolate px-6 py-24 md:px-8 md:py-32">
        <Reveal data-reveal="zoom" className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 rounded-2xl shadow-lg" />
          <h2 className="mt-8 max-w-[18ch] text-balance text-4xl font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-6xl">
            {te("final.title", { restantes })}{" "}
            <span className="font-heading font-bold italic text-primary">{te("final.titleAccent", { restantes })}</span>
          </h2>
          <p className="mt-4 max-w-[48ch] text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">{te("final.lead")}</p>
          <div data-final-cta className="mt-9 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row">
            <Link
              href="/register"
              data-track="footer_register"
              className={cn(buttonVariants({ size: "lg" }), "pressable min-h-14 w-full max-w-[20rem] px-12 text-lg font-semibold sm:w-auto sm:max-w-none")}
            >
              {te("cta")}
            </Link>
            <Link
              href="/stock/AAPL"
              data-track="footer_peek"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-14 w-full max-w-[20rem] px-9 text-lg sm:w-auto sm:max-w-none")}
            >
              {t("peekCta")}
            </Link>
          </div>
          <p className="mt-5 text-[13px] text-muted-foreground">{te("final.note")}</p>
        </Reveal>
      </section>
    </div>
  );
}
