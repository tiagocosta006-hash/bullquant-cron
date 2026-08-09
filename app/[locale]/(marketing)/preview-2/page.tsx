import { notFound } from "next/navigation";

import { FilingToChart } from "@/components/marketing/heroes/FilingToChart";
import { CTA, Peek, appleRevenue } from "@/components/marketing/heroes/shared";

/**
 * /preview-2 — "A folha que se dobra".
 * Hero sóbrio em cima; a transformação 10-K → gráfico vive ABAIXO, onde o
 * momento "ah, percebi" funciona (já se sabe o que é o produto).
 */
export default async function Preview2() {
  if (process.env.NODE_ENV !== "development") notFound();
  const years = await appleRevenue();
  if (!years.length) notFound();

  return (
    <>
      <section className="flex min-h-[76svh] items-center px-6 md:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="max-w-[16ch] text-balance text-5xl font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-7xl md:text-8xl">
            Análise fundamental a sério.
            <br />
            <span className="text-primary">Em português. De graça.</span>
          </h1>
          <p className="mt-8 max-w-[52ch] text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Dez anos de fundamentais da SEC, uma DCF que se autopreenche e um Analista IA que cita a
            fonte.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <CTA>Criar conta grátis</CTA>
            <Peek />
          </div>
        </div>
      </section>

      <FilingToChart years={years} />
    </>
  );
}
