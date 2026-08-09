"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS } from "./shared";

/**
 * Filtros por categoria em links, não em estado de cliente — mantém a página
 * server-rendered e torna cada filtro partilhável por URL.
 */
export function NewsFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("categoria");

  const href = (categoria: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (categoria) params.set("categoria", categoria);
    else params.delete("categoria");
    params.delete("cursor"); // trocar de filtro recomeça a paginação
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const chip = (isActive: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
      isActive
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
    );

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={href(null)} className={chip(!active)} scroll={false}>
        Tudo
      </Link>
      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
        <Link key={key} href={href(key)} className={chip(active === key)} scroll={false}>
          {label}
        </Link>
      ))}
    </div>
  );
}
