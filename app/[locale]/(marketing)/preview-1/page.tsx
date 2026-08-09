import { notFound } from "next/navigation";

import { CountingNumber } from "@/components/marketing/heroes/CountingNumber";
import { CTA, Peek, appleRevenue } from "@/components/marketing/heroes/shared";

/** /preview-1 — "O número que se constrói": o valor sobe e o ano corre. */
export default async function Preview1() {
  if (process.env.NODE_ENV !== "development") notFound();
  const years = await appleRevenue();
  if (!years.length) notFound();
  const growth = (years[years.length - 1].revenue / years[0].revenue - 1) * 100;

  return (
    <section className="relative flex min-h-[calc(100svh-4rem)] flex-col justify-center px-6 pt-20 md:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <CountingNumber years={years} />

        <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-border pt-6">
          <span className="nums text-2xl font-bold tabular-nums sm:text-3xl">
            +{growth.toFixed(0)}%
            <span className="ml-2 text-base font-normal text-muted-foreground">
              desde {years[0].year}
            </span>
          </span>
          <span className="text-base text-muted-foreground">
            {years.length} anos · {years.length * 4} trimestres · zero folhas de cálculo
          </span>
        </div>

        <h1 className="mt-12 max-w-[22ch] text-balance text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-5xl">
          Estes números existem para toda a gente.
          <br />
          <span className="text-primary">Nós só os pusemos a fazer sentido.</span>
        </h1>

        <div className="mt-10 flex flex-col gap-3 pb-12 sm:flex-row">
          <CTA>Criar conta grátis</CTA>
          <Peek />
        </div>
      </div>
    </section>
  );
}
