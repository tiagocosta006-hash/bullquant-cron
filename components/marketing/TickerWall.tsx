"use client";

import { useEffect, useRef } from "react";
import type { TickerItem } from "@/lib/marketing/ticker";
import { cn } from "@/lib/utils";

/**
 * TickerWall — fundo "parede de Wall Street": uma grelha de tickers com
 * preços a piscar/atualizar atrás do manifesto (ambient motion). É
 * decorativo (aria-hidden), muito ténue, mascarado no centro para o
 * texto respirar. Os primeiros valores vêm do ticker real (server);
 * o resto é sintético determinístico (SSR estável). O flicker só corre
 * com o elemento em viewport e nunca com prefers-reduced-motion.
 */
const EXTRA = [
  "JPM", "XOM", "PG", "JNJ", "UNH", "HD", "CRM", "AVGO", "COST", "PEP",
  "CSCO", "INTC", "AMD", "ORCL", "ABT", "NKE", "WMT", "LLY", "MRK", "BAC",
  "PFE", "TMO", "ACN", "LIN", "TXN", "QCOM", "HON", "UPS", "CAT", "IBM",
  "GE", "BA", "SBUX", "GS",
];

interface Cell {
  ticker: string;
  price: number;
  chg: number; // decimal
}

function buildCells(items: TickerItem[]): Cell[] {
  const real: Cell[] = items.map((i) => ({
    ticker: i.ticker,
    price: i.close,
    chg: i.changePct ?? 0,
  }));
  const synthetic: Cell[] = EXTRA.map((ticker, i) => ({
    ticker,
    price: 30 + ((i * 47) % 470) + (i % 7) * 0.37,
    chg: (((i * 13) % 9) - 4) / 250,
  }));
  return [...real, ...synthetic].slice(0, 48);
}

export function TickerWall({ items }: { items: TickerItem[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cells = buildCells(items);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-cell]"));
    if (!nodes.length) return;
    const prices = nodes.map((n) => Number(n.dataset.price) || 100);

    let interval = 0;
    const tick = () => {
      for (let k = 0; k < 4; k++) {
        const i = Math.floor(Math.random() * nodes.length);
        const delta = (Math.random() - 0.48) * 0.012;
        prices[i] = Math.max(1, prices[i] * (1 + delta));
        const cell = nodes[i];
        const priceEl = cell.querySelector<HTMLElement>("[data-price-el]");
        const chgEl = cell.querySelector<HTMLElement>("[data-chg-el]");
        if (!priceEl || !chgEl) continue;
        const up = delta >= 0;
        priceEl.textContent = prices[i].toFixed(2);
        chgEl.textContent = `${up ? "▲" : "▼"} ${(Math.abs(delta) * 100).toFixed(2)}%`;
        chgEl.classList.toggle("text-bull", up);
        chgEl.classList.toggle("text-bear", !up);
        // flash de "quadro de cotações": o valor apaga e reacende
        cell.style.transition = "opacity 0.25s ease";
        cell.style.opacity = "0.35";
        requestAnimationFrame(() => {
          cell.style.opacity = "1";
        });
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        window.clearInterval(interval);
        if (entry.isIntersecting) interval = window.setInterval(tick, 650);
      },
      { threshold: 0 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="h-full w-full opacity-[0.09] blur-[0.5px] [mask-image:radial-gradient(ellipse_66%_58%_at_50%_50%,transparent_42%,black_88%)] dark:opacity-[0.13]"
    >
      <div className="grid h-full w-full grid-cols-3 place-content-between gap-x-6 gap-y-8 p-8 sm:grid-cols-5 xl:grid-cols-7">
        {cells.map((c) => {
          const up = c.chg >= 0;
          return (
            <div
              key={c.ticker}
              data-cell
              data-price={c.price}
              className="flex flex-col items-center gap-0.5"
            >
              <span className="text-xs font-semibold tracking-wide">{c.ticker}</span>
              <span data-price-el className="nums text-sm font-medium">
                {c.price.toFixed(2)}
              </span>
              <span
                data-chg-el
                className={cn(
                  "nums text-[11px] font-semibold",
                  up ? "text-bull" : "text-bear",
                )}
              >
                {up ? "▲" : "▼"} {(Math.abs(c.chg) * 100).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
