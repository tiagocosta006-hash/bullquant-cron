"use client";

import { Link } from '@/i18n/routing';

import { useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePathname } from '@/i18n/routing';

/**
 * FloatingCta — pill fixa em baixo ao centro. TEM de viver FORA do
 * #marketing-wrap (rubber-band vs position:fixed). Só na landing. Recebe os
 * textos por props (Server → i18n no layout).
 *
 * Quando aparece (27/10/2026): só depois de os botões do hero
 * (`[data-hero-cta]`) saírem do ecrã por cima, e nunca enquanto uma secção
 * `[data-hide-floating]` (planos, CTA final) estiver à vista — aí já há
 * botões na página e a pill só os tapava ou duplicava. Antes observava a
 * secção inteira do hero (que no telemóvel inclui o vídeo) e fazia "morph"
 * para o CTA final, o que deixava dois pares de botões empilhados no fim.
 *
 * Sem crescer com o scroll, sem glow e sem "respiração" (30/10/2026): o
 * dono não quer brilhos nem animações em loop; a pill só aparece e desaparece.
 */
export function FloatingCta({
  label,
  peekLabel,
  note,
}: {
  label: string;
  peekLabel: string;
  note: string;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname !== "/") return;
    const el = ref.current;
    if (!el) return;
    const heroCta =
      document.querySelector("[data-hero-cta]") ?? document.querySelector('[data-backdrop="paper"]');
    if (!heroCta) return;
    const hideIn = Array.from(document.querySelectorAll("[data-hide-floating]"));

    let pastHero = false;
    const visiveis = new Set<Element>();
    const apply = () => el.classList.toggle("floating-cta-in", pastHero && visiveis.size === 0);

    const ioHero = new IntersectionObserver(([e]) => {
      // só conta como "passado" quando saiu por CIMA (não antes de lá chegar)
      pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
      apply();
    });
    ioHero.observe(heroCta);

    const ioHide = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visiveis.add(e.target);
        else visiveis.delete(e.target);
      }
      apply();
    });
    hideIn.forEach((s) => ioHide.observe(s));

    return () => {
      ioHero.disconnect();
      ioHide.disconnect();
    };
  }, [pathname]);

  if (pathname !== "/") return null;

  return (
    <div
      ref={ref}
      className="floating-cta fixed inset-x-0 z-40 flex justify-center px-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
    >
      <div>
        {/* Em telemóvel a nota desaparece para os 2 botões caberem lado a lado. */}
        <div
          className="floating-cta-pill glass glass-frost flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 shadow-lg"
        >
          <span className="nums hidden text-xs font-medium text-muted-foreground sm:inline">
            {note}
          </span>
          <Link
            href="/register"
            data-track="floating_register"
            className={cn(buttonVariants(), "pressable h-11 rounded-full px-5 font-semibold md:h-8")}
          >
            {label}
          </Link>
          <Link
            href="/stock/AAPL"
            data-track="floating_peek"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "pressable h-11 rounded-full px-4 font-medium md:h-8",
            )}
          >
            {peekLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
