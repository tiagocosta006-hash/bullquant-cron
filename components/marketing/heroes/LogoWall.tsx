"use client";

import { useEffect, useState } from "react";

export type WallCompany = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  marketCap: string | null;
};

/**
 * A cobertura torna-se VISÍVEL em vez de afirmada: os logos reais de todas as
 * empresas em grelha densa. De vez em quando um acende-se e abre um cartão com
 * os números verdadeiros dessa empresa.
 *
 * "500 empresas" é uma frase que qualquer concorrente escreve. 500 logos reais
 * a preencher o ecrã não se falsifica sem ter a base de dados.
 */
export function LogoWall({ companies }: { companies: WallCompany[] }) {
  const withLogo = companies.filter((c) => c.logoUrl);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!withLogo.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // um destaque de cada vez, em índices aleatórios mas estáveis por ciclo
    let i = 0;
    const pick = () => {
      i = Math.floor(Math.random() * withLogo.length);
      setActive(i);
      window.setTimeout(() => setActive(null), 2400);
    };
    const first = window.setTimeout(pick, 900);
    const loop = window.setInterval(pick, 3600);
    return () => {
      clearTimeout(first);
      clearInterval(loop);
    };
  }, [withLogo.length]);

  const co = active !== null ? withLogo[active] : null;

  return (
    <div className="relative">
      {/* grelha densa — o número é o argumento, por isso os logos são
          pequenos de propósito: quer-se a MASSA, não cada um deles */}
      <div className="grid grid-cols-10 gap-1.5 sm:grid-cols-14 md:grid-cols-18 lg:grid-cols-22">
        {withLogo.map((c, i) => (
          <div
            key={c.ticker}
            className="aspect-square rounded-md border border-border/60 bg-card p-1 transition-opacity duration-300"
            style={{ opacity: active === null ? 0.55 : active === i ? 1 : 0.18 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.logoUrl!} alt="" className="h-full w-full rounded object-contain" />
          </div>
        ))}
      </div>

      {/* cartão do destacado — position absolute para não empurrar a grelha */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center transition-opacity duration-300"
        style={{ opacity: co ? 1 : 0 }}
        aria-hidden={!co}
      >
        {co ? (
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-6 py-4 shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={co.logoUrl!} alt="" className="h-12 w-12 rounded-lg object-contain" />
            <div>
              <p className="font-semibold">{co.name}</p>
              <p className="nums text-sm tabular-nums text-muted-foreground">
                {co.ticker}
                {co.marketCap ? ` · ${co.marketCap}` : ""}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
