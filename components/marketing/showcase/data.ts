import shotsJson from "./shots.json";

/**
 * Dados da versão C da landing ("Polegar primeiro"): capítulos do vídeo do
 * hero e recortes dos prints. Os retângulos e as marcas vivem em shots.json,
 * em px do print de 1920x1200, que é a fonte única também para
 * scripts/media/landing-c.mjs (gera os WebP). Se os prints forem recapturados,
 * ajusta-se o shots.json, sobe-se `version` e corre-se o script.
 */

export type ShotKey = "fund" | "val" | "dcf" | "fmva" | "ai" | "cal";
export const SHOT_KEYS: ShotKey[] = ["fund", "val", "dcf", "fmva", "ai", "cal"];

type Rect = { x: number; y: number; w: number; h: number };
type Mark = { x: number; y: number; d?: boolean };
type Shot = {
  wide: Rect;
  square: { x: number; y: number; s: number };
  fade: string[];
  marks: Mark[];
};

const SHOTS = shotsJson.shots as Record<ShotKey, Shot>;
const V = shotsJson.version > 1 ? `.v${shotsJson.version}` : "";
export const PRINT = { w: 1920, h: 1200 };

export const shotPaths = (k: ShotKey) => ({
  wide: `/media/c/shots/${k}-wide${V}.webp`,
  square: `/media/c/shots/${k}-square${V}.webp`,
  full: `/media/c/shots/${k}-full${V}.webp`,
});

export type MarkPos = { n: number; left: string; top: string };

/** Posição da marca em % do recorte; null se cair fora (3-97%) ou for só do wide. */
function markPosition(m: Mark, r: Rect, view: "wide" | "square" | "full"): { left: string; top: string } | null {
  if (m.d && view === "square") return null;
  const left = ((m.x - r.x) / r.w) * 100;
  const top = ((m.y - r.y) / r.h) * 100;
  if (left < 3 || left > 97 || top < 3 || top > 97) return null;
  return { left: `${left.toFixed(2)}%`, top: `${top.toFixed(2)}%` };
}

/** Marcas visíveis numa vista, numeradas pela ordem do shots.json (m1, m2, m3). */
export function shotMarks(k: ShotKey, view: "wide" | "square" | "full"): MarkPos[] {
  const s = SHOTS[k];
  const r: Rect =
    view === "wide" ? s.wide : view === "square" ? { x: s.square.x, y: s.square.y, w: s.square.s, h: s.square.s } : { x: 0, y: 0, ...PRINT };
  return s.marks.flatMap((m, i) => {
    const p = markPosition(m, r, view);
    return p ? [{ n: i + 1, ...p }] : [];
  });
}

export const shotFade = (k: ShotKey) => ({ wide: SHOTS[k].fade.includes("wide"), square: SHOTS[k].fade.includes("square") });

/** Centro de um recorte em fração do print (para o scroll inicial do lightbox). */
export function shotFocus(k: ShotKey, view: "wide" | "square") {
  const s = SHOTS[k];
  const r = view === "wide" ? s.wide : { x: s.square.x, y: s.square.y, w: s.square.s, h: s.square.s };
  return { cx: (r.x + r.w / 2) / PRINT.w, cy: (r.y + r.h / 2) / PRINT.h };
}

// ── Vídeo do hero ────────────────────────────────────────────────────────
// Reencodados com keyframe a cada 1 s (saltos de capítulo imediatos).

// `mb` = tamanho do ficheiro, mostrado a quem tem Save-Data ligado.
export const REEL_MEDIA = {
  terminal: { src: "/media/c/showcase-terminal.mp4", poster: "/media/c/showcase-terminal.webp", mb: 4.8 },
  tour: { src: "/media/c/feature-tour.mp4", poster: "/media/c/feature-tour.webp", mb: 2.5 },
  mobile: { src: "/media/c/showcase-mobile.mp4", poster: "/media/c/showcase-mobile.webp", mb: 1.6 },
};

export type ChapterKey = "resumo" | "fund" | "ai" | "val" | "dcf" | "fmva";

/**
 * Tempos medidos frame a frame (0,5 s). `seekTo` salta os frames de
 * carregamento quando a pessoa escolhe o capítulo; a reprodução natural passa
 * por tudo. `weight` = duração, define a largura na régua do desktop.
 */
export const DESKTOP_CHAPTERS: { key: ChapterKey; source: number; start: number; end: number; seekTo: number }[] = [
  { key: "resumo", source: 0, start: 0, end: 6.6, seekTo: 0 },
  { key: "fund", source: 0, start: 6.6, end: 14.6, seekTo: 8 },
  { key: "ai", source: 0, start: 14.6, end: 20.8, seekTo: 15 },
  { key: "val", source: 0, start: 20.8, end: 99, seekTo: 21 },
  { key: "dcf", source: 1, start: 0, end: 15.3, seekTo: 0 },
  { key: "fmva", source: 1, start: 15.3, end: 99, seekTo: 15.6 },
];
/** Duração real de cada fonte, só para a largura da régua. */
export const DESKTOP_DURATIONS = [27.73, 28.6];

export const MOBILE_CHAPTERS: { key: ChapterKey; start: number; end: number; seekTo: number }[] = [
  { key: "resumo", start: 0, end: 6.8, seekTo: 0 },
  { key: "fund", start: 6.8, end: 14.8, seekTo: 9.5 },
  { key: "ai", start: 14.8, end: 22.3, seekTo: 18.5 },
  { key: "val", start: 22.3, end: 99, seekTo: 24.4 },
];
