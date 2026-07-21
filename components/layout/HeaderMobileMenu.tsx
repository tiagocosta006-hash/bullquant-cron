"use client";

import Link from "next/link";
import { LogIn, Menu, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SearchBar } from "@/components/search/SearchBar";

/**
 * Menu mobile do header público (marketing) — abaixo de `lg` a SearchBar e
 * a nav ("Quem somos"/"Planos") deixam de caber na ilha; sem isto ficavam
 * inacessíveis em ecrãs pequenos (não existia nenhuma alternativa). Abaixo
 * de `md` o Login também sai do header (Logo+hamburger+tema+Login+CTA não
 * cabiam numa linha em telemóveis) — vive aqui para users deslogados.
 * Começar grátis é o único CTA que fica sempre visível no header.
 */
export function HeaderMobileMenu({
  isLoggedIn,
  labels,
}: {
  isLoggedIn: boolean;
  labels: { menuTitle: string; openMenu: string; about: string; pricing: string; login: string };
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label={labels.openMenu} />
        }
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="glass glass-frost border-0">
        <SheetHeader>
          <SheetTitle>{labels.menuTitle}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <SearchBar isLoggedIn={isLoggedIn} />
          <nav className="flex flex-col gap-1">
            <Link
              href="/about"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Users className="h-4 w-4 text-muted-foreground" />
              {labels.about}
            </Link>
            <Link
              href="/pricing"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Zap className="h-4 w-4 text-muted-foreground" />
              {labels.pricing}
            </Link>
            {!isLoggedIn && (
              <Link
                href="/login"
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-foreground transition-colors hover:bg-muted md:hidden"
              >
                <LogIn className="h-4 w-4 text-muted-foreground" />
                {labels.login}
              </Link>
            )}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
