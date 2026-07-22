"use client";

import Link from "next/link";
import { LogIn, Menu, Search, UserPlus, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Menu mobile do header público (marketing) — abaixo de `md` a nav
 * ("Quem somos"/"Planos") e os CTAs de auth deixam de caber na ilha; sem
 * isto ficavam inacessíveis em ecrãs pequenos (não existia nenhuma
 * alternativa). A pesquisa saiu do header público (landing só oferece
 * "Espreitar sem conta" → AAPL ou "Criar conta") — o SearchBar continua a
 * viver dentro da app autenticada. "Criar conta" é o único CTA que fica
 * sempre visível fora deste menu (botão próprio no header).
 */
export function HeaderMobileMenu({
  isLoggedIn,
  labels,
}: {
  isLoggedIn: boolean;
  labels: {
    menuTitle: string;
    openMenu: string;
    about: string;
    pricing: string;
    login: string;
    peek: string;
    createAccount: string;
  };
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={labels.openMenu} />
        }
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="glass glass-frost border-0">
        <SheetHeader>
          <SheetTitle>{labels.menuTitle}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
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
              <>
                <Link
                  href="/stock/AAPL"
                  data-track="header_peek"
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Search className="h-4 w-4 text-muted-foreground" />
                  {labels.peek}
                </Link>
                <Link
                  href="/login"
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <LogIn className="h-4 w-4 text-muted-foreground" />
                  {labels.login}
                </Link>
                <Link
                  href="/register"
                  data-track="header_register"
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  <UserPlus className="h-4 w-4" />
                  {labels.createAccount}
                </Link>
              </>
            )}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
