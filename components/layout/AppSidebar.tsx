"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, CalendarDays, Calculator, MessageSquareText, LayoutDashboard, PanelLeftClose, PanelLeftOpen, SearchCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { Logo } from '@/components/brand/Logo';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useRecentSearches } from '@/hooks/useRecentSearches';

export function AppSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { recentSearches } = useRecentSearches();
  const t = useTranslations('sidebar');

  const links = [
    { href: '/dashboard', icon: LayoutDashboard, label: t('dashboard'), desc: t('desc.dashboard') },
    { href: '/screener', icon: SearchCode, label: t('screener'), desc: t('desc.screener') },
    { href: '/portfolio', icon: Briefcase, label: t('portfolio'), desc: t('desc.portfolio') },
    { href: '/calendar', icon: CalendarDays, label: t('calendar'), desc: t('desc.calendar') },
    { href: '/dcf', icon: Calculator, label: t('dcf'), desc: t('desc.dcf') },
    { href: '/transcripts', icon: MessageSquareText, label: t('transcripts'), desc: t('desc.transcripts') },
  ];

  return (
    <aside 
      className={cn(
        "border-r border-sidebar-border bg-sidebar flex-col h-full hidden md:flex shrink-0 transition-all duration-300",
        isCollapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className={cn("h-16 flex items-center border-b border-sidebar-border/60 shrink-0", isCollapsed ? "justify-center px-0" : "px-5")}>
        {!isCollapsed ? (
          <Logo href="/dashboard" size="md" />
        ) : (
          <Link href="/dashboard" className="flex items-center justify-center">
            <span className="h-8 w-8 rounded-md bg-primary/20 flex items-center justify-center text-primary font-bold">B</span>
          </Link>
        )}
      </div>

      <TooltipProvider delay={200}>
        <nav className="flex-1 py-5 px-3 flex flex-col overflow-y-auto">
          <div className="space-y-1">
            {links.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
              const Icon = link.icon;
              return (
                <Tooltip key={link.href}>
                  <TooltipTrigger
                    render={
                      <Link
                        href={link.href}
                        className={cn(
                          "group relative flex items-center rounded-lg text-sm font-medium transition-colors",
                          isCollapsed ? "justify-center py-3 px-0" : "gap-3 px-3 py-2.5",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        {/* Active gold rail */}
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary transition-opacity",
                            isActive ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <Icon className={cn("shrink-0 transition-colors", isCollapsed ? "h-6 w-6" : "h-5 w-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={2} />
                        {!isCollapsed && <span>{link.label}</span>}
                      </Link>
                    }
                  />
                  <TooltipContent side="right" className="max-w-[220px]">
                    {link.desc}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <div className="mt-8 space-y-2">
              {!isCollapsed && (
                <h4 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
                  {t('recentSearches')}
                </h4>
              )}
              {recentSearches.map((search) => (
                <Tooltip key={search.ticker}>
                  <TooltipTrigger
                    render={
                      <Link
                        href={`/stock/${search.ticker}`}
                        className={cn(
                          "group flex items-center rounded-lg text-sm font-medium transition-colors",
                          isCollapsed ? "justify-center py-2 px-0" : "gap-3 px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        {search.logoUrl ? (
                          <img src={search.logoUrl} alt={search.ticker} className={cn("shrink-0 rounded bg-white p-0.5 object-contain", isCollapsed ? "w-6 h-6" : "w-5 h-5")} />
                        ) : (
                          <div className={cn("shrink-0 rounded flex items-center justify-center bg-muted text-[10px] font-bold text-muted-foreground border border-border/50", isCollapsed ? "w-6 h-6" : "w-5 h-5")}>
                            {search.ticker.substring(0, 2)}
                          </div>
                        )}
                        {!isCollapsed && <span className="truncate">{search.ticker}</span>}
                      </Link>
                    }
                  />
                  {isCollapsed && (
                    <TooltipContent side="right">
                      {search.name} ({search.ticker})
                    </TooltipContent>
                  )}
                </Tooltip>
              ))}
            </div>
          )}
        </nav>
      </TooltipProvider>

      {/* Footer */}
      <div className={cn("py-4 border-t border-sidebar-border/60 shrink-0 flex items-center", isCollapsed ? "flex-col gap-4 px-2" : "justify-between px-5")}>
        {!isCollapsed && (
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
            <span className="h-1 w-1 rounded-full bg-primary/70" />
            by {BRAND.parent}
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            isCollapsed && "mx-auto"
          )}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
