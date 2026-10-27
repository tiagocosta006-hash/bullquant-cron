import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';

import { getTranslations } from "next-intl/server";
import { ArrowRight, ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Reveal } from "@/components/fx/Reveal";
import { HeroHorizon } from "@/components/marketing/HeroHorizon";
import { HeroVideo } from "@/components/marketing/HeroVideo";
import { GrowCta } from "@/components/marketing/GrowCta";
import { LANDING_MEDIA } from "@/components/marketing/media";
import { TeamSignature } from "@/components/marketing/TeamSignature";
import { PlatformInside } from "@/components/marketing/PlatformInside";
import { BRAND } from "@/lib/brand";
import { getUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PLANOS, PLANO_IDS, precoTexto } from "@/lib/planos";
import { PricingCards } from "./pricing/PricingCards";
import { LEGAL } from "@/lib/legal/config";


/**
 * Landing v3 — direta ao ponto (27/10/2026, "temos de fazer vendas"; modelo:
 * a Qualtrim, ~4 ecrãs). Ordem: título curto + CTA com o preço → VÍDEO REAL da
 * plataforma logo no primeiro ecrã → faixa de prova → a plataforma por dentro
 * (prints reais) → os dois planos → FAQ → CTA final. A v2 (scroll
 * cinematográfico, manifesto, stories animadas, bento, contadores, equipa em
 * grande) tinha ~19 ecrãs; os componentes continuam em components/marketing/.
 * Todo o texto via i18n (marketing.*).
 */


/* Equipa mostrada na secção "Feito em Portugal" — mesmas fotos da página
   /about (public/team/). Sem foto → iniciais, como lá. */
// image é opcional de propósito: com todos os membros a ter foto, o `as const`
// tornava `image` sempre truthy e o TS estreitava o ramo do fallback de iniciais
// para `never` (erro de build). Tipar `image?` mantém o fallback válido para
// quando um membro ainda não tiver foto em public/team/.
const TEAM: { name: string; roleKey: string; image?: string; initials: string }[] = [
  { name: "Rodrigo Martins", roleKey: "role1", image: "/team/rodrigo.jpg", initials: "RM" },
  { name: "Tiago Costa", roleKey: "role2", image: "/team/tiago.jpg", initials: "TC" },
  { name: "Alexandre Machado", roleKey: "role3", image: "/team/alex.jpeg", initials: "AM" },
];

const heroDelay = (s: number) => ({ "--hero-delay": `${s}s` }) as React.CSSProperties;

/* Headline palavra a palavra: cada palavra sobe de trás de uma clip-line
   (.hero-clip/.hero-word em globals.css); --w dá o stagger e o delay do
   sheen no accent. O h1 leva aria-label com a frase completa.
   NOTA: o cls (gold-sheen-text) vai num span INTERIOR — na mesma node
   que .hero-word, a `animation` do sheen esmagava a da subida e a
   palavra ficava presa fora do clip (invisível). */
const heroWords = (text: string, offset: number, cls?: string) =>
  text.split(" ").map((w, i) => (
    <span key={`${offset}-${i}`} aria-hidden className="hero-clip">
      <span className="hero-word" style={{ "--w": offset + i } as React.CSSProperties}>
        {cls ? <span className={cls}>{w}</span> : w}
      </span>
    </span>
  ));

/**
 * Primeira palavra do título quando é o nome do produto: "Bull" na cor do
 * texto, "Value" a dourado, tudo 18% maior (a meio dos 10–25% pedidos).
 *
 * `text-[1.18em]` e não um px: o h1 muda de tamanho em quatro breakpoints
 * (5xl → 7xl → 8xl → 7.5rem) e uma medida absoluta desalinhava-se em três
 * deles. Em `em` a marca fica sempre 18% acima do resto da frase.
 *
 * Data-driven de propósito — só dispara se `titleLead` COMEÇAR por
 * BRAND.name. Em EN a frase é "See the value…", não leva marca, e não recebe
 * tratamento nenhum. Um `if (locale === "pt")` daria o mesmo resultado hoje e
 * partia-se no dia em que a copy PT mudasse.
 */
const BRAND_SPLIT = 8; // "The Bull" | "Value"

function heroLead(text: string) {
  if (!text.startsWith(BRAND.name)) return heroWords(text, 0);
  const resto = text.slice(BRAND.name.length); // ex.: ": a plataforma para os"
  const [cauda, ...palavras] = resto.split(" "); // cauda = ":" colado à marca
  return (
    <>
      <span aria-hidden className="hero-clip">
        <span className="hero-word text-[1.18em]" style={{ "--w": 0 } as React.CSSProperties}>
          {BRAND.name.slice(0, BRAND_SPLIT)}
          <span className="text-primary">{BRAND.name.slice(BRAND_SPLIT)}</span>
          {cauda}
        </span>
      </span>
      {heroWords(palavras.join(" "), 1)}
    </>
  );
}

export default async function LandingPage({
  searchParams,
}: {
  // `dashboardTile` era um andaime de comparação (?dashboardTile=a|b|c) para o
  // tile do Dashboard no bento. O Alex escolheu o C, que está agora fixo no
  // componente — daí o parâmetro ter saído.
  searchParams: Promise<{ preview?: string }>;
}) {
  const [user, { preview }] = await Promise.all([getUser(), searchParams]);

  // ?preview=1 deixa ver a landing mesmo com sessão iniciada (rever design
  // sem ter de fazer logout / abrir janela anónima).
  if (user && preview !== "1") {
    redirect("/dashboard");
  }

  const t = await getTranslations("marketing");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": BRAND.name,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "url": BRAND.siteUrl,
        "offers": PLANO_IDS.map((id) => ({
          "@type": "Offer",
          "name": id === "pro" ? "BullValue PRO" : "BullValue PRO + Comunidade",
          "price": String(PLANOS[id].preco),
          "billingIncrement": "P1M",
          "priceCurrency": "EUR",
        }))
      },
      {
        "@type": "FAQPage",
        "mainEntity": ([1, 2, 3, 4, 5] as const).map((n) => ({
          "@type": "Question",
          "name": t(`faq.q${n}`),
          "acceptedAnswer": {
            "@type": "Answer",
            "text": t(`faq.a${n}`)
          }
        }))
      }
    ]
  };

  // Bento "Tudo num terminal" — 4 réplicas FIÉIS (não mocks genéricos) de
  // Dashboard, Portfólio, Calendário e Explorar. Cada uma copia literalmente
  // as class strings dos componentes reais (ver comentários em
  // components/marketing/replicas/*.tsx). Sem fetch — números hardcoded,
  // labels via chaves i18n reais das próprias páginas (evita duplicar copy
  // nos 9 locales).
  return (
    <div className="relative flex-1 overflow-x-clip">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
          <div className="hero-in mt-6 flex flex-row flex-wrap items-center justify-center gap-2.5 sm:mt-7 sm:gap-3" style={heroDelay(0.28)}>
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
            {t("hero2.priceNote", { preco: precoTexto(PLANOS.pro.preco) })}
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
      <section id="planos" data-backdrop="rings" className="relative isolate">
        <div className="relative mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">{t("pricing.title")}</h2>
            <p className="mx-auto mt-4 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">{t("pricing.subtitle")}</p>
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
          <div className="mt-10 space-y-3">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <details key={n} className="faq-item glass rounded-2xl">
                <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold">
                  {t(`faq.q${n}`)}
                  <ChevronDown className="faq-chevron h-4 w-4 shrink-0 text-muted-foreground" />
                </summary>
                <p className="max-w-[68ch] px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground">{t(`faq.a${n}`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6 · CTA final ───────────────────────────────────────────── */}
      <section data-backdrop="closing" className="relative isolate px-6 py-24 md:px-8 md:py-32">
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
          <p className="mt-5 text-xs text-muted-foreground/80">{t("hero2.priceNote", { preco: precoTexto(PLANOS.pro.preco) })}</p>
        </Reveal>
      </section>
    </div>
  );
}
