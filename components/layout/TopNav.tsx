"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Link } from '@/i18n/routing';

import {
  Activity,
  Briefcase,
  LayoutDashboard,
  SearchCode,
  Star,
  CalendarDays,
  Calculator,
  MessageSquareText,
  GitCompareArrows,
  MoreHorizontal,
  Search,
  Settings,
  LogOut,
  Zap,
  TrendingUp,
  Newspaper,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn, userInitials } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { CommandMenu } from "@/components/layout/CommandMenu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { logout } from "@/app/[locale]/(auth)/actions";
import { useIsMac } from "@/hooks/useIsMac";
import { usePathname } from '@/i18n/routing';

/**
 * completo: nomes inteiros · curto: "MIC" em vez de "Portefólio MIC" ·
 * apertado: curto, links mais justos e a pesquisa só com a lupa · icones.
 */
type Modo = "completo" | "curto" | "apertado" | "icones";
/** Do mais rico para o mais compacto: o primeiro que couber ganha. */
const MODOS: Modo[] = ["completo", "curto", "apertado", "icones"];
const LINK_BASE =
  "flex items-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors";
const linkPad = (modo: Modo | null) => (modo === "apertado" ? "px-2" : "px-2.5");
const PESQUISA =
  "flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground";

function rotulo(label: string, curto: string | undefined, modo: Modo | null) {
  // Antes de medir (HTML do servidor): o comportamento antigo por breakpoints.
  if (modo === null) {
    return curto ? (
      <>
        <span className="hidden whitespace-nowrap xl:inline min-[1500px]:hidden">{curto}</span>
        <span className="hidden whitespace-nowrap min-[1500px]:inline">{label}</span>
      </>
    ) : <span className="hidden whitespace-nowrap xl:inline">{label}</span>;
  }
  if (modo === "icones") return null;
  const texto = modo !== "completo" && curto ? curto : label;
  return <span className="whitespace-nowrap">{texto}</span>;
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
  devSlot,
  isAdmin,
}: {
  userName?: string | null;
  userEmail?: string | null;
  plan?: string | null;
  devSlot?: React.ReactNode;
  /** mostra o link para o dashboard de analytics (Pulse) — a página re-verifica sempre */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const tHeader = useTranslations("header");
  const [cmdOpen, setCmdOpen] = useState(false);
  // controlado: fecha ao navegar (os Links portalados não fechavam o popover)
  const [menuOpen, setMenuOpen] = useState(false);
  const isMac = useIsMac();

  const primary: { href: string; icon: typeof Briefcase; label: string; short?: string }[] = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("dashboard") },
    { href: "/explore", icon: SearchCode, label: t("explore") },
    { href: "/mic", icon: Briefcase, label: t("mic"), short: t("micShort") },
    // /portfolio e /macro fora do menu para já (pedido do Costa). As páginas
    // continuam a responder por URL — é só o menu que não as anuncia.
    { href: "/watchlist", icon: Star, label: t("watchlist") },
    { href: "/calendar", icon: CalendarDays, label: t("calendar") },
    { href: "/news", icon: Newspaper, label: "Notícias" },
    // calculadoras em destaque
    { href: "/dcf", icon: Calculator, label: t("dcfShort") },
    { href: "/compound", icon: TrendingUp, label: t("compound") },
  ];
  const overflow = [
    { href: "/settings", icon: Settings, label: tHeader("settingsTitle") },
    ...(isAdmin ? [{ href: "/analytics", icon: Activity, label: t("analytics") }] : []),
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Modo dos rótulos: o mais rico que cabe no espaço livre (medido, não adivinhado).
  const navRef = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [modo, setModo] = useState<Modo | null>(null);
  const pesquisaRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const spacer = spacerRef.current;
    const pesquisa = pesquisaRef.current;
    const barra = nav?.parentElement;
    if (!nav || !spacer || !pesquisa || !barra) return;
    const reguas = barra.querySelectorAll<HTMLElement>("[data-modo]");
    const cheia = barra.querySelector<HTMLElement>('[data-pesquisa="cheia"]');
    const lupa = barra.querySelector<HTMLElement>('[data-pesquisa="lupa"]');
    const escolher = () => {
      if (getComputedStyle(nav).display === "none") return; // mobile: usa a dock
      // Espaço livre como se a pesquisa estivesse por extenso (mede-se o botão
      // real, não o estado: entre um setModo e o commit o DOM ainda é o antigo),
      // e quanto se ganha com ela só com a lupa.
      const larguraCheia = cheia?.offsetWidth ?? pesquisa.offsetWidth;
      const ganho = Math.max(0, larguraCheia - (lupa?.offsetWidth ?? larguraCheia));
      const livre = nav.clientWidth + spacer.clientWidth + pesquisa.offsetWidth - larguraCheia;
      let melhor: Modo = "icones";
      for (const r of reguas) {
        const m = r.dataset.modo as Modo;
        if (r.scrollWidth <= livre + (m === "apertado" ? ganho : 0)) { melhor = m; break; }
      }
      setModo((atual) => (atual === melhor ? atual : melhor));
    };
    escolher();
    const ro = new ResizeObserver(escolher);
    ro.observe(barra);
    ro.observe(spacer); // controlos da direita a mudar (Upgrade, sessão, fontes)
    for (const r of reguas) ro.observe(r); // fontes a carregar mudam as larguras
    if (cheia) ro.observe(cheia);
    return () => ro.disconnect();
  }, [plan, userEmail]);

  return (
    <>
      <div className="fixed inset-x-3 top-3 z-50 flex justify-center">
        <LiquidGlass className="flex h-14 w-full max-w-7xl items-center gap-1 rounded-full px-3 md:px-4">
          <Logo href="/dashboard" size="sm" className="mr-2 hidden sm:flex" />
          <Logo href="/dashboard" size="sm" iconOnly className="mr-1 sm:hidden" />

          {/* Destinos primários (desktop).
              O espaço livre depende da largura, do plano (Upgrade), de haver
              sessão (Entrar/Criar conta) e do tamanho do texto. Em vez de
              adivinhar breakpoints — com o Portefólio MIC a lista deixou de
              caber e o fim (Calculadora DCF, Juros Compostos) ficava cortado —
              mede-se: nomes completos → "MIC" curto → só ícones, o primeiro
              que cabe. O overflow-hidden fica só como rede de segurança. */}
          <nav
            ref={navRef}
            className="hidden min-w-0 items-center gap-0.5 overflow-hidden md:flex"
          >
            {primary.map(({ href, icon: Icon, label, short }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={label}
                className={cn(
                  LINK_BASE,
                  linkPad(modo),
                  isActive(href)
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                {rotulo(label, short, modo)}
              </Link>
            ))}
          </nav>

          {/* Réguas invisíveis: a largura de cada modo, para escolher o que cabe. */}
          <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 -z-10 h-0 overflow-hidden">
            {MODOS.map((m) => (
              <div key={m} data-modo={m} className="flex w-max items-center gap-0.5">
                {primary.map(({ href, icon: Icon, label, short }) => (
                  <span key={href} className={cn(LINK_BASE, linkPad(m))}>
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {rotulo(label, short, m)}
                  </span>
                ))}
              </div>
            ))}
            <span data-pesquisa="cheia" className={cn(PESQUISA, "w-max")}>
              <Search className="h-4 w-4" />
              <span>{t("searchAction")}</span>
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold">{isMac ? "⌘K" : "Ctrl K"}</span>
            </span>
            <span data-pesquisa="lupa" className={cn(PESQUISA, "w-max")}>
              <Search className="h-4 w-4" />
            </span>
          </div>

          <div ref={spacerRef} className="min-w-0 flex-1" />

          {/* Botão de Upgrade para contas FREE */}
          {plan === "FREE" && (
            <Link
              href="/pricing"
              className="hidden shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20 hover:border-primary/50 md:flex mr-1"
              title="Dar Upgrade"
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              <span>Upgrade</span>
            </Link>
          )}

          {/* pesquisa universal ⌘K */}
          <button
            type="button"
            ref={pesquisaRef}
            onClick={() => setCmdOpen(true)}
            aria-label={t("searchAction")}
            title={modo === "apertado" ? t("searchAction") : undefined}
            className={PESQUISA}
          >
            <Search className="h-4 w-4" />
            <span className={cn("hidden", modo !== "apertado" && "md:inline")}>{t("searchAction")}</span>
            <span className={cn("hidden rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold", modo !== "apertado" && "md:inline")}>
              {isMac ? "⌘K" : "Ctrl K"}
            </span>
          </button>

          <ThemeToggle />

          {/* Auth ou Menu de Perfil */}
          {!userEmail ? (
            <div className="flex shrink-0 items-center gap-1.5 ml-1">
              <Link
                href="/login"
                className="hidden items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground sm:flex"
              >
                {tHeader("login")}
              </Link>
              <Link
                href="/pricing"
                className="flex items-center justify-center rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                {tHeader("createAccount")}
              </Link>
            </div>
          ) : (
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger
                title={userName || tHeader("settingsTitle")}
                aria-label={userName || tHeader("settingsTitle")}
                className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-extrabold leading-none text-primary transition-colors hover:bg-primary/20 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {userName ? userInitials(userName) : <MoreHorizontal className="h-5 w-5" />}
              </PopoverTrigger>
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
                        {userInitials(userName)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover/profile:text-primary">{userName}</p>
                        <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
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
          )}
        </LiquidGlass>
      </div>

      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}
