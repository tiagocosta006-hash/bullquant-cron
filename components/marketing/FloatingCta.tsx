"use client";

import { Link } from '@/i18n/routing';

import { useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { gsap, useGSAP, ScrollTrigger, MOTION_OK } from "@/lib/marketing/gsap";
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
 * Com motion, a pill cresce um pouco com o scroll (monotónico — nunca encolhe
 * ao subir) e ganha um glow dourado.
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
  const pillRef = useRef<HTMLDivElement>(null);

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

  // Crescimento monotónico + glow — só com motion.
  useGSAP(
    () => {
      if (pathname !== "/") return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const pill = pillRef.current;
        if (!pill) return;

        const isMobile = window.matchMedia("(max-width: 767.98px)").matches;
        const maxGrow = isMobile ? 0.22 : 0.45;
        let pMax = 0;
        const growProxy = { scale: 1, pull: 0 };
        const scaleTo = gsap.quickTo(growProxy, "scale", {
          duration: 0.4,
          ease: "power2.out",
          onUpdate: () => pill.style.setProperty("--cta-scale", growProxy.scale.toFixed(3)),
        });
        const pullTo = gsap.quickTo(growProxy, "pull", {
          duration: 0.4,
          ease: "power2.out",
          onUpdate: () => {
            pill.style.setProperty("--cta-pull", growProxy.pull.toFixed(3));
            pill.classList.toggle("floating-cta-peak", growProxy.pull > 0.85);
          },
        });
        const marketingWrap = document.getElementById("marketing-wrap");
        if (!marketingWrap) return;
        // trigger passado como ELEMENTO (não string) — useGSAP({scope: ref})
        // resolve seletores-texto só dentro do próprio ref, e #marketing-wrap
        // vive fora do wrapper fixed do FloatingCta.
        const growTrigger = ScrollTrigger.create({
          trigger: marketingWrap,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            pMax = Math.max(pMax, self.progress);
            scaleTo(1 + pMax * maxGrow);
            pullTo(pMax);
          },
        });

        return () => {
          growTrigger.kill();
        };
      });
    },
    { scope: ref, dependencies: [pathname] },
  );

  if (pathname !== "/") return null;

  return (
    <div
      ref={ref}
      className="floating-cta fixed inset-x-0 z-40 flex justify-center px-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
    >
      <div>
        {/* Em telemóvel a nota desaparece para os 2 botões caberem lado a lado. */}
        <div
          ref={pillRef}
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
