import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { PulseTracker } from "@/components/pulse/PulseTracker";
import { BRAND } from "@/lib/brand";
import { PaddleProvider } from "@/components/providers/PaddleProvider";
import { CookieConsent } from "@/components/layout/CookieConsent";

const scotchDisplay = localFont({
  variable: "--font-heading",
  // Serif só de display (momentos grandes): swap para aparecer quando usada;
  // sem preload por não ser a fonte primária.
  display: "swap",
  preload: false,
  src: [
    { path: "../public/fonts/scotch-display/ScotchDisplay-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../public/fonts/scotch-display/ScotchDisplay-SemiBoldItalic.ttf", weight: "600", style: "italic" },
    { path: "../public/fonts/scotch-display/ScotchDisplay-Bold.ttf", weight: "700", style: "normal" },
    { path: "../public/fonts/scotch-display/ScotchDisplay-BoldItalic.ttf", weight: "700", style: "italic" },
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
    { path: "../public/fonts/sf-ui-text/SFUIText-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/sf-ui-text/SFUIText-LightItalic.woff2", weight: "300", style: "italic" },
    { path: "../public/fonts/sf-ui-text/SFUIText-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/sf-ui-text/SFUIText-RegularItalic.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/sf-ui-text/SFUIText-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/sf-ui-text/SFUIText-MediumItalic.woff2", weight: "500", style: "italic" },
    { path: "../public/fonts/sf-ui-text/SFUIText-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/sf-ui-text/SFUIText-SemiboldItalic.woff2", weight: "600", style: "italic" },
    { path: "../public/fonts/sf-ui-text/SFUIText-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/sf-ui-text/SFUIText-BoldItalic.woff2", weight: "700", style: "italic" },
    { path: "../public/fonts/sf-ui-text/SFUIText-Heavy.woff2", weight: "800", style: "normal" },
    { path: "../public/fonts/sf-ui-text/SFUIText-HeavyItalic.woff2", weight: "800", style: "italic" },
  ],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title: {
    default: `${BRAND.name} — Análise Fundamental de Ações`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    "Análise fundamental de ações com 10 anos de dados, DCF integrada e AI Insights. Em português, gratuito. Uma plataforma Bullocracy.",
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
    canonical: BRAND.siteUrl,
  },
  openGraph: {
    title: `${BRAND.name} — Análise Fundamental de Ações`,
    description:
      "Vê o valor que os outros não veem. Fundamentais de 10 anos, DCF e AI Insights, em português.",
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
      "Vê o valor que os outros não veem. Fundamentais de 10 anos, DCF e AI Insights, em português.",
    images: ["/opengraph-image"],
  },
};

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
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();
  // Obtém o idioma que foi resolvido (por IP, browser ou cookie) no ficheiro request.ts
  const { getLocale } = await import('next-intl/server');
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${scotchDisplay.variable} ${sfUIText.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Tema anti-FOUC: ficheiro externo render-blocking (public/theme-init.js).
            Corre síncrono antes do body → sem flash; externo (src) em vez de
            inline → sem o warning do React 19 sobre scripts como filhos.
            O bloqueio síncrono é DELIBERADO (evitar FOUC), daí o disable. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <NextIntlClientProvider messages={messages}>
          <PaddleProvider>
            <main className="flex-1 flex flex-col">{children}</main>
          </PaddleProvider>
          <CookieConsent />
        </NextIntlClientProvider>
        <PulseTracker />
        {/* GA NÃO é montado aqui: é carregado pelo <CookieConsent> só APÓS
            consentimento (RGPD) — montá-lo aqui disparava GA antes/sem
            consentimento (ilegal na UE) e em duplicado. */}
      </body>
    </html>
  );
}
