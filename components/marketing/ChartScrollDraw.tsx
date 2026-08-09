"use client";

import { useCallback, useEffect, useRef } from "react";
import { BarChart3, Maximize2, Table2 } from "lucide-react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * ChartScrollDraw — a Story 1 mostra os DOIS gráficos reais que o produto
 * tem em /stock/[ticker] (Fundamentais): Receita (barras) e FCF (barra +
 * linhas OCF/CapEx) — os mesmos dataKeys/cores do motor de gráficos
 * financeiros real da app (components/stock/*, ver nota abaixo).
 * Cada painel vive agora dentro de um "cartão" com o chrome real do cartão
 * de gráfico da app (título, CAGR, cluster de ícones). Sem toggle de período
 * decorativo — lia-se como fake (removido, feedback do Alex). O SVG continua
 * único (a lente atravessa os dois painéis); os cartões glass são camadas absolutas atrás,
 * alinhadas por percentagens DERIVADAS das constantes de geometria.
 * Com o scroll (scrub), as barras crescem da baseline com stagger, as linhas
 * de OCF/CapEx traçam-se (dashoffset) e os labels finais aparecem. Sem
 * motion, o gráfico está completo desde o primeiro paint.
 */
// Exportados (não só usados aqui): components/marketing/MiniChart.tsx reutiliza
// esta geometria/dados para os 3 mini-gráficos do TerminalMock (Fundamentais) —
// mesmos números, mesmas cores, coerência total com a Story 01. Este ficheiro
// nunca importa a lib de gráficos client-side usada na app real (components/
// stock/*), por isso é seguro reexportar estes símbolos puros para o resto do
// bundle de marketing (ver nota em MiniChart.tsx sobre o que NUNCA se pode
// importar de components/stock/*).
export const REVENUE = [38, 42, 47, 52, 60, 66, 71, 78, 86, 95]; // B$, 2016–2025
export const FCF = [11, 13, 15, 18, 22, 25, 28, 32, 37, 42];
export const CAPEX = [3, 4, 4, 5, 6, 7, 8, 9, 10, 12];
export const OCF = FCF.map((v, i) => v + CAPEX[i]); // FCF = OCF − CapEx (mesma fórmula do produto)
export const FIRST_YEAR = 2016;

export const W = 560;
export const H = 540;
export const PAD = 8;
export const STEP = (W - PAD * 2) / REVENUE.length;
export const BAR_W = 30;

// Painel A — Receita (só barras, igual ao gráfico real `charts.revenue`);
// o topo abre espaço ao header do cartão (título + CAGR + ícones em HTML)
const A_TOP = 64;
const A_BASE = 208;
const A_SCALE = (A_BASE - A_TOP) / Math.max(...REVENUE);

// Painel B — FCF composto (barra FCF + linha OCF + linha CapEx), igual ao
// gráfico real `charts.freeCashFlow` (type COMPOSED); escala partilhada
// pelo maior valor (OCF) para as três séries ficarem no mesmo eixo.
const B_TOP = 298;
const B_BASE = 476;
const B_SCALE = (B_BASE - B_TOP) / Math.max(...OCF);

// Cartões glass atrás do SVG — limites em unidades do viewBox, convertidos
// em percentagens (o SVG mantém o aspeto: viewBox fixo + w-full h-auto,
// por isso as camadas HTML alinham em qualquer largura).
const CARD_A_TOP = 0;
const CARD_A_BOTTOM = A_BASE + 16; // 224
const CARD_B_TOP = A_BASE + 32; // 240 — gap de 16 entre cartões
const CARD_B_BOTTOM = H; // inclui o eixo temporal
const pct = (v: number) => `${((v / H) * 100).toFixed(3)}%`;

// CAGR real dos dados mock, no mesmo formato do cartão real ((cagr*100).toFixed(1))
// Exportado — MiniChart.tsx reutiliza para calcular o CAGR dos mesmos dados.
export const calcCagr = (arr: number[]) =>
  `+${((Math.pow(arr[arr.length - 1] / arr[0], 1 / (arr.length - 1)) - 1) * 100).toFixed(1)}%`;
const CAGR_REVENUE = calcCagr(REVENUE);
const CAGR_FCF = calcCagr(FCF);

/** header decorativo de cartão, copiado do chrome real do cartão de gráfico da app */
function ChartCardChrome({
  title,
  cagrLabel,
  cagr,
}: {
  title: string;
  cagrLabel: string;
  cagr: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-4 pt-3">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="truncate text-base font-bold leading-tight text-foreground">{title}</span>
        <span className="nums text-xs font-semibold text-muted-foreground">
          {cagrLabel}: <span className="text-bull">{cagr}</span>
        </span>
      </div>
      <div className="flex shrink-0 gap-1 rounded-md border border-border/40 bg-muted/50 p-1">
        <span className="rounded bg-background p-1 text-foreground shadow-sm">
          <BarChart3 className="h-3.5 w-3.5" />
        </span>
        <span className="rounded p-1 text-muted-foreground">
          <Table2 className="h-3.5 w-3.5" />
        </span>
        <span className="rounded p-1 text-muted-foreground">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

// barX/cx/barPath/lineD são exportados — MiniChart.tsx reutiliza esta
// geometria pura (SVG à mão, sem lib de gráficos) para desenhar os
// mini-gráficos do TerminalMock.
export const barX = (i: number) => PAD + i * STEP + (STEP - BAR_W) / 2;
export const cx = (i: number) => PAD + i * STEP + STEP / 2;
const yA = (v: number) => A_BASE - v * A_SCALE;
const yB = (v: number) => B_BASE - v * B_SCALE;

/** barra com topo arredondado (4px) e base reta na baseline do painel */
export function barPath(i: number, v: number, base: number, yFn: (v: number) => number) {
  const x = barX(i);
  const top = yFn(v);
  const r = 4;
  return [
    `M${x} ${base}`,
    `V${top + r}`,
    `Q${x} ${top} ${x + r} ${top}`,
    `H${x + BAR_W - r}`,
    `Q${x + BAR_W} ${top} ${x + BAR_W} ${top + r}`,
    `V${base}`,
    "Z",
  ].join(" ");
}

export const lineD = (arr: number[], yFn: (v: number) => number) =>
  arr.map((v, i) => `${i === 0 ? "M" : "L"}${cx(i)} ${yFn(v)}`).join(" ");

/** largura do tooltip, em unidades do viewBox (partilhada com o flip em paint) */
const TT_W = 128;

const OCF_LINE_D = lineD(OCF, yB);
const CAPEX_LINE_D = lineD(CAPEX, yB);
const GRID_FRACS = [0.25, 0.5, 0.75];

export function ChartScrollDraw({
  ariaLabel,
  legendRevenue,
  legendFcf,
  cardRevenueTitle,
  cardFcfTitle,
  cagrLabel,
  className,
}: {
  ariaLabel: string;
  legendRevenue: string;
  legendFcf: string;
  cardRevenueTitle: string;
  cardFcfTitle: string;
  cagrLabel: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ocfLineRef = useRef<SVGPathElement>(null);
  const capexLineRef = useRef<SVGPathElement>(null);

  /**
   * ── Crosshair de leitura (ex-"lente de análise").
   *
   * Era um feixe dourado de 28px de largura com máscara vertical, mais duas
   * bolas douradas fantasma a arrastar-se atrás do cursor ("cauda de cometa").
   * Duas coisas más: a coluna de luz acabava a meio do segundo cartão (onde
   * estava o dot) e lia-se como um artefacto de render, não como um cursor; e
   * nenhum terminal financeiro a sério desenha isto — é decoração.
   *
   * Agora é o que a app real (Recharts) faz: uma hairline vertical neutra por
   * painel, o dot no ponto lido, e o tooltip. Sobra a interação, desaparece o
   * brilho. O lag suave (quickTo) mantém-se — isso é feel, não decoração.
   */
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorRef = useRef<SVGGElement>(null);
  const cursorDotRef = useRef<SVGCircleElement>(null);
  const tooltipRef = useRef<SVGGElement>(null);
  const ttYearRef = useRef<SVGTextElement>(null);
  const ttRevRef = useRef<SVGTextElement>(null);
  const ttFcfRef = useRef<SVGTextElement>(null);
  const fadeToRef = useRef<((v: number) => void) | null>(null);
  const hoverRef = useRef(false);
  const proxyRef = useRef({ p: REVENUE.length - 1 });
  const pToRef = useRef<((v: number) => void) | null>(null);
  const barsRef = useRef<SVGPathElement[]>([]);

  /**
   * paint(p) — desenha a lente inteira a partir de uma posição CONTÍNUA
   * (0..9 float). O dot desliza sobre a linha de OCF (painel B) — é este
   * contínuo que dá o feel Revolut/Apple: os números do tooltip fluem, e
   * o realce das barras (ambos os painéis, mesmo índice partilhado) é uma
   * onda gaussiana sem degraus.
   */
  const paint = useCallback((p: number) => {
    const group = cursorRef.current;
    const svg = svgRef.current;
    if (!group || !svg) return;
    const c = Math.min(REVENUE.length - 1, Math.max(0, p));
    const i0 = Math.floor(c);
    const i1 = Math.min(REVENUE.length - 1, i0 + 1);
    const f = c - i0;
    const lerp = (a: number, b: number) => a + (b - a) * f;
    const x = PAD + STEP / 2 + c * STEP;
    const y = yB(lerp(OCF[i0], OCF[i1]));
    const nearest = Math.round(c);

    gsap.set(group, { x });
    cursorDotRef.current?.setAttribute("cy", y.toFixed(1));

    // números interpolados — fluem enquanto arrastas
    const rev = lerp(REVENUE[i0], REVENUE[i1]);
    const fcf = lerp(FCF[i0], FCF[i1]);
    const yoy =
      nearest > 0
        ? `+${Math.round(((REVENUE[nearest] - REVENUE[nearest - 1]) / REVENUE[nearest - 1]) * 100)}%`
        : "—";
    if (ttYearRef.current) ttYearRef.current.textContent = String(FIRST_YEAR + nearest);
    if (ttRevRef.current) ttRevRef.current.textContent = `$${Math.round(rev)}B · ${yoy}`;
    if (ttFcfRef.current) ttFcfRef.current.textContent = `$${Math.round(fcf)}B`;
    if (tooltipRef.current) {
      const flip = nearest >= REVENUE.length - 3;
      // TT_W + o mesmo afastamento de 12 do outro lado do crosshair
      tooltipRef.current.setAttribute("transform", `translate(${flip ? -(TT_W + 12) : 12} 0)`);
    }

    /* Realce das barras: a coluna lida em cheio, as outras recuam — o mesmo
       que qualquer gráfico faz em hover.
       Antes era uma onda gaussiana que dava a CADA barra uma opacidade
       diferente conforme a distância ao cursor. Em movimento lia-se como
       barras a piscar sem razão, e numa captura estática parecia que as
       barras tinham valores de opacidade aleatórios — um bug, não um realce.
       Dois estados só: lida / não lida. */
    if (!barsRef.current.length) {
      barsRef.current = Array.from(svg.querySelectorAll<SVGPathElement>("[data-bar]"));
    }
    barsRef.current.forEach((bar, i) => {
      const idx = Number(bar.dataset.idx ?? i);
      bar.style.opacity = idx === nearest ? "1" : "0.55";
    });
  }, []);

  /** alvo contínuo com suavização (quickTo sobre o proxy → paint) */
  const showP = useCallback(
    (p: number) => {
      const group = cursorRef.current;
      if (!group) return;
      if (prefersReducedMotion()) {
        paint(p);
        group.style.opacity = "1";
        return;
      }
      if (!pToRef.current) {
        // primeiro movimento: aterra sem deslizar desde a posição antiga
        proxyRef.current.p = p;
        paint(p);
        const proxy = proxyRef.current;
        pToRef.current = gsap.quickTo(proxy, "p", {
          duration: 0.5,
          ease: "power3.out",
          onUpdate: () => paint(proxy.p),
        });
        fadeToRef.current = gsap.quickTo(group, "opacity", { duration: 0.25, ease: "power2.out" });
      }
      pToRef.current(p);
      fadeToRef.current?.(1);
    },
    [paint],
  );

  const moveCursor = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      // posição CONTÍNUA — nada de snap a índices
      const p = Math.min(REVENUE.length - 1, Math.max(0, (px - PAD - STEP / 2) / STEP));
      hoverRef.current = true;
      showP(p);
    },
    [showP],
  );

  const hideLens = useCallback(() => {
    const group = cursorRef.current;
    if (!group) return;
    if (prefersReducedMotion() || !fadeToRef.current) group.style.opacity = "0";
    else fadeToRef.current(0);
    // devolver as barras ao estado de repouso
    svgRef.current?.querySelectorAll<SVGPathElement>("[data-bar]").forEach((bar) => {
      gsap.to(bar, { opacity: 0.9, duration: 0.35, ease: "power2.out", overwrite: "auto" });
    });
  }, []);

  const leaveCursor = useCallback(() => {
    hoverRef.current = false;
    hideLens();
  }, [hideLens]);

  // Attract mode: sem ponteiro em cima, um cursor-fantasma passeia pelos
  // 10 anos a cada ~9s — a interatividade a vender-se sozinha (e a única
  // forma de mobile ver esta camada). O hover real ganha sempre.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const svg = svgRef.current;
    if (!svg) return;
    const state = { i: 0 };
    let tl: gsap.core.Timeline | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        tl?.kill();
        if (!e.isIntersecting) {
          hideLens();
          return;
        }
        tl = gsap
          .timeline({ repeat: -1, repeatDelay: 5.5, delay: 1.5 })
          .set(state, { i: 0 })
          .call(() => {
            if (!hoverRef.current) showP(0);
          })
          .to(state, {
            i: REVENUE.length - 1,
            duration: 3.4,
            ease: "power1.inOut",
            onUpdate: () => {
              if (!hoverRef.current) showP(state.i);
            },
          })
          .to({}, { duration: 0.8 })
          .call(() => {
            if (!hoverRef.current) hideLens();
          });
      },
      { threshold: 0.6 },
    );
    io.observe(svg);
    return () => {
      io.disconnect();
      tl?.kill();
    };
  }, [showP, hideLens]);

/**
 * JANELA DE SCROLL ÚNICA para toda a secção.
 *
 * Havia quatro `scrollTrigger` com intervalos diferentes (88→34%, 72→26%,
 * 68→22%, 40→24%): as barras acabavam enquanto as linhas ainda iam a meio e
 * os cartões corriam num terceiro horário. O olho não lê isso como
 * profundidade — lê como partes desalinhadas a andar a ritmos diferentes.
 *
 * Com uma janela só, tudo progride em conjunto. O escalonamento interno
 * (stagger das barras) mantém-se, porque esse acontece DENTRO da mesma
 * timeline e é intencional.
 */
const WINDOW = { start: "top 78%", end: "top 32%", scrub: 0.5 } as const;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const root = rootRef.current;
        const ocfLine = ocfLineRef.current;
        const capexLine = capexLineRef.current;
        if (!root || !ocfLine || !capexLine) return;
        const ocfLen = ocfLine.getTotalLength();
        const capexLen = capexLine.getTotalLength();

        gsap.fromTo(
          root.querySelectorAll("[data-bar]"),
          { scaleY: 0, transformOrigin: "50% 100%" },
          {
            scaleY: 1,
            stagger: 0.05,
            ease: "none",
            scrollTrigger: { trigger: root, ...WINDOW },
          },
        );
        gsap.fromTo(
          ocfLine,
          { strokeDasharray: ocfLen, strokeDashoffset: ocfLen },
          {
            strokeDashoffset: 0,
            ease: "none",
            scrollTrigger: { trigger: root, ...WINDOW },
          },
        );
        gsap.fromTo(
          capexLine,
          { strokeDasharray: capexLen, strokeDashoffset: capexLen },
          {
            strokeDashoffset: 0,
            ease: "none",
            scrollTrigger: { trigger: root, ...WINDOW },
          },
        );
        gsap.fromTo(
          root.querySelectorAll("[data-pop]"),
          { opacity: 0, scale: 0.6, transformOrigin: "50% 50%" },
          {
            opacity: 1,
            scale: 1,
            ease: "none",
            scrollTrigger: { trigger: root, ...WINDOW },
          },
        );
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="relative">
        {/* cartões glass atrás do SVG, alinhados aos painéis por percentagens
            derivadas das constantes de geometria; o header (chrome real do
            cartão de gráfico da app) vive dentro de cada cartão, o SVG por cima */}
        <div
          aria-hidden
          className="glass absolute inset-x-0 rounded-xl"
          style={{ top: pct(CARD_A_TOP), height: pct(CARD_A_BOTTOM - CARD_A_TOP) }}
        >
          <ChartCardChrome title={cardRevenueTitle} cagrLabel={cagrLabel} cagr={CAGR_REVENUE} />
        </div>
        <div
          aria-hidden
          className="glass absolute inset-x-0 rounded-xl"
          style={{ top: pct(CARD_B_TOP), height: pct(CARD_B_BOTTOM - CARD_B_TOP) }}
        >
          <ChartCardChrome title={cardFcfTitle} cagrLabel={cagrLabel} cagr={CAGR_FCF} />
        </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="relative z-10 h-auto w-full"
        onPointerMove={moveCursor}
        onPointerLeave={leaveCursor}
      >
        {/* grelha recessiva — painel A (Receita) */}
        {GRID_FRACS.map((f) => (
          <line
            key={`a-${f}`}
            x1={PAD}
            x2={W - PAD}
            y1={yA(f * Math.max(...REVENUE))}
            y2={yA(f * Math.max(...REVENUE))}
            stroke="var(--border)"
            strokeDasharray="2 6"
            strokeWidth="1"
          />
        ))}
        <line x1={PAD} x2={W - PAD} y1={A_BASE} y2={A_BASE} stroke="var(--border)" strokeWidth="1" />

        {/* painel A — Receita (só barras, igual ao gráfico real) */}
        {REVENUE.map((v, i) => (
          <path
            key={`rev-${i}`}
            data-bar
            data-idx={i}
            d={barPath(i, v, A_BASE, yA)}
            fill="var(--chart-1)"
            opacity="0.9"
          >
            <title>{`${FIRST_YEAR + i} · $${v}B`}</title>
          </path>
        ))}

        {/* grelha recessiva — painel B (FCF composto) */}
        {GRID_FRACS.map((f) => (
          <line
            key={`b-${f}`}
            x1={PAD}
            x2={W - PAD}
            y1={yB(f * Math.max(...OCF))}
            y2={yB(f * Math.max(...OCF))}
            stroke="var(--border)"
            strokeDasharray="2 6"
            strokeWidth="1"
          />
        ))}
        <line x1={PAD} x2={W - PAD} y1={B_BASE} y2={B_BASE} stroke="var(--border)" strokeWidth="1" />

        {/* painel B — FCF (barra) + OCF (linha) + CapEx (linha), specs reais */}
        {FCF.map((v, i) => (
          <path
            key={`fcf-${i}`}
            data-bar
            data-idx={i}
            d={barPath(i, v, B_BASE, yB)}
            fill="var(--chart-1)"
            opacity="0.9"
          >
            <title>{`${FIRST_YEAR + i} · FCF $${v}B`}</title>
          </path>
        ))}
        <path
          ref={capexLineRef}
          d={CAPEX_LINE_D}
          fill="none"
          stroke="var(--chart-4)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
        <path
          ref={ocfLineRef}
          d={OCF_LINE_D}
          fill="none"
          stroke="var(--chart-5)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          data-pop
          cx={cx(OCF.length - 1)}
          cy={yB(OCF[OCF.length - 1])}
          r="4.5"
          fill="var(--chart-5)"
          stroke="var(--background)"
          strokeWidth="2"
        />

        {/* labels diretos (tinta plena — cinzento não se lê em dark) */}
        {/* ACIMA do dot, este label caía a ~284 e o header do cartão (título +
            cluster de ícones) acaba a ~265: encostava aos ícones e lia-se como
            se fizesse parte deles. À ESQUERDA do dot, à mesma altura, tem o
            espaço todo — a linha de OCF nesse troço vai 20+ unidades abaixo. */}
        <text
          data-pop
          x={cx(OCF.length - 1) - 14}
          y={yB(OCF[OCF.length - 1]) + 4}
          textAnchor="end"
          className="nums"
          fontSize="12"
          fontWeight="600"
          fill="var(--chart-5)"
        >
          {`OCF · $${OCF[OCF.length - 1]}B`}
        </text>
        {/* Ancorados a END na margem direita, não a MIDDLE sobre a última
            barra: centrado, o texto passava dos 560 do viewBox e o SVG (que
            recorta) cortava-lhe o fim. */}
        <text
          data-pop
          x={W - PAD}
          y={yB(FCF[FCF.length - 1]) - 10}
          textAnchor="end"
          className="nums"
          fontSize="13"
          fontWeight="600"
          fill="var(--foreground)"
        >
          {`${legendFcf} · $${FCF[FCF.length - 1]}B`}
        </text>
        <text
          data-pop
          x={W - PAD}
          y={yA(REVENUE[REVENUE.length - 1]) - 10}
          textAnchor="end"
          className="nums"
          fontSize="13"
          fontWeight="600"
          fill="var(--foreground)"
        >
          {`$${REVENUE[REVENUE.length - 1]}B`}
        </text>

        {/* crosshair de leitura — segue o cursor (ver showP) */}
        <g ref={cursorRef} aria-hidden="true" style={{ opacity: 0 }} pointerEvents="none">
          {/* DOIS segmentos, um por painel, em vez de uma linha contínua: os
              cartões têm um gap de 16px entre si e uma linha inteira ficava a
              atravessar o vazio entre eles, como se flutuasse por cima da
              composição. Assim a hairline vive dentro de cada cartão. */}
          <line
            x1={0}
            x2={0}
            y1={A_TOP - 4}
            y2={A_BASE}
            stroke="var(--foreground)"
            strokeOpacity="0.22"
            strokeWidth="1"
          />
          <line
            x1={0}
            x2={0}
            y1={B_TOP - 24}
            y2={B_BASE}
            stroke="var(--foreground)"
            strokeOpacity="0.22"
            strokeWidth="1"
          />
          {/* dot no ponto lido da linha de OCF — sem drop-shadow dourado */}
          <circle
            ref={cursorDotRef}
            cx={0}
            cy={yB(OCF[OCF.length - 1])}
            r="4.5"
            fill="var(--chart-5)"
            stroke="var(--background)"
            strokeWidth="2"
          />
          {/* tooltip (rect + textos SVG; flip de lado nas bordas) */}
          <g ref={tooltipRef} transform={`translate(12 0)`}>
            {/* opaco, não translúcido: por cima das barras, um fundo a 88%
                deixava passar o ouro e os números perdiam contraste */}
            <rect
              x={0}
              y={A_TOP - 6}
              width={TT_W}
              height={58}
              rx={8}
              fill="var(--card)"
              stroke="var(--border)"
            />
            <text
              ref={ttYearRef}
              x={12}
              y={A_TOP + 12}
              className="nums"
              fontSize="12"
              fontWeight="700"
              fill="var(--foreground)"
            >
              {FIRST_YEAR + REVENUE.length - 1}
            </text>
            <circle cx={16} cy={A_TOP + 26} r={3.5} fill="var(--chart-1)" />
            <text
              ref={ttRevRef}
              x={26}
              y={A_TOP + 30}
              className="nums"
              fontSize="11.5"
              fontWeight="600"
              fill="var(--foreground)"
            >
              {`$${REVENUE[REVENUE.length - 1]}B · +10%`}
            </text>
            <rect x={12.5} y={A_TOP + 39.5} width={8} height={2.5} rx={1.25} fill="var(--chart-1)" />
            <text
              ref={ttFcfRef}
              x={26}
              y={A_TOP + 45}
              className="nums"
              fontSize="11.5"
              fontWeight="600"
              fill="var(--foreground)"
            >
              {`$${FCF[FCF.length - 1]}B`}
            </text>
          </g>
        </g>

        {/* eixo temporal: primeiro/último ano */}
        <text
          x={barX(0)}
          y={H - 14}
          fontSize="12"
          className="nums"
          fill="var(--foreground)"
          fillOpacity="0.7"
        >
          {FIRST_YEAR}
        </text>
        <text
          x={barX(REVENUE.length - 1) + BAR_W}
          y={H - 14}
          textAnchor="end"
          fontSize="12"
          className="nums"
          fill="var(--foreground)"
          fillOpacity="0.7"
        >
          {FIRST_YEAR + REVENUE.length - 1}
        </text>
      </svg>
      </div>

      {/* legenda — as 4 séries dos 2 gráficos reais (Receita; FCF/OCF/CapEx) */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-xs font-medium text-foreground/70">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--chart-1)]" aria-hidden />
          {legendRevenue}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--chart-1)]" aria-hidden />
          {legendFcf}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-[var(--chart-5)]" aria-hidden />
          OCF
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-[var(--chart-4)]" aria-hidden />
          CapEx
        </span>
      </div>
    </div>
  );
}
