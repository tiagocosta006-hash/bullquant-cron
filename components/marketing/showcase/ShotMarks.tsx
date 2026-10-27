import { cn } from "@/lib/utils";

/**
 * Marcas numeradas sobre um print (só visuais: aria-hidden) e a legenda em
 * HTML que lhes dá significado (<ol>, traduzível e lida por leitores de ecrã).
 * Os números batem certo porque ambas recebem as mesmas marcas visíveis.
 */
export function ShotMarks({
  marks,
  size = "md",
  highlight = null,
}: {
  marks: { n: number; left: string; top: string }[];
  size?: "md" | "sm";
  highlight?: number | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {marks.map((m) => (
        <span
          key={m.n}
          className={cn(
            "nums absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary font-bold text-primary-foreground shadow-sm ring-2 ring-background dark:ring-foreground/20",
            size === "md" ? "h-6 w-6 text-[12px]" : "h-[22px] w-[22px] text-[11px]",
            highlight === m.n && "ring-4 ring-primary/45 dark:ring-primary/45",
          )}
          style={{ left: m.left, top: m.top }}
        >
          {m.n}
        </span>
      ))}
    </div>
  );
}

export function MarkLegend({
  marks,
  title,
  onHover,
  className,
}: {
  marks: { n: number; text: string }[];
  title?: string;
  onHover?: (n: number | null) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {title && <p className="sr-only">{title}</p>}
      <ol className="space-y-1.5">
        {marks.map((m) => (
          <li
            key={m.n}
            className="flex gap-2"
            onMouseEnter={onHover ? () => onHover(m.n) : undefined}
            onMouseLeave={onHover ? () => onHover(null) : undefined}
          >
            <span
              className="nums mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary"
              aria-hidden
            >
              {m.n}
            </span>
            <span>{m.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
