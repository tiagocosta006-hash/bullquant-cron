import { notFound } from "next/navigation";

import { LiveDcf } from "@/components/marketing/heroes/LiveDcf";
import { CTA, Peek } from "@/components/marketing/heroes/shared";
import { prisma } from "@/lib/prisma";

/** /preview-5 — "A pergunta": a DCF real a correr-se a si própria. */
export default async function Preview5() {
  if (process.env.NODE_ENV !== "development") notFound();

  const f = await prisma.fundamental.findFirst({
    where: {
      company: { ticker: "AAPL" },
      periodType: "ANNUAL",
      freeCashFlow: { not: null },
      sharesOutstanding: { not: null },
    },
    orderBy: { fiscalYear: "desc" },
    select: { freeCashFlow: true, sharesOutstanding: true, totalDebt: true, cash: true },
  });
  const price = await prisma.price.findFirst({
    where: { ticker: "AAPL" },
    orderBy: { date: "desc" },
    select: { close: true },
  });

  // Sem dados não se mostra: o argumento desta direção é que o cálculo é real.
  if (!f || !price) notFound();

  const netDebt = Number(f.totalDebt ?? 0) - Number(f.cash ?? 0);

  return (
    <section className="flex min-h-[calc(100svh-4rem)] items-center px-6 py-20 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="max-w-[14ch] text-balance text-5xl font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-7xl md:text-8xl">
          Quanto vale <span className="text-primary">mesmo</span> a Apple?
        </h1>

        <div className="mt-12">
          <LiveDcf
            fcf0={Number(f.freeCashFlow)}
            shares={Number(f.sharesOutstanding)}
            netDebt={netDebt}
            currentPrice={Number(price.close)}
            ticker="AAPL"
          />
        </div>

        <p className="mt-10 text-xl font-semibold sm:text-2xl">
          Discordas? <span className="text-primary">Muda os números tu.</span>
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <CTA>Criar conta grátis</CTA>
          <Peek />
        </div>
      </div>
    </section>
  );
}
