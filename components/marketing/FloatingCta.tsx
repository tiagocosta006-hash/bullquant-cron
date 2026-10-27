"use client";

import { Link } from '@/i18n/routing';

import { useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { gsap, useGSAP, ScrollTrigger, MOTION_OK } from "@/lib/marketing/gsap";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { usePathname } from '@/i18n/routing';

/**
 * FloatingCta — pill fixa em baixo ao centro que aparece depois do hero.
 * TEM de viver FORA do #marketing-wrap (rubber-band vs position:fixed). Só
 * na landing. Recebe os textos por props (Server → i18n no layout).
 *
 * Com o scroll: cresce (monotónico — nunca encolhe ao subir, via pMax) e
 * ganha um glow dourado crescente (cada vez mais apetecível); perto do CTA
 * final da página faz "morph" — desliza/escala até sobrepor o botão real
 * (mesmo href/label) e desvanece, como se um se tornasse no outro. Ao
 * subir, reverte. Sem motion: sem crescer/morphar, só mostra/esconde como
 * antes (esconde assim que o CTA final entra em vista).
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
  const morphRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  // Mostrar/esconder base — depois do hero; sem motion, esconde-se também
  // assim que o CTA final aparece (fallback simples, sem morph).
  useEffect(() => {
    if (pathname !== "/") return;
    const el = ref.current;
    if (!el) return;
    const hero = document.querySelector('[data-backdrop="paper"]');
    const closing = document.querySelector('[data-backdrop="closing"]');
    if (!hero || !closing) return;

    const reduced = prefersReducedMotion();
    let pastHero = false;
    let inClosing = false;
    const apply = () => el.classList.toggle("floating-cta-in", pastHero && !inClosing);

    const ioHero = new IntersectionObserver(([e]) => {
      pastHero = !e.isIntersecting;
      apply();
    });
    ioHero.observe(hero);

    let ioClosing: IntersectionObserver | undefined;
    if (reduced) {
      ioClosing = new IntersectionObserver(([e]) => {
        inClosing = e.isIntersecting;
        apply();
      });
      ioClosing.observe(closing);
    }

    return () => {
      ioHero.disconnect();
      ioClosing?.disconnect();
    };
  }, [pathname]);

  // Crescimento monotónico + pull + morph no CTA final — só com motion.
  useGSAP(
    () => {
      if (pathname !== "/") return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const outer = ref.current;
        const morph = morphRef.current;
        const pill = pillRef.current;
        if (!outer || !morph || !pill) return;

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
        // Morph no CTA final: em vez de um 2.º ScrollTrigger com start/end
        // fixos (calculados uma única vez — dessincronizavam se o layout
        // mudasse depois do mount, ex. imagens lazy a alterar a altura da
        // página), mede a geometria AO VIVO a cada tick do MESMO trigger
        // de página inteira (já fiável). Self-correcting: a escala do
        // morph compensa sozinha o crescimento já aplicado por --cta-scale
        // (sem duplo-crescimento no encaixe).
        const finalCta = document.querySelector<HTMLElement>("[data-final-cta]");
        const closingEl = document.querySelector<HTMLElement>('[data-backdrop="closing"]');
        const marketingWrap = document.getElementById("marketing-wrap");
        if (!marketingWrap) return;
        const FADE_START = 0.72;
        // trigger passado como ELEMENTO (não string) — useGSAP({scope: ref})
        // resolve seletores-texto só dentro do próprio ref, e #marketing-wrap
        // vive fora (irmão, não descendente) do wrapper fixed do FloatingCta;
        // uma string aqui falhava a resolver ("Element not found") e caía num
        // fallback não garantido.
        const growTrigger = ScrollTrigger.create({
          trigger: marketingWrap,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            pMax = Math.max(pMax, self.progress);
            scaleTo(1 + pMax * maxGrow);
            pullTo(pMax);

            if (!finalCta || !closingEl) return;
            // p tem de chegar exatamente a 1 no fundo real da página (self.progress
            // === 1) — nunca ficar a meio (a secção de fecho é um flex centrado
            // min-h-[90vh], o botão nunca sobe até perto do topo do viewport, por
            // isso um limiar em coordenadas de viewport nunca chegava a 1). Mede
            // ao vivo que fração da página a secção de fecho ocupa e normaliza o
            // scroll restante dentro dela — self-correcting a cada tick.
            // arranca meio viewport ANTES da secção de fecho chegar ao topo —
            // só usar offsetTop dava uma janela de ~2% do scroll total (a
            // secção é grande, min-h-[90vh], por isso já está quase toda à
            // vista mal entra) — curto de mais para um morph gradual.
            const totalScrollable = document.body.scrollHeight - window.innerHeight;
            const closingStartFrac =
              totalScrollable > 0
                ? Math.max(0, Math.min(0.98, (closingEl.offsetTop - window.innerHeight * 0.6) / totalScrollable))
                : 0;
            const p =
              closingStartFrac >= 1
                ? 0
                : Math.min(1, Math.max(0, (self.progress - closingStartFrac) / (1 - closingStartFrac)));
            if (p > 0) {
              const finalRect = finalCta.getBoundingClientRect();
              const pillRect = pill.getBoundingClientRect();
              const dx = finalRect.left + finalRect.width / 2 - (pillRect.left + pillRect.width / 2);
              const dy = finalRect.top + finalRect.height / 2 - (pillRect.top + pillRect.height / 2);
              const scaleRatio = finalRect.width / pillRect.width;
              gsap.set(morph, { x: dx * p, y: dy * p, scale: 1 + (scaleRatio - 1) * p });
              outer.style.opacity =
                p <= FADE_START ? "1" : String(Math.max(0, 1 - (p - FADE_START) / (1 - FADE_START)));
              // Assim que começa a desvanecer, a pill já está pousada por cima do
              // CTA final — e `opacity: 0` NÃO desliga o rato. Sem isto ficava um
              // fantasma invisível a roubar o hover/clique dos dois botões reais
              // (o .floating-cta-in mantém pointer-events: auto, e o observer que
              // o desligava só é registado em reduced-motion). Bug real: o hover
              // dos CTAs finais acendia e apagava ao mexer o rato.
              outer.style.pointerEvents = p > FADE_START ? "none" : "";
            } else {
              outer.style.opacity = "";
              outer.style.pointerEvents = "";
              gsap.set(morph, { x: 0, y: 0, scale: 1 });
            }
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
      <div ref={morphRef}>
        {/* Espelha a composição do CTA final (primário + espreitar) para o
            morph aterrar naturalmente. Em telemóvel a nota desaparece para
            os 2 botões caberem lado a lado. */}
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
