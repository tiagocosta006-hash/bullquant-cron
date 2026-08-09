"use client";

import { useEffect, useRef, useState } from "react";

/**
 * O número da receita constrói-se à frente do visitante: o valor sobe de zero
 * até ao real enquanto o ano corre de 2016 a 2025. Parar de scrollar por causa
 * de um número que se move é involuntário — um número parado, por muito
 * grande, é só tipografia.
 *
 * Só `requestAnimationFrame` a escrever texto: zero layout thrash, zero
 * bibliotecas. Com `prefers-reduced-motion` mostra o valor final de imediato.
 */
export function CountingNumber({
  years,
  durationMs = 1900,
}: {
  years: { year: number; revenue: number }[];
  durationMs?: number;
}) {
  const last = years[years.length - 1];
  const [value, setValue] = useState(last?.revenue ?? 0);
  const [year, setYear] = useState(last?.year ?? 0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!years.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let started = false;

    const run = (t0: number) => {
      const tick = (t: number) => {
        // easing exponencial: arranca depressa e assenta — o contrário de
        // linear, que faz o número parecer um contador de posto de gasolina
        const p = Math.min((t - t0) / durationMs, 1);
        const eased = 1 - Math.pow(1 - p, 3);

        // o ano acompanha a progressão: o valor a subir E o ano a avançar
        // contam a mesma história (dez anos de crescimento) ao mesmo tempo
        const i = Math.min(Math.floor(eased * years.length), years.length - 1);
        setYear(years[i].year);
        setValue(years[i].revenue * (0.55 + 0.45 * eased));

        if (p < 1) raf = requestAnimationFrame(tick);
        else {
          setYear(last.year);
          setValue(last.revenue);
        }
      };
      raf = requestAnimationFrame(tick);
    };

    // só arranca quando está à vista — se o visitante chegar a meio da página
    // (link partilhado com âncora) a animação não se perde sem ser vista
    const el = ref.current;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started) {
          started = true;
          setValue(0);
          setYear(years[0].year);
          requestAnimationFrame((t) => run(t));
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    if (el) io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [years, durationMs, last]);

  return (
    <div ref={ref}>
      <p className="text-sm font-medium tracking-wide text-muted-foreground">
        Receita da Apple em <span className="nums tabular-nums">{year}</span> · retirada do 10-K da SEC
      </p>
      {/* tabular-nums é obrigatório: sem ele os dígitos têm larguras
          diferentes e o número inteiro treme da esquerda para a direita
          a cada frame */}
      <p className="nums mt-3 select-none text-[17vw] font-extrabold leading-[0.78] tracking-[-0.05em] text-primary tabular-nums">
        ${(value / 1e9).toFixed(1)}B
      </p>
    </div>
  );
}
