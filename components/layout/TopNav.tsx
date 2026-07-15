"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  SearchCode,
  Briefcase,
  Star,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { logout } from "@/app/(auth)/actions";
import { useIsMac } from "@/hooks/useIsMac";

/** Iniciais para o avatar: 2 letras do nome (ex: "Alex Martins" → "AM"). */
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase()
}

/**
 * TopNav — a navegação ÚNICA do terminal: uma pill Liquid Glass
 * flutuante (o conteúdo dobra-se nas bordas ao passar por baixo).
 * Substitui sidebar + header: 6 destinos primários, ⌘K universal,
 * menu de avatar (conta/comparar/transcrições/definições/logout).
 */
export function TopNav({
  userName,
  userEmail,
  plan,
}: {
  userName?: string | null;
  userEmail?: string | null;
  plan?: string | null;
}) {
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const tHeader = useTranslations("header");
  const [cmdOpen, setCmdOpen] = useState(false);
  // controlado: fecha ao navegar (os Links portalados não fechavam o popover)
  const [menuOpen, setMenuOpen] = useState(false);
  const isMac = useIsMac();

  const primary = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("dashboard") },
    { href: "/explore", icon: SearchCode, label: t("explore") },
    { href: "/portfolio", icon: Briefcase, label: t("portfolio") },
    { href: "/watchlist", icon: Star, label: t("watchlist") },
    { href: "/calendar", icon: CalendarDays, label: t("calendar") },
    // rótulo curto na nav (o título da página continua "Calculadora DCF")
    { href: "/dcf", icon: Calculator, label: t("dcfShort") },
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
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span className="hidden whitespace-nowrap lg:inline">{label}</span>
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

          <ThemeToggle />

          {/* menu de perfil: avatar de iniciais + conta, links e logout */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  title={userName || t("more")}
                  aria-label={userName || t("more")}
                  className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-extrabold leading-none text-primary transition-colors hover:bg-primary/20"
                >
                  {userName ? initials(userName) : <MoreHorizontal className="h-5 w-5" />}
                </button>
              }
            />
            {/* positionMethod fixed: o trigger vive numa pill fixed — com o
                default (absolute) o popup deslizava com o scroll da página */}
            <PopoverContent align="end" positionMethod="fixed" className="w-64 p-1.5">
              {userName && (
                <div className="mb-1 border-b border-border/60 pb-1.5">
                  {/* o cartão do perfil também leva às Definições (atalho) */}
                  <Link
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="group/profile flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent active:scale-[0.98]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-xs font-extrabold leading-none text-primary">
                      {initials(userName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover/profile:text-primary">{userName}</p>
                      {userEmail && (
                        <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
                      )}
                    </div>
                    {plan && (
                      <span className="ml-auto shrink-0 rounded-full border border-bull/20 bg-bull/10 px-2 py-0.5 text-[10px] font-bold text-bull">
                        {plan}
                      </span>
                    )}
                  </Link>
                </div>
              )}
              {overflow.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
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
              <form action={logout} onSubmit={() => setMenuOpen(false)}>
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
