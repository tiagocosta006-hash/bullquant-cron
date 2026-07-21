"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * FloatingCta — pill fixa em baixo ao centro que aparece depois do hero
 * e desaparece quando o CTA final entra (para não duplicar). TEM de
 * viver FORA do #marketing-wrap (rubber-band vs position:fixed). Só na
 * landing. Recebe os textos por props (Server → i18n no layout).
 */
export function FloatingCta({ label, note }: { label: string; note: string }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname !== "/") return;
    const el = ref.current;
    if (!el) return;
    const hero = document.querySelector('[data-backdrop="paper"]');
    const closing = document.querySelector('[data-backdrop="closing"]');
    if (!hero || !closing) return;

    let pastHero = false;
    let inClosing = false;
    const apply = () => el.classList.toggle("floating-cta-in", pastHero && !inClosing);

    const ioHero = new IntersectionObserver(([e]) => {
      pastHero = !e.isIntersecting;
      apply();
    });
    const ioClosing = new IntersectionObserver(([e]) => {
      inClosing = e.isIntersecting;
      apply();
    });
    ioHero.observe(hero);
    ioClosing.observe(closing);
    return () => {
      ioHero.disconnect();
      ioClosing.disconnect();
    };
  }, [pathname]);

  if (pathname !== "/") return null;

  return (
    <div
      ref={ref}
      className="floating-cta fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"
    >
      <div className="glass glass-frost flex items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 shadow-lg">
        <span className="nums hidden text-xs font-medium text-muted-foreground sm:inline">
          {note}
        </span>
        <Link
          href="/register"
          data-track="floating_register"
          className={cn(buttonVariants(), "pressable cta-sheen rounded-full px-5 font-semibold")}
        >
          {label}
        </Link>
      </div>
    </div>
  );
}
