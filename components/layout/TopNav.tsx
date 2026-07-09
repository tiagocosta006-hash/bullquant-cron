"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  SearchCode,
  Briefcase,
  CalendarDays,
  Calculator,
  MessageSquareText,
  GitCompareArrows,
  MoreHorizontal,
  Search,
  Settings,
  LogOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { CommandMenu } from "@/components/layout/CommandMenu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { logout } from "@/app/(auth)/actions";
import { useIsMac } from "@/hooks/useIsMac";

/**
 * TopNav — a navegação ÚNICA do terminal: uma pill Liquid Glass
 * flutuante (o conteúdo dobra-se nas bordas ao passar por baixo).
 * Substitui sidebar + header: 5 destinos primários, ⌘K universal,
 * overflow (comparar/transcrições/definições) num popover.
 */
export function TopNav({
  userName,
  devSlot,
}: {
  userName?: string | null;
  devSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const tHeader = useTranslations("header");
  const [cmdOpen, setCmdOpen] = useState(false);
  const isMac = useIsMac();

  const primary = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("dashboard") },
    { href: "/explore", icon: SearchCode, label: t("explore") },
    { href: "/portfolio", icon: Briefcase, label: t("portfolio") },
    { href: "/calendar", icon: CalendarDays, label: t("calendar") },
    { href: "/dcf", icon: Calculator, label: t("dcf") },
  ];
  const overflow = [
    { href: "/compare", icon: GitCompareArrows, label: t("compare") },
    { href: "/transcripts", icon: MessageSquareText, label: t("transcripts") },
    { href: "/settings", icon: Settings, label: tHeader("settingsTitle") },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className="fixed inset-x-3 top-3 z-50 flex justify-center">
        <LiquidGlass className="flex h-14 w-full max-w-6xl items-center gap-1 rounded-full px-3 md:px-4">
          <Logo href="/dashboard" size="sm" className="mr-2 hidden sm:flex" />
          <Logo href="/dashboard" size="sm" iconOnly className="mr-1 sm:hidden" />

          {/* destinos primários (desktop) */}
          <nav className="hidden items-center gap-0.5 md:flex">
            {primary.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={label}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  isActive(href)
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          {/* pesquisa universal ⌘K */}
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Search className="h-4 w-4" />
            <span className="hidden md:inline">{t("searchAction")}</span>
            <span className="hidden rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold md:inline">
              {isMac ? "⌘K" : "Ctrl K"}
            </span>
          </button>

          {devSlot}
          <ThemeToggle />

          {/* overflow: comparar, transcrições, definições */}
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon" title={t("more")}>
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-56 p-1.5">
              {userName && (
                <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  {userName}
                </div>
              )}
              {overflow.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(href)
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  {tHeader("logoutTitle")}
                </button>
              </form>
            </PopoverContent>
          </Popover>
        </LiquidGlass>
      </div>

      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}
