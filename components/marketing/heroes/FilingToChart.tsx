"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A tese em movimento: as linhas do 10-K, em mono e densas, LEVANTAM-SE e
 * viram barras à medida que se faz scroll. Não é uma comparação lado a lado —
 * é a mesma coisa a transformar-se, que é exactamente o que o produto faz.
 *
 * Vive ABAIXO do hero de propósito: o momento "ah, percebi" só funciona depois
 * de já se saber o que é o produto. Em cima seria um enigma; aqui é a prova.
 *
 * Progresso conduzido por um IntersectionObserver com thresholds em vez de um
 * listener de scroll: o browser faz a conta, nós só lemos o resultado.
 */
export function FilingToChart({ years }: { years: { year: number; revenue: number }[] }) {
  const [p, setP] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(...years.map((y) => y.revenue), 1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // ratio de visibilidade = progresso da transformação. Mapeado para
          // 0..1 na janela 0.25..0.75 para a mudança acontecer enquanto a
          // secção atravessa o ecrã, e não só no fim.
          const raw = (e.intersectionRatio - 0.25) / 0.5;
          setP(Math.max(0, Math.min(1, raw)));
        }
      },
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="mx-auto max-w-5xl px-6 py-24 md:px-8 md:py-32">
      <h2 className="max-w-[18ch] text-balance text-4xl font-extrabold leading-[1] tracking-[-0.03em] sm:text-5xl md:text-6xl">
        Os mesmos números.
        <br />
        <span className="text-primary">Finalmente legíveis.</span>
      </h2>
      <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
        Estes são os valores da receita da Apple exactamente como saem do 10-K. Faz scroll e vê o
        que fazemos com eles.
      </p>

      <div className="mt-14 rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-end gap-2 sm:gap-3" style={{ height: 300 }}>
          {years.map((y, i) => {
            const target = (y.revenue / max) * 100;
            // cada linha transforma-se com um ligeiro desfasamento: a onda
            // lê-se como "está a acontecer", não como um interruptor
            const local = Math.max(0, Math.min(1, (p - i * 0.03) / 0.7));
            const h = 6 + (target - 6) * local;
            return (
              <div key={y.year} className="flex h-full flex-1 flex-col justify-end gap-2">
                {/* overflow-hidden: o número em mono é `whitespace-nowrap` e
                    absoluto, e em ecrãs estreitos empurrava a largura da
                    página — dava scroll horizontal em mobile. */}
                <div className="relative flex w-full flex-1 items-end overflow-hidden">
                  {/* a linha de texto do 10-K desvanece à medida que a barra sobe */}
                  <span
                    className="absolute bottom-0 left-0 whitespace-nowrap font-mono text-[10px] leading-none text-muted-foreground"
                    style={{ opacity: 1 - local }}
                  >
                    {Math.round(y.revenue).toLocaleString("en-US")}
                  </span>
                  <div
                    className="w-full rounded-t bg-primary"
                    style={{ height: `${h}%`, opacity: 0.25 + 0.75 * local }}
                  />
                </div>
                <span className="shrink-0 text-center text-[10px] text-muted-foreground">
                  &apos;{String(y.year).slice(2)}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          Receita anual da Apple, {years[0]?.year}–{years[years.length - 1]?.year}. Valores retirados
          dos 10-K da SEC.
        </p>
      </div>
    </section>
  );
}
