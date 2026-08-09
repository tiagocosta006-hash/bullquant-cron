import { Link } from "@/i18n/routing";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Botões partilhados pelas 5 rotas de preview.
 *
 * ⚠️ COPY HARDCODED, e só nestas rotas de desenvolvimento. A regra do projeto
 * é i18n (CLAUDE.md §7); traduzir cinco conjuntos de copy que vão ser deitados
 * fora não faz sentido. A direção vencedora passa para messages/ e isto morre.
 */
export const CTA = ({ children }: { children: React.ReactNode }) => (
  <Link
    href="/register"
    className={cn(buttonVariants({ size: "lg" }), "pressable min-h-13 px-8 text-base font-semibold")}
  >
    {children}
  </Link>
);

export const Peek = () => (
  <Link
    href="/stock/AAPL"
    className={cn(buttonVariants({ size: "lg", variant: "outline" }), "pressable min-h-13 px-8 text-base")}
  >
    Ver a Apple sem conta
  </Link>
);

/** 10 anos de receita anual da Apple, da nossa BD. Partilhado por 3 rotas. */
export async function appleRevenue() {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.fundamental.findMany({
    where: { company: { ticker: "AAPL" }, periodType: "ANNUAL", revenue: { not: null } },
    orderBy: { fiscalYear: "asc" },
    select: { fiscalYear: true, revenue: true },
    take: 10,
  });
  return rows.map((r) => ({ year: r.fiscalYear, revenue: Number(r.revenue) }));
}
