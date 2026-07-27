import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BRAND } from "@/lib/brand";
import { glossaryTerms, Locale } from "@/lib/data/glossary";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { Reveal } from "@/components/fx/Reveal";
import { BookOpen } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "header" });
  const title = `${t("glossary")} | ${BRAND.name}`;

  return {
    title,
    description: "Glossário Financeiro e Dicionário de Value Investing.",
    openGraph: { title, type: "website" },
    alternates: { canonical: `${BRAND.siteUrl}/glossary` },
  };
}

export default async function GlossaryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = locale as Locale;
  const t = await getTranslations({ locale, namespace: "header" });

  const getLocalizedText = (textObj: any) =>
    textObj[currentLocale] || textObj["en"];

  const sortedTerms = [...glossaryTerms].sort((a, b) =>
    getLocalizedText(a.title).localeCompare(getLocalizedText(b.title))
  );

  const grouped: Record<string, typeof sortedTerms> = {};
  for (const term of sortedTerms) {
    const letter = getLocalizedText(term.title).charAt(0).toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(term);
  }

  const activeLetters = new Set(Object.keys(grouped));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const subtitle = currentLocale === "pt"
    ? "Tudo o que precisas de saber para investir com convicção."
    : "Everything you need to know to invest with conviction.";

  return (
    <div className="container relative isolate mx-auto max-w-5xl px-4 py-24 sm:px-6 sm:py-32">
      <div
        aria-hidden
        className="brand-watermark pointer-events-none absolute -z-10 left-[68%] top-[10%] h-[min(70vw,560px)] w-[min(70vw,560px)] -translate-x-1/2"
      />

      {/* Hero */}
      <Reveal
        data-reveal="zoom"
        className="mb-14 flex flex-col items-center gap-4 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <BookOpen className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-balance text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-5xl text-foreground">
          {t("glossary")}
        </h1>
        <p className="text-lg text-muted-foreground">{subtitle}</p>
        <span className="gold-rule block h-px w-24" aria-hidden />
      </Reveal>

      {/* Layout: cartão A-Z à esquerda (altura total) + acordeão à direita */}
      <div className="flex flex-col lg:flex-row lg:gap-6">

        {/* Cartão de letras A-Z, compacto e fixo */}
        <div className="mb-8 lg:mb-0 lg:w-11 lg:shrink-0 hidden lg:block sticky top-24 self-start">
          <LiquidGlass className="flex flex-col items-center gap-px rounded-xl py-2 px-1.5">
            {alphabet.map((letter) => {
              const isActive = activeLetters.has(letter);
              return isActive ? (
                <a
                  key={letter}
                  href={`#letter-${letter}`}
                  className="flex h-5 w-6 items-center justify-center rounded text-[11px] font-bold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {letter}
                </a>
              ) : (
                <span
                  key={letter}
                  className="flex h-5 w-6 items-center justify-center text-[11px] text-muted-foreground/25"
                >
                  {letter}
                </span>
              );
            })}
          </LiquidGlass>
        </div>

        {/* Mobile: barra horizontal de letras */}
        <div className="mb-8 lg:hidden">
          <LiquidGlass className="rounded-2xl px-4 py-3">
            <div className="flex flex-wrap justify-center gap-1">
              {alphabet.map((letter) => {
                const isActive = activeLetters.has(letter);
                return isActive ? (
                  <a
                    key={letter}
                    href={`#letter-${letter}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    {letter}
                  </a>
                ) : (
                  <span
                    key={letter}
                    className="flex h-8 w-8 items-center justify-center text-xs text-muted-foreground/25"
                  >
                    {letter}
                  </span>
                );
              })}
            </div>
          </LiquidGlass>
        </div>

        {/* Acordeão de termos */}
        <div className="flex-1 flex flex-col gap-10">
          {Object.entries(grouped).map(([letter, terms]) => (
            <section key={letter} id={`letter-${letter}`} className="scroll-mt-24">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-lg font-extrabold text-primary">
                  {letter}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="flex flex-col gap-1">
                {terms.map((term) => (
                  <details
                    key={term.slug}
                    id={term.slug}
                    className="group scroll-mt-24 rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm transition-colors open:bg-card open:border-border open:shadow-sm"
                  >
                    <summary className="flex cursor-pointer select-none items-center gap-3 px-5 py-3.5 text-sm font-semibold text-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden list-none">
                      <svg
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span>{getLocalizedText(term.title)}</span>
                    </summary>
                    <div className="px-5 pb-4 pl-12">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {getLocalizedText(term.definition)}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
