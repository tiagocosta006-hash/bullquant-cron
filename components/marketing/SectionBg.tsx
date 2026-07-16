import { cn } from "@/lib/utils";

/**
 * SectionBg — fundo personalizado por secção da landing: uma banda tonal
 * + um motivo estático (globals.css `.motif-*`), com fade vertical para
 * as bandas fundirem sem costura. Server Component.
 *
 * A `<section>` pai tem de ser `relative isolate` (NUNCA overflow-hidden —
 * partiria o position:sticky dos tracks de scroll). O conteúdo fica acima
 * naturalmente (este layer é -z-10 dentro do stacking context da secção,
 * por cima da cartografia global fixa quando o `tone` não é transparente).
 */
type Tone = "paper" | "raised" | "sunken" | "gold";
type Motif = "none" | "grid" | "dots" | "rings" | "stage";

const TONE: Record<Tone, string> = {
  paper: "", // transparente → deixa ver a cartografia global
  raised: "bg-card/40",
  sunken: "bg-secondary/50",
  gold: "bg-primary/[0.04]",
};

const MOTIF: Record<Motif, string> = {
  none: "",
  grid: "motif-grid",
  dots: "motif-dots",
  rings: "motif-rings",
  stage: "motif-stage",
};

export function SectionBg({
  tone = "paper",
  motif = "none",
  fade = true,
  className,
}: {
  tone?: Tone;
  motif?: Motif;
  fade?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10",
        TONE[tone],
        MOTIF[motif],
        fade &&
          "[mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]",
        className,
      )}
    />
  );
}
