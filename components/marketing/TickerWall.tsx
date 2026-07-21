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
  "GE", "BA", "SBUX", "GS", "MS", "BLK", "V", "MA", "AXP", "DIS",
  "NFLX", "ADBE", "PYPL", "SHOP", "UBER", "ABNB", "PLTR", "SNOW", "NOW", "PANW",
  "MU", "AMAT", "LRCX", "KLAC", "ADI", "MRVL", "DE", "LMT", "RTX", "NOC",
  "CVX", "COP", "SLB", "EOG", "KO", "MCD", "YUM", "CMG", "TGT", "LOW",
  "MDT", "ISRG", "SYK", "BSX", "VRTX", "REGN", "GILD", "AMGN", "CI", "ELV",
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
  // dedupe: tickers reais têm prioridade (keys React têm de ser únicas)
  const seen = new Set(real.map((r) => r.ticker));
  const synthetic: Cell[] = EXTRA.filter((t) => !seen.has(t)).map((ticker, i) => ({
    ticker,
    price: 30 + ((i * 47) % 470) + (i % 7) * 0.37,
    chg: (((i * 13) % 9) - 4) / 250,
  }));
  return [...real, ...synthetic].slice(0, 91);
}

export function TickerWall({ items }: { items: TickerItem[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cells = buildCells(items);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // só as células do bloco original — as cópias do loop ficam estáticas
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-dup="0"] [data-cell]'));
    if (!nodes.length) return;
    const prices = nodes.map((n) => Number(n.dataset.price) || 100);

    let interval = 0;
    const tick = () => {
      for (let k = 0; k < 8; k++) {
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
        cell.style.transition = "opacity 0.18s ease";
        cell.style.opacity = "0.25";
        requestAnimationFrame(() => {
          cell.style.opacity = "1";
        });
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        window.clearInterval(interval);
        if (entry.isIntersecting) interval = window.setInterval(tick, 220);
      },
      { threshold: 0 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  // 7 colunas densas que derivam verticalmente em sentidos alternados
  // (loop -50% com o conteúdo duplicado — o truque do marquee)
  const COLS = 7;
  const cols = Array.from({ length: COLS }, (_, c) => cells.filter((_, i) => i % COLS === c));

  const cell = (c: Cell) => {
    const up = c.chg >= 0;
    return (
      <div key={c.ticker} data-cell data-price={c.price} className="flex flex-col items-center gap-0.5">
        <span className="text-[11px] font-semibold tracking-wide">{c.ticker}</span>
        <span data-price-el className="nums text-xs font-medium">
          {c.price.toFixed(2)}
        </span>
        <span
          data-chg-el
          className={cn("nums text-[10px] font-semibold", up ? "text-bull" : "text-bear")}
        >
          {up ? "▲" : "▼"} {(Math.abs(c.chg) * 100).toFixed(2)}%
        </span>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="h-full w-full overflow-hidden opacity-[0.14] blur-[0.5px] [mask-image:radial-gradient(ellipse_58%_50%_at_50%_50%,transparent_34%,black_82%)] dark:opacity-[0.2]"
    >
      <div className="flex h-full w-full justify-between gap-4 px-6">
        {cols.map((col, c) => (
          <div
            key={c}
            className="wall-col flex flex-col gap-5"
            style={{ "--wall-dur": `${38 + c * 4}s` } as React.CSSProperties}
          >
            {[0, 1].map((dup) => (
              <div key={dup} data-dup={dup} className="flex flex-col gap-5">
                {col.map(cell)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
