import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { BRAND } from "@/lib/brand";
import { PaddleProvider } from "@/components/providers/PaddleProvider";

const scotchDisplay = localFont({
  variable: "--font-heading",
  display: "swap",
  src: [
    { path: "../public/fonts/scotch-display/ScotchDisplay-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../public/fonts/scotch-display/ScotchDisplay-SemiBoldItalic.ttf", weight: "600", style: "italic" },
    { path: "../public/fonts/scotch-display/ScotchDisplay-Bold.ttf", weight: "700", style: "normal" },
    { path: "../public/fonts/scotch-display/ScotchDisplay-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
});

const sfUIText = localFont({
  variable: "--font-sans",
  display: "swap",
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
    "BullMetrics",
    "análise fundamental de ações",
    "calculadora DCF",
    "value investing",
    "avaliação de empresas",
    "stock valuation",
    "DCF metrics investing",
    "intrinsic value",
    "análise financeira",
  ],
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
        {/* Tema: claro por defeito, escuro persistido — script inline CRU (não
            next/script: beforeInteractive não garante execução antes do 1.º
            paint no App Router, o que causava flash branco em dark mode). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var d=localStorage.getItem('theme')==='dark';if(d)document.documentElement.classList.add('dark');var m=document.querySelector('meta[name=\"theme-color\"]');if(m)m.setAttribute('content',d?'#100f0d':'#fafaf7')}catch(e){}})()",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <NextIntlClientProvider messages={messages}>
          <PaddleProvider>
            <main className="flex-1 flex flex-col">{children}</main>
          </PaddleProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
