import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "../globals.css";
// A seguir ao globals de propósito: as variantes precisam de ganhar à cascata
// base. Inerte sem os atributos data-v-* que o painel Tweak escreve em <html>.
import "../design-variants.css";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { PulseTracker } from "@/components/pulse/PulseTracker";
import { BRAND } from "@/lib/brand";
import { PaddleProvider } from "@/components/providers/PaddleProvider";
import { CookieConsent } from "@/components/layout/CookieConsent";
import dynamic from "next/dynamic";

/* Painel de design, só em dev.
   IMPORTANTE: tem de ser import DINÂMICO dentro de um ramo morto. Com um
   `import` estático + `{NODE_ENV === "development" && <TweakPanel/>}`, o
   bundler remove o RENDER mas mantém o MÓDULO — o painel inteiro (~86KB,
   incluindo messages/pt.json para a pesquisa inversa de chaves) acabava no
   bundle de produção. Assim, `process.env.NODE_ENV` é substituído no build,
   o ternário fica morto e o chunk nunca chega a ser gerado. */
const TweakPanel =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@/components/devtools/TweakPanel").then((m) => m.TweakPanel))
    : () => null;
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";

const scotchDisplay = localFont({
  variable: "--font-heading",
  // Serif só de display (momentos grandes): swap para aparecer quando usada;
  // sem preload por não ser a fonte primária.
  display: "swap",
  preload: true,
  src: [
    { path: "../../public/fonts/scotch-display/ScotchDisplay-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/scotch-display/ScotchDisplay-SemiBoldItalic.ttf", weight: "600", style: "italic" },
    { path: "../../public/fonts/scotch-display/ScotchDisplay-Bold.ttf", weight: "700", style: "normal" },
    { path: "../../public/fonts/scotch-display/ScotchDisplay-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
});

const sfUIText = localFont({
  variable: "--font-sans",
  // SF Pro (a fonte "Apple") é a fonte primária de toda a UI: swap + preload
  // para carregar já e SEMPRE aparecer. Com "optional" o browser só a usava
  // se estivesse em cache, senão ficava o fallback feio do sistema para sempre.
  display: "swap",
  preload: true,
  src: [
    { path: "../../public/fonts/sf-ui-text/SFUIText-Light.woff2", weight: "300", style: "normal" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-LightItalic.woff2", weight: "300", style: "italic" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-RegularItalic.woff2", weight: "400", style: "italic" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-MediumItalic.woff2", weight: "500", style: "italic" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-SemiboldItalic.woff2", weight: "600", style: "italic" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-Bold.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-BoldItalic.woff2", weight: "700", style: "italic" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-Heavy.woff2", weight: "800", style: "normal" },
    { path: "../../public/fonts/sf-ui-text/SFUIText-HeavyItalic.woff2", weight: "800", style: "italic" },
  ],
});

import { headers } from "next/headers";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  
  // Obter o pathname real injetado pelo middleware
  const headersList = await headers();
  const fullPathname = headersList.get("x-pathname") || "/";
  
  // Remover o locale do pathname para termos a rota limpa (ex: "/pt/stock/AAPL" -> "/stock/AAPL")
  const pathWithoutLocale = fullPathname.replace(new RegExp(`^/(${routing.locales.join('|')})(/|$)`), '/');
  
  // Limpar barras duplas no caso do path base ser apenas '/'
  const cleanPath = pathWithoutLocale === '/' ? '' : (pathWithoutLocale.startsWith('/') ? pathWithoutLocale : `/${pathWithoutLocale}`);

  const languages: Record<string, string> = {};
  routing.locales.forEach((l) => {
    // Se for o default locale e tivermos 'as-needed' configurado, a rota base não tem o prefixo do locale
    const prefix = (l === routing.defaultLocale && routing.localePrefix === 'as-needed') ? "" : `/${l}`;
    languages[l] = `${prefix}${cleanPath}` || "/";
  });

  // O Canonical principal vai ser a rota do default locale (Inglês) se não tiver prefixo
  const currentPrefix = (locale === routing.defaultLocale && routing.localePrefix === 'as-needed') ? "" : `/${locale}`;
  const canonicalPath = `${currentPrefix}${cleanPath}` || "/";

  return {
    metadataBase: new URL(BRAND.siteUrl),
    title: {
      default: `${BRAND.name} — Análise Fundamental de Ações`,
      template: `%s · ${BRAND.name}`,
    },
    description:
      "Análise fundamental de ações com 10 anos de dados, DCF integrada e Analista IA. Em português, gratuito. Uma plataforma Bullocracy.",
    keywords: [
      "BullValue",
      "análise fundamental de ações",
      "calculadora DCF",
      "value investing",
      "avaliação de empresas",
      "stock valuation",
      "DCF metrics investing",
      "intrinsic value",
      "análise financeira",
    ],
    verification: {
      google: [
        "HKTu1CXFZw_fDo60XEPT-UFCMFxTF2RNjpGIsw2jw0Q",
        "uPh6Qu3O0murd4rv-qVq6FVyEj896IUmlqwGkPp6QAc",
      ],
      other: {
        "msvalidate.01": "21C2FF6F72DB70916C5EB5F19D885CF6",
      },
    },
    alternates: {
      canonical: canonicalPath,
      languages,
    },
    openGraph: {
      title: `${BRAND.name} — Análise Fundamental de Ações`,
      description:
        "Vê o valor que os outros não veem. Fundamentais de 10 anos, DCF e Analista IA, em português.",
      siteName: BRAND.name,
      url: BRAND.siteUrl,
      type: "website",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: `${BRAND.name} — Análise Fundamental de Ações`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${BRAND.name} — Análise Fundamental de Ações`,
      description:
        "Vê o valor que os outros não veem. Fundamentais de 10 anos, DCF e Analista IA, em português.",
      images: ["/opengraph-image"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Permite zoom do utilizador (acessibilidade) — não desativar.
  // Tema segue a classe `.dark` (não prefers-color-scheme): o script anti-FOUC
  // e lib/theme.ts atualizam este meta com as cores reais paper/night.
  themeColor: "#fafaf7",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }
  const messages = await getMessages();
  const cookieStore = await cookies();

  return (
    <html
      lang={locale}
      className={`${scotchDisplay.variable} ${sfUIText.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Preconnect para acelerar o download dos logos da Finnhub */}
        <link rel="preconnect" href="https://static2.finnhub.io" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://static2.finnhub.io" />

        {/* Schema.org — WebSite: permite ao Google mostrar "BullValue" como Site
            Name nos resultados de pesquisa (o nome pequeno por cima do URL).
            Organization: fornece contexto de marca para rich results e Knowledge Panel. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: BRAND.name,
                url: BRAND.siteUrl,
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: `${BRAND.siteUrl}/explore?q={search_term_string}`,
                  },
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: BRAND.name,
                url: BRAND.siteUrl,
                logo: `${BRAND.siteUrl}${BRAND.logoSrc}`,
                sameAs: [
                  "https://www.instagram.com/thebullocracy",
                ],
              },
            ]),
          }}
        />

        {/* Tema anti-FOUC inlined para evitar render-blocking. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=localStorage.getItem("theme")==="dark";if(d)document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"#100f0d":"#fafaf7")}catch(e){}})();`,
          }}
        />

        
      </head>
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <NextIntlClientProvider messages={messages}>
          <PaddleProvider>
            <main className="flex-1 flex flex-col">{children}</main>
          </PaddleProvider>
          <CookieConsent
            initialConsent={cookieStore.get("cookie_consent")?.value === "true"}
            showInitialBanner={cookieStore.get("cookie_consent") === undefined}
          />
          <PulseTracker />
          {/* Painel de design ao vivo — ver a definição no topo do ficheiro. */}
          <TweakPanel />
        </NextIntlClientProvider>
        {/* GA NÃO é montado aqui: é carregado pelo <CookieConsent> só APÓS
            consentimento (RGPD) — montá-lo aqui disparava GA antes/sem
            consentimento (ilegal na UE) e em duplicado. */}
      </body>
    </html>
  );
}
