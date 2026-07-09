"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  SearchCode,
  Briefcase,
  CalendarDays,
  Calculator,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LiquidGlass } from "@/components/fx/LiquidGlass";

/**
 * MobileDock — dock Liquid Glass no fundo do ecrã (só mobile),
 * ao estilo iOS: os 5 destinos primários sempre à distância do polegar.
 */
export function MobileDock() {
  const pathname = usePathname();
  const t = useTranslations("sidebar");

  const items = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("dashboard") },
    { href: "/explore", icon: SearchCode, label: t("explore") },
    { href: "/portfolio", icon: Briefcase, label: t("portfolio") },
    { href: "/calendar", icon: CalendarDays, label: t("calendar") },
    { href: "/dcf", icon: Calculator, label: t("dcf") },
  ];

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex justify-center md:hidden">
      <LiquidGlass className="flex h-16 w-full max-w-md items-center justify-around rounded-3xl px-2">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </LiquidGlass>
    </div>
  );
}
