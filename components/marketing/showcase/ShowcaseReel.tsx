"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Pause, Play, RotateCcw } from "lucide-react";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { MediaFrame } from "../MediaFrame";
import { ChapterBar } from "./ChapterBar";
import { useMediaQuery, useVideoGate } from "./useVideoGate";

export type ReelSource = { src: string; poster: string; alt: string; address?: string; openHref?: string; sizeLabel: string };
export type ReelChapter = {
  key: string;
  label: string;
  caption: string;
  aria: string;
  source: number;
  start: number;
  end: number;
  seekTo: number;
  weight: number;
};
type Labels = { chapters: string; pause: string; play: string; openPage: string; openPageAria: string; startPlay: string; replay: string };

/**
 * Vídeo do hero da versão C: gravações reais com capítulos, a tocar uma vez e
 * a acabar num cartão final (sem loop, o que também cumpre o WCAG 2.2.2).
 *
 * Os dois ramos (desktop ≥768px e telemóvel) vêm no SSR com o espaço
 * reservado; só o ramo ativo recebe `src`, e só depois do load + idle, com
 * ≥50% à vista e sem Save-Data/reduced motion (aí fica o poster com um botão).
 * O progresso do capítulo é escrito por um rAF que só corre enquanto toca.
 */
export function ShowcaseReel({
  desktop,
  mobile,
  labels,
  endCard,
}: {
  desktop: { sources: ReelSource[]; chapters: ReelChapter[]; groups: { label: string; from: number; to: number }[] };
  mobile: { sources: ReelSource[]; chapters: ReelChapter[] };
  labels: Labels;
  endCard: ReactNode;
}) {
  const wide = useMediaQuery("(min-width: 768px)", null);
  const branch = wide === null ? null : wide ? "desktop" : "mobile";

  return (
    <>
      <div className="md:hidden">
        <Player variant="compact" enabled={branch === "mobile"} sources={mobile.sources} chapters={mobile.chapters} labels={labels} endCard={endCard} />
      </div>
      <div className="hidden md:block">
        <Player
          variant="ruler"
          enabled={branch === "desktop"}
          sources={desktop.sources}
          chapters={desktop.chapters}
          groups={desktop.groups}
          labels={labels}
          endCard={endCard}
        />
      </div>
    </>
  );
}

function Player({
  variant,
  enabled,
  sources,
  chapters,
  groups,
  labels,
  endCard,
}: {
  variant: "ruler" | "compact";
  enabled: boolean;
  sources: ReelSource[];
  chapters: ReelChapter[];
  groups?: { label: string; from: number; to: number }[];
  labels: Labels;
  endCard: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const activeRef = useRef(0);
  const pendingSeek = useRef<number | null>(null);

  const [cur, setCur] = useState(0);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState(false); // primeiro frame já pintado (esconde o poster)
  const [userPaused, setUserPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [interacted, setInteracted] = useState(false);

  const gate = useVideoGate(stageRef, { threshold: 0.5 });
  const auto = enabled && gate.ready && gate.inView && !gate.hidden && !gate.reduced && !gate.saveData && !userPaused && !ended && !blocked;
  const needsButton = enabled && !shown && !playing && (gate.reduced || gate.saveData || blocked);

  const video = useCallback((i: number) => videoRefs.current[i] ?? null, []);

  const ensureSrc = useCallback(
    (i: number, preload: "auto" | "metadata") => {
      const v = video(i);
      if (!v) return null;
      if (!v.getAttribute("src")) {
        v.preload = preload;
        v.src = sources[i].src;
      } else if (preload === "auto") v.preload = "auto";
      return v;
    },
    [sources, video],
  );

  const play = useCallback(
    (i: number) => {
      const v = ensureSrc(i, "auto");
      if (!v) return;
      v.play().then(
        () => setBlocked(false),
        (err: DOMException) => {
          // AbortError = um pause() interrompeu; NotAllowed (Low Power Mode, política) é estado normal.
          if (err?.name === "NotAllowedError") setBlocked(true);
        },
      );
    },
    [ensureSrc, setBlocked],
  );

  // Autoplay e pausa automática (fora de vista, separador escondido).
  useEffect(() => {
    const v = video(cur);
    if (auto) play(cur);
    else if (v && !v.paused && (!gate.inView || gate.hidden || !enabled)) v.pause();
  }, [auto, cur, play, video, gate.inView, gate.hidden, enabled]);

  // Pré-carrega a fonte seguinte quando a atual entra no último capítulo.
  useEffect(() => {
    const ch = chapters[active];
    const next = cur + 1;
    const lastOfCur = chapters.reduce((last, c, i) => (c.source === cur ? i : last), -1);
    if (sources.length > next && ch.source === cur && lastOfCur === active) {
      ensureSrc(next, "metadata");
    }
  }, [active, cur, chapters, sources.length, ensureSrc]);

  // Progresso: um rAF só enquanto toca.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = video(cur);
      if (v) {
        const t = v.currentTime;
        let i = chapters.findIndex((c) => c.source === cur && t >= c.start && t < c.end);
        if (i < 0) i = activeRef.current;
        const c = chapters[i];
        const end = Math.min(c.end, Number.isFinite(v.duration) ? v.duration : c.end);
        const p = Math.max(0, Math.min(1, (t - c.start) / (end - c.start)));
        if (i !== activeRef.current) {
          activeRef.current = i;
          setActive(i);
          fillRefs.current.forEach((el, j) => {
            if (el && j !== i) el.style.transform = `scaleX(${j < i ? 1 : 0})`;
          });
        }
        const el = fillRefs.current[i];
        if (el) el.style.transform = `scaleX(${p})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, cur, chapters, video]);

  const goToSource = (i: number, at: number) => {
    const prev = video(cur);
    if (prev && i !== cur) prev.pause();
    setCur(i);
    const v = ensureSrc(i, "auto");
    if (!v) return;
    if (v.readyState >= 1) v.currentTime = at;
    else pendingSeek.current = at;
    play(i);
  };

  const select = (i: number) => {
    const c = chapters[i];
    setInteracted(true);
    setEnded(false);
    setUserPaused(false);
    activeRef.current = i;
    setActive(i);
    fillRefs.current.forEach((el, j) => {
      if (el) el.style.transform = `scaleX(${j < i ? 1 : 0})`;
    });
    goToSource(c.source, c.seekTo);
  };

  const togglePause = () => {
    setInteracted(true);
    const v = video(cur);
    if (playing && v) {
      v.pause();
      setUserPaused(true);
    } else {
      setUserPaused(false);
      setEnded(false);
      play(cur);
    }
  };

  const replay = () => {
    setInteracted(true);
    select(0);
  };

  const onEnded = (i: number) => {
    if (i !== cur) return;
    if (i + 1 < sources.length) {
      goToSource(i + 1, 0);
      return;
    }
    setPlaying(false);
    setEnded(true);
    const el = fillRefs.current[activeRef.current];
    if (el) el.style.transform = "scaleX(1)";
    if (rootRef.current?.contains(document.activeElement)) {
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("[data-end-title]")?.focus());
    }
  };

  const src = sources[cur];
  const compact = variant === "compact";

  const stage = (
    <div
      ref={stageRef}
      className={cn(
        "relative overflow-hidden",
        compact
          ? "rounded-[2rem] border-[6px] border-foreground/85 bg-card shadow-[0_30px_60px_-25px_rgb(40_30_10/0.45)]"
          : "rounded-2xl border border-border/50 bg-card/40",
      )}
      style={{ aspectRatio: compact ? "430 / 764" : "16 / 10" }}
      onClick={compact && !needsButton && !ended ? togglePause : undefined}
    >
      <Image
        src={sources[0].poster}
        alt=""
        fill
        sizes={compact ? "320px" : "(min-width: 1152px) 1100px, 100vw"}
        className="object-cover object-top"
      />
      {sources.map((s, i) => (
        <video
          key={s.src}
          ref={(el) => {
            videoRefs.current[i] = el;
          }}
          muted
          playsInline
          preload="none"
          disablePictureInPicture
          aria-label={s.alt}
          aria-hidden={i !== cur}
          onPlaying={() => {
            if (i !== cur) return;
            setPlaying(true);
            setShown(true);
          }}
          onPause={() => i === cur && setPlaying(false)}
          onEnded={() => onEnded(i)}
          onLoadedMetadata={(e) => {
            if (i === cur && pendingSeek.current !== null) {
              e.currentTarget.currentTime = pendingSeek.current;
              pendingSeek.current = null;
            }
          }}
          className={cn(
            "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-300 motion-reduce:transition-none",
            i === cur && shown ? "opacity-100" : "opacity-0",
          )}
        />
      ))}

      {needsButton && (
        <button
          type="button"
          data-track="hero_reel_start"
          onClick={(e) => {
            e.stopPropagation();
            setInteracted(true);
            setBlocked(false);
            play(cur);
          }}
          className="glass-frost absolute inset-0 m-auto flex h-fit w-fit flex-col items-center rounded-full px-4 py-2.5 text-sm font-semibold"
        >
          <span className="inline-flex items-center gap-2">
            <Play className="h-4 w-4" aria-hidden />
            {labels.startPlay}
          </span>
          {gate.saveData && <span className="text-[11px] font-normal text-muted-foreground">{src.sizeLabel}</span>}
        </button>
      )}

      {!needsButton && !ended && (
        <button
          type="button"
          aria-label={playing ? labels.pause : labels.play}
          data-track="hero_reel_pause"
          onClick={(e) => {
            e.stopPropagation();
            togglePause();
          }}
          className={cn(
            "glass-frost absolute grid place-items-center rounded-full",
            compact ? "bottom-[58px] right-2 h-11 w-11" : "bottom-3 right-3 h-10 w-10",
          )}
        >
          {playing ? <Pause className="h-[18px] w-[18px]" aria-hidden /> : <Play className="h-[18px] w-[18px]" aria-hidden />}
        </button>
      )}

      {ended && (
        <div className="glass-frost absolute inset-x-3 bottom-3 animate-in fade-in-0 rounded-2xl p-5 text-center duration-200 motion-reduce:animate-none md:inset-0 md:m-auto md:h-fit md:max-w-md md:p-6">
          {endCard}
          <Button variant="ghost" size="sm" data-track="hero_reel_replay" onClick={replay} className="mt-2">
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
            {labels.replay}
          </Button>
        </div>
      )}
    </div>
  );

  const bar = (
    <ChapterBar
      chapters={chapters}
      groups={groups}
      active={active}
      onSelect={select}
      variant={variant}
      label={labels.chapters}
      fillRefs={fillRefs}
    />
  );

  const caption = (
    <p
      aria-live={interacted ? "polite" : "off"}
      className={cn(
        "mx-auto text-center text-muted-foreground",
        compact ? "mt-2 min-h-[3lh] text-[13px] leading-snug" : "mt-3 min-h-[2lh] max-w-[64ch] text-[15px] leading-snug",
      )}
    >
      <span key={chapters[active].key} className="animate-in fade-in-0 duration-150 motion-reduce:animate-none">
        {chapters[active].caption}
      </span>
    </p>
  );

  if (compact) {
    return (
      <div ref={rootRef} className="mx-auto w-[min(78vw,320px)]">
        {stage}
        <div className="mt-3">{bar}</div>
        {caption}
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <MediaFrame
        alt={src.alt}
        address={src.address ?? BRAND.domain}
        addressAction={
          src.openHref ? (
            <Link
              href={src.openHref}
              data-track="hero_reel_open_msft"
              aria-label={labels.openPageAria}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {labels.openPage}
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          ) : undefined
        }
      >
        {stage}
      </MediaFrame>
      <div className="mt-4">{bar}</div>
      {caption}
    </div>
  );
}
