import { notFound } from "next/navigation";

import { LogoWall, type WallCompany } from "@/components/marketing/heroes/LogoWall";
import { CTA, Peek } from "@/components/marketing/heroes/shared";
import { prisma } from "@/lib/prisma";

/** /preview-4 — "A parede de 500": a cobertura vista, não afirmada. */
export default async function Preview4() {
  if (process.env.NODE_ENV !== "development") notFound();

  const rows = await prisma.company.findMany({
    where: { logoUrl: { not: null }, isActive: true },
    select: { ticker: true, name: true, logoUrl: true },
    orderBy: { ticker: "asc" },
    take: 500,
  });

  // Market cap depende do preço e NUNCA se guarda na BD (CLAUDE.md §5). Aqui
  // não temos preço, por isso o cartão mostra só nome e ticker — melhor do que
  // um valor inventado ou desactualizado.
  const companies: WallCompany[] = rows.map((c) => ({
    ticker: c.ticker,
    name: c.name,
    logoUrl: c.logoUrl,
    marketCap: null,
  }));

  if (!companies.length) notFound();

  return (
    <section className="px-6 py-20 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="max-w-[16ch] text-balance text-5xl font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-6xl md:text-7xl">
          <span className="nums tabular-nums">{companies.length}</span> empresas.
          <br />
          <span className="text-primary">Todas com dez anos de história.</span>
        </h1>
        <p className="mt-8 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
          Não é uma promessa de cobertura — são as empresas que já estão lá dentro, com os
          fundamentais retirados dos filings da SEC.
        </p>

        <div className="mt-14">
          <LogoWall companies={companies} />
        </div>

        <div className="mt-14 flex flex-col gap-3 sm:flex-row">
          <CTA>Criar conta grátis</CTA>
          <Peek />
        </div>
      </div>
    </section>
  );
}
