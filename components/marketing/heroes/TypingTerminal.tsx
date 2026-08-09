"use client";

import { useEffect, useRef, useState } from "react";

export type TerminalCompany = {
  ticker: string;
  name: string;
  rows: { label: string; value: string }[];
};

/**
 * O produto a funcionar sozinho à frente do visitante: um cursor escreve um
 * ticker, o terminal responde linha a linha com números REAIS da nossa BD,
 * apaga e faz outro. Sem screenshot e sem vídeo — é o produto, não uma foto
 * dele.
 *
 * Todos os valores vêm do servidor (ver a rota que monta este componente).
 * Nunca inventar linhas aqui: o argumento inteiro da marca é que os números
 * são verdadeiros.
 */
export function TypingTerminal({ companies }: { companies: TerminalCompany[] }) {
  const [ci, setCi] = useState(0);
  const [typed, setTyped] = useState("");
  const [visibleRows, setVisibleRows] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!companies.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // sem motion: mostra a primeira empresa inteira, sem coreografia
      setTyped(companies[0].ticker);
      setVisibleRows(companies[0].rows.length);
      return;
    }

    const co = companies[ci];
    const after = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };

    setTyped("");
    setVisibleRows(0);

    // 1 · escrever o ticker, letra a letra
    co.ticker.split("").forEach((_, i) => {
      after(140 * (i + 1), () => setTyped(co.ticker.slice(0, i + 1)));
    });

    // 2 · responder linha a linha, como uma consola real
    const typedFor = 140 * co.ticker.length;
    co.rows.forEach((_, i) => {
      after(typedFor + 320 + i * 190, () => setVisibleRows(i + 1));
    });

    // 3 · deixar ler e passar à seguinte SEM intervalo morto: o ticker
    //     seguinte começa a ser escrito no mesmo instante em que as linhas
    //     saem. Antes havia ~800ms com o terminal completamente vazio, que
    //     parecia avariado a quem chegasse nesse momento.
    const done = typedFor + 320 + co.rows.length * 190;
    after(done + 2600, () => {
      setVisibleRows(0);
      setCi((n) => (n + 1) % companies.length);
    });

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [ci, companies]);

  const co = companies[ci];
  if (!co) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 font-mono text-sm shadow-sm sm:p-7">
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <span className="text-muted-foreground">$</span>
        <span className="font-semibold">{typed}</span>
        {/* cursor: opacidade a piscar, sem layout — custo zero */}
        <span className="inline-block h-4 w-[2px] animate-pulse bg-primary" aria-hidden />
      </div>

      <div className="mt-4 space-y-2" aria-live="polite">
        {co.rows.slice(0, visibleRows).map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-6">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="nums font-semibold tabular-nums">{r.value}</span>
          </div>
        ))}
        {/* altura reservada para as linhas que faltam: sem isto o cartão
            cresce a cada linha e empurra a página inteira */}
        {Array.from({ length: Math.max(co.rows.length - visibleRows, 0) }).map((_, i) => (
          <div key={`ghost-${i}`} className="h-[21px]" aria-hidden />
        ))}
      </div>

      <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
        {co.name} · dados dos relatórios oficiais da SEC
      </p>
    </div>
  );
}
