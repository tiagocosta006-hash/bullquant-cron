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
              process.env.NODE_ENV === 'production'
                ? "script-src 'self' 'unsafe-inline' https://cdn.paddle.com https://public.profitwell.com https://www.googletagmanager.com https://connect.facebook.net"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com https://public.profitwell.com https://www.googletagmanager.com https://connect.facebook.net",
              "style-src 'self' 'unsafe-inline' https://cdn.paddle.com",
              // Os logos são servidos diretamente ao browser (otimizador desligado), e
      // static2.finnhub.io responde 302 para static9.finnhub.io. O CSP é
      // reavaliado em cada redirect, por isso o allowlist tem de cobrir o
      // domínio inteiro — a Finnhub roda o número do host sem aviso.
      "img-src 'self' data: blob: https://*.finnhub.io https://*.supabase.co https://*.googleusercontent.com https://avatars.githubusercontent.com https://www.facebook.com",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://*.paddle.com https://public.profitwell.com https://www.google-analytics.com https://www.facebook.com https://connect.facebook.net",
              "frame-src 'self' https://paddle.com https://*.paddle.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
};

export default withNextIntl(nextConfig);
