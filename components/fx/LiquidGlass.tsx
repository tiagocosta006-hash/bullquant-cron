"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * LiquidGlass — material iOS 26 com refração REAL confinada às bordas.
 *
 * O mapa de deslocamento é gerado por elemento a partir de um SDF de
 * retângulo arredondado: ~0 no centro (conteúdo por trás passa nítido)
 * e a subir junto às bordas (dobra o fundo como vidro espesso), com
 * aberração cromática subtil (3 passes R/G/B a scales diferentes).
 * Porta 1:1 da técnica validada em design/foundations (lab BullValue).
 *
 * Chromium-only para a lente; Safari/Firefox caem no frost via
 * `-webkit-backdrop-filter` (definido em globals.css `.glass`).
 * `frost` desativa a lente de propósito (topbars largas e baixas —
 * a refração numa faixa fina esborracha o texto que passa por baixo).
 */

// Tunables — mesmos valores afinados no lab (design/foundations)
const GLASS = { EDGE: 0.26, STRENGTH: 1.25, ABERR: 0.07, MAXRES: 340 };
const XLINK = "http://www.w3.org/1999/xlink";
let uid = 0;

function defsRoot(): SVGSVGElement {
  let root = document.getElementById("bq-glass-defs") as SVGSVGElement | null;
  if (!root) {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" id="bq-glass-defs" width="0" height="0" style="position:absolute;pointer-events:none" aria-hidden="true"></svg>';
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
    root = document.importNode(parsed, true) as unknown as SVGSVGElement;
    document.body.appendChild(root);
  }
  return root;
}

function roundedRectSDF(x: number, y: number, w: number, h: number, r: number) {
  const qx = Math.abs(x) - w + r;
  const qy = Math.abs(y) - h + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function smoothStep(a: number, b: number, t: number) {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Mapa de deslocamento edge-confined (R = dx, G = dy, B neutro). */
function buildLensMap(el: HTMLElement): { url: string; scale: number } | null {
  const rect = el.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  if (W < 2 || H < 2) return null;

  const minSide = Math.min(W, H);
  const band = Math.max(4, GLASS.EDGE * minSide); // espessura do anel de refração em px
  const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16, minSide / 2);
  const M = Math.max(W, H);
  const k = Math.min(1, GLASS.MAXRES / M);
  const mw = Math.max(2, Math.round(W * k));
  const mh = Math.max(2, Math.round(H * k));

  const cvs = document.createElement("canvas");
  cvs.width = mw;
  cvs.height = mh;
  const g = cvs.getContext("2d");
  if (!g) return null;
  const im = g.createImageData(mw, mh);
  const d = im.data;
  const dxs = new Float32Array(mw * mh);
  const dys = new Float32Array(mw * mh);
  let maxS = 0;
  const cx = W / 2;
  const cy = H / 2;

  for (let py = 0; py < mh; py++) {
    for (let px = 0; px < mw; px++) {
      const idx = py * mw + px;
      const fx = ((px + 0.5) / mw) * W;
      const fy = ((py + 0.5) / mh) * H;
      const x = fx - cx;
      const y = fy - cy;
      const dist = roundedRectSDF(x, y, cx, cy, radius); // px; <0 dentro, ~0 na borda
      const edge = smoothStep(0, 1, smoothStep(-band, 0, dist)); // 0 no interior → 1 no anel
      const len = Math.sqrt(x * x + y * y) || 1;
      const mag = edge * GLASS.STRENGTH * band; // deslocamento ∝ espessura → igual em qualquer aspeto
      const dx = (-x / len) * mag;
      const dy = (-y / len) * mag;
      dxs[idx] = dx;
      dys[idx] = dy;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax > maxS) maxS = ax;
      if (ay > maxS) maxS = ay;
    }
  }
  if (maxS < 0.01) maxS = 0.01;
  for (let i = 0; i < mw * mh; i++) {
    const j = i * 4;
    d[j] = Math.max(0, Math.min(255, Math.round((dxs[i] / maxS) * 127.5 + 127.5)));
    d[j + 1] = Math.max(0, Math.min(255, Math.round((dys[i] / maxS) * 127.5 + 127.5)));
    d[j + 2] = 128;
    d[j + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return { url: cvs.toDataURL(), scale: maxS };
}

/** Filtro por elemento: 3 displacement passes (R/G/B) recombinados → fringe subtil no rim. */
function makeLensFilter(id: string): SVGFilterElement {
  const inner =
    '<feImage result="map" preserveAspectRatio="none"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" result="dr"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" result="dg"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" result="db"/>' +
    '<feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cr"/>' +
    '<feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cg"/>' +
    '<feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cb"/>' +
    '<feBlend mode="screen" in="cr" in2="cg" result="crg"/>' +
    '<feBlend mode="screen" in="crg" in2="cb"/>';
  const markup = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${inner}</filter></svg>`;
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml").querySelector("filter")!;
  const filter = document.importNode(parsed, true);
  defsRoot().appendChild(filter);
  return filter;
}

interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Só frost (blur), sem lente SDF. */
  frost?: boolean;
  /** O efeito desvanece verticalmente (banners/headers full-width) —
   *  a lente continua ativa mas vive num ::before mascarado. */
  fade?: boolean;
}

export function LiquidGlass({ frost = false, fade = false, className, children, ...rest }: LiquidGlassProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (frost) return;
    const el = ref.current;
    if (!el) return;
    // Sem suporte a filtro SVG no backdrop (Safari/FF) → frost e sai
    if (typeof CSS === "undefined" || !CSS.supports("backdrop-filter", "url(#x) blur(1px)")) {
      el.classList.add("glass-frost");
      return;
    }

    const id = `glass-lens-${uid++}`;
    const filter = makeLensFilter(id);
    let t: ReturnType<typeof setTimeout>;

    const refresh = () => {
      const res = buildLensMap(el);
      if (!res) return;
      const maps = filter.getElementsByTagName("feDisplacementMap");
      const A = GLASS.ABERR;
      maps[0].setAttribute("scale", (res.scale * (1 + A)).toFixed(2));
      maps[1].setAttribute("scale", res.scale.toFixed(2));
      maps[2].setAttribute("scale", (res.scale * (1 - A)).toFixed(2));
      const fe = filter.getElementsByTagName("feImage")[0];
      fe.setAttribute("href", res.url);
      fe.setAttributeNS(XLINK, "xlink:href", res.url);
    };

    // Fix Layout Thrashing (Forced Synchronous Layout):
    // Primeiro executar a leitura de geometria (getBoundingClientRect dentro do refresh),
    // e só depois fazer a escrita/invalidação de estilos (setProperty)
    refresh();
    el.style.setProperty("--lens", `url(#${id})`);

    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(refresh, 120);
    });
    ro.observe(el);
    document.fonts?.ready.then(() => requestAnimationFrame(refresh));

    return () => {
      clearTimeout(t);
      ro.disconnect();
      el.style.removeProperty("--lens");
      filter.remove();
    };
  }, [frost]);

  return (
    <div
      ref={ref}
      className={cn("glass", frost && "glass-frost", fade && "glass-fade", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
