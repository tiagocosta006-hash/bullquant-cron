"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  SearchCode,
  Briefcase,
  CalendarDays,
  Calculator,
  MessageSquareText,
  GitCompareArrows,
  Search,
  TrendingUp,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { CompanyLogo } from "@/components/ui/CompanyLogo";

interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  logoUrl?: string | null;
}

/**
 * CommandMenu — a pesquisa universal do terminal (⌘K / Ctrl+K).
 * Empresas (via /api/search), navegação e pesquisas recentes num só
 * sítio: é O ponto de entrada de tudo, por isso vive na TopNav.
 */
export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const t = useTranslations("sidebar");
  const tSearch = useTranslations("search");
  const { recentSearches, addSearch } = useRecentSearches();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  // Atalho global ⌘K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Pesquisa de empresas com debounce
  useEffect(() => {
    if (!query || query.length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(Array.isArray(data) ? data.slice(0, 8) : data.results?.slice(0, 8) ?? []);
        }
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      setQuery("");
      router.push(href);
    },
    [router, onOpenChange],
  );

  const goCompany = (c: SearchResult) => {
    addSearch({ ticker: c.ticker, name: c.name, exchange: c.exchange ?? "", logoUrl: c.logoUrl ?? null });
    go(`/stock/${c.ticker}`);
  };

  const nav = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("dashboard") },
    { href: "/explore", icon: SearchCode, label: t("explore") },
    { href: "/compare", icon: GitCompareArrows, label: t("compare") },
    { href: "/portfolio", icon: Briefcase, label: t("portfolio") },
    { href: "/calendar", icon: CalendarDays, label: t("calendar") },
    { href: "/dcf", icon: Calculator, label: t("dcf") },
    { href: "/transcripts", icon: MessageSquareText, label: t("transcripts") },
  ];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={tSearch("placeholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{tSearch("noResults")}</CommandEmpty>

        {results.length > 0 && (
          <CommandGroup heading={tSearch("companies")}>
            {results.map((c) => (
              // value inclui ticker + nome para o filtro do cmdk apanhar ambos
              <CommandItem key={c.ticker} value={`${c.ticker} ${c.name}`} onSelect={() => goCompany(c)}>
                {c.logoUrl ? (
                  <CompanyLogo src={c.logoUrl} alt="" fallback={c.ticker} size={20} className="rounded" imgClassName="p-0.5" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="nums font-semibold">{c.ticker}</span>
                <span className="truncate text-muted-foreground">{c.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!query && recentSearches.length > 0 && (
          <>
            <CommandGroup heading={t("recentSearches")}>
              {recentSearches.slice(0, 5).map((s) => (
                <CommandItem key={s.ticker} value={`recent-${s.ticker}`} onSelect={() => go(`/stock/${s.ticker}`)}>
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="nums font-semibold">{s.ticker}</span>
                  <span className="truncate text-muted-foreground">{s.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {!query && (
          <CommandGroup heading={t("navigate")}>
            {nav.map(({ href, icon: Icon, label }) => (
              <CommandItem key={href} value={href} onSelect={() => go(href)}>
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
