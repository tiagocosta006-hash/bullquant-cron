"use client";

import { useRef, type KeyboardEvent, type MutableRefObject } from "react";
import { cn } from "@/lib/utils";

export type BarChapter = { key: string; label: string; aria: string; weight: number };

/**
 * Barra de capítulos do vídeo do hero. "ruler" (desktop): segmentos com
 * largura proporcional à duração e rótulos de grupo por cima; "compact"
 * (telemóvel): 4 colunas com alvos de 44px. O preenchimento do capítulo ativo
 * é escrito pelo rAF do leitor (fillRefs), sem re-render nem transição CSS.
 */
export function ChapterBar({
  chapters,
  groups,
  active,
  onSelect,
  variant,
  label,
  fillRefs,
}: {
  chapters: BarChapter[];
  groups?: { label: string; from: number; to: number }[];
  active: number;
  onSelect: (i: number) => void;
  variant: "ruler" | "compact";
  label: string;
  fillRefs: MutableRefObject<(HTMLSpanElement | null)[]>;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = chapters.length - 1;
    const to =
      e.key === "ArrowRight" ? Math.min(i + 1, last)
      : e.key === "ArrowLeft" ? Math.max(i - 1, 0)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (to === null) return;
    e.preventDefault();
    btnRefs.current[to]?.focus();
  };

  const ruler = variant === "ruler";
  const cols = ruler ? chapters.map((c) => `minmax(96px, ${c.weight}fr)`).join(" ") : undefined;
  const secondGroupStart = groups?.[1]?.from;

  return (
    <div role="group" aria-label={label}>
      {ruler && groups && (
        <div className="mb-1 grid gap-2" style={{ gridTemplateColumns: cols }} aria-hidden>
          {groups.map((g) => (
            <span
              key={g.label}
              className={cn(
                "text-[11px] uppercase tracking-wide",
                active >= g.from && active <= g.to ? "text-foreground" : "text-muted-foreground",
                g.from === secondGroupStart && "border-l border-border/50 pl-2",
              )}
              style={{ gridColumn: `${g.from + 1} / ${g.to + 2}` }}
            >
              {g.label}
            </span>
          ))}
        </div>
      )}
      <div className={cn("grid", ruler ? "gap-2" : "grid-cols-4 gap-1.5")} style={ruler ? { gridTemplateColumns: cols } : undefined}>
        {chapters.map((c, i) => (
          <button
            key={c.key}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            tabIndex={i === active ? 0 : -1}
            aria-label={c.aria}
            aria-current={i === active ? "step" : undefined}
            data-track={`hero_reel_chapter_${c.key}`}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "group rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              ruler ? "pb-1 pt-2 text-left" : "min-h-11 py-2 text-center",
              ruler && i === secondGroupStart && "border-l border-border/50 pl-2",
            )}
          >
            <span className="block h-[3px] overflow-hidden rounded-full bg-foreground/10" aria-hidden>
              <span
                ref={(el) => {
                  fillRefs.current[i] = el;
                }}
                className="block h-full origin-left bg-primary"
                style={{ transform: `scaleX(${i < active ? 1 : 0})` }}
              />
            </span>
            <span
              className={cn(
                "block",
                ruler ? "mt-2 text-[13px]" : "mt-1.5 text-[12px] leading-tight",
                i === active ? "font-semibold text-foreground" : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              {c.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
