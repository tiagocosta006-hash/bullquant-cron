import type { ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { MediaFrame } from "../MediaFrame";
import { MarkLegend, ShotMarks } from "../showcase/ShotMarks";
import { ThemedImg } from "../showcase/ThemedImg";
import { cn } from "@/lib/utils";
import { ZoomTrigger } from "./JobsZoom";

type Shot = { src: string; fade: boolean; marks: { n: number; text: string; left: string; top: string }[] };

const FADE_MASK = "[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]";
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Uma pergunta de compra respondida por um ecrã real (versão B): número,
 * pergunta, resposta e o recorte com marcas numeradas. Desktop: recorte
 * 16:10 numa moldura, alternando de lado. Telemóvel: recorte 1:1 legível,
 * com o botão de ecrã inteiro na zona do polegar.
 */
export function JobRow({
  n,
  title,
  body,
  alt,
  seeFull,
  seeFullAria,
  marksTitle,
  index,
  wide,
  square,
  reverse,
  trackKey,
}: {
  n: string;
  title: string;
  body: ReactNode;
  alt: string;
  seeFull: string;
  seeFullAria: string;
  marksTitle: string;
  index: number;
  wide: Shot;
  square: Shot;
  reverse?: boolean;
  trackKey: string;
}) {
  const track = `b_jobs_full_${trackKey}`;
  return (
    <div className="md:grid md:grid-cols-12 md:items-center md:gap-10 lg:gap-14">
      <div className="md:col-span-5">
        <span className="nums text-sm font-semibold text-muted-foreground">{n}</span>
        <h3 className="mt-2 text-balance text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h3>
        <p className="mt-3 text-pretty text-[15px] leading-relaxed text-muted-foreground md:text-base">{body}</p>
      </div>

      {/* desktop */}
      <div className={cn("hidden md:col-span-7 md:block", reverse && "md:order-first")}>
        <MediaFrame alt={alt}>
          <ZoomTrigger
            index={index}
            ariaLabel={seeFullAria}
            track={track}
            className={cn(
              "relative block aspect-[16/10] w-full cursor-zoom-in overflow-hidden rounded-2xl border border-border/50 bg-card/40",
              FOCUS_RING,
            )}
          >
            <ThemedImg src={wide.src} alt={alt} className={cn("absolute inset-0 h-full w-full object-cover", wide.fade && FADE_MASK)} />
            <ShotMarks size="md" marks={wide.marks} />
            <span className="glass-frost absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              {seeFull}
            </span>
          </ZoomTrigger>
        </MediaFrame>
        <MarkLegend marks={wide.marks} title={marksTitle} className="mt-4 text-sm" />
      </div>

      {/* telemóvel */}
      <div className="mt-6 md:hidden">
        <ZoomTrigger
          index={index}
          ariaLabel={seeFullAria}
          track={track}
          className={cn(
            "relative mx-auto block aspect-square w-full max-w-[440px] overflow-hidden rounded-2xl border border-border/60 bg-card",
            FOCUS_RING,
          )}
        >
          <ThemedImg src={square.src} alt={alt} className={cn("absolute inset-0 h-full w-full object-cover", square.fade && FADE_MASK)} />
          <ShotMarks size="sm" marks={square.marks} />
        </ZoomTrigger>
        <MarkLegend marks={square.marks} title={marksTitle} className="mt-4 text-[13px]" />
        <ZoomTrigger
          index={index}
          track={track}
          className={cn(
            "mx-auto mt-4 flex min-h-11 w-full max-w-[440px] items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/40 text-sm font-medium transition-colors hover:border-primary/50",
            FOCUS_RING,
          )}
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
          {seeFull}
        </ZoomTrigger>
      </div>
    </div>
  );
}
