"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * ContourCanvas — a cartografia de curvas de nível das fundações.
 * Canvas fixo de página inteira, atrás de tudo, com linhas topográficas
 * animadas que reagem subtilmente ao rato. Lê `--line-ink` dos tokens
 * (muda com o tema). Em prefers-reduced-motion desenha um frame estático.
 */
export function ContourCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let t = 0;
    let raf = 0;
    let mX = 0.5, mY = 0.5, tmX = 0.5, tmY = 0.5;

    const resize = () => {
      W = cv.width = window.innerWidth * dpr;
      H = cv.height = window.innerHeight * dpr;
    };
    const onMouse = (e: MouseEvent) => {
      tmX = e.clientX / window.innerWidth;
      tmY = e.clientY / window.innerHeight;
    };

    const draw = () => {
      mX += (tmX - mX) * 0.05;
      mY += (tmY - mY) * 0.05;
      ctx.clearRect(0, 0, W, H);
      const ink =
        getComputedStyle(document.documentElement).getPropertyValue("--line-ink").trim() ||
        "26, 26, 23";
      const lines = 16;
      const lift = (mY - 0.5) * 30 * dpr;
      const warp = (mX - 0.5) * 0.9;
      for (let l = 0; l < lines; l++) {
        ctx.beginPath();
        const base = (H / (lines - 1)) * l;
        const amp = (13 + (l % 6) * 7) * dpr;
        for (let x = 0; x <= W; x += 9 * dpr) {
          const bump = lift * Math.exp(-Math.pow((x / W - mX) * 3.2, 2)); // ondulação junto ao cursor
          const y =
            base +
            Math.sin((x * 0.006) / dpr + t + l * 0.5 + warp) * amp +
            Math.sin((x * 0.013) / dpr - t * 0.6 + l) * amp * 0.4 +
            bump;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${ink}, ${0.045 + (l % 6) * 0.004})`;
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      }
      t += 0.0015;
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    if (!reduce) window.addEventListener("mousemove", onMouse, { passive: true });
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 -z-10 h-full w-full", className)}
    />
  );
}
