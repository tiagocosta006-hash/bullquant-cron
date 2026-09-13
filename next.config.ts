import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  experimental: {
    optimizeCss: true,
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.finnhub.io',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // ⚠️ Ao reactivar vendas próprias (VENDAS_PROPRIAS_ATIVAS em
              // components/providers/PaddleProvider.tsx) é preciso repor aqui
              // https://cdn.paddle.com em script-src e style-src,
              // https://*.paddle.com em connect-src e
              // https://paddle.com https://*.paddle.com em frame-src —
              // senão o script fica bloqueado pelo CSP e o checkout não abre.
              //
              // Saíram também o Google Tag Manager, o Google Analytics e o
              // ProfitWell: nenhum dos três é carregado por código nenhum
              // desta aplicação. Um domínio no allowlist que não se usa é só
              // superfície de ataque a mais — é exactamente por onde um script
              // injectado exfiltra dados sem violar a política.
              //
              // O Facebook fica: o MetaPixel é montado a sério, pelo
              // CookieConsent, depois de o visitante aceitar.
              process.env.NODE_ENV === 'production'
                ? "script-src 'self' 'unsafe-inline' https://connect.facebook.net"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net",
              "style-src 'self' 'unsafe-inline'",
              // Os logos são servidos diretamente ao browser (otimizador desligado), e
      // static2.finnhub.io responde 302 para static9.finnhub.io. O CSP é
      // reavaliado em cada redirect, por isso o allowlist tem de cobrir o
      // domínio inteiro — a Finnhub roda o número do host sem aviso.
      "img-src 'self' data: blob: https://*.finnhub.io https://*.supabase.co https://*.googleusercontent.com https://avatars.githubusercontent.com https://www.facebook.com",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://www.facebook.com https://connect.facebook.net",
              "frame-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
};

export default withNextIntl(nextConfig);
