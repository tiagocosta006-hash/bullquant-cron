"use client";

import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PortfolioReplica — mock fiel de: components/portfolio/PortfolioSummary.tsx
 * (stats), o gráfico real de evolução do portfólio em components/portfolio/
 * (mini área — SVG à mão, NUNCA a lib de gráficos client-side da app, mesmo
 * gradiente #10b981/tabs) e o gráfico real de alocação em components/
 * portfolio/ (barras + CHART_COLORS). Sem fetch, dados hardcoded; labels via
 * props (chaves reais de portfolio.*).
 */

const VALUE_TABS = ["1m", "6m", "1y", "max"] as const;

const AREA_W = 280;
const AREA_H = 56;

/**
 * Curva de evolução do portfólio.
 *
 * Eram 12 pontos ligados por segmentos retos — um zigzag grosseiro que não se
 * parecia com nada: nem com uma série de valor real, nem com o gráfico da app.
 * São agora ~44 amostras de um passeio aleatório com deriva, desenhadas com
 * Catmull-Rom convertido a Bézier, porque o gráfico REAL do portfólio é um
 * Recharts `type="monotone"` — ou seja, curvo. Um zigzag aqui era infiel ao
 * produto além de feio.
 *
 * LCG semeado (determinístico) e não `Math.random()`: este componente também
 * renderiza no servidor, e valores diferentes dos dois lados = mismatch de
 * hidratação.
 */
const SAMPLES = 44;

function buildValueSeries() {
  let s = 424242;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pts: number[] = [];
  let v = 12;
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    /* Deriva convexa MENOS um recuo inicial. O recuo não é decoração: sem ele
       a série começava no seu próprio mínimo, a linha de referência do valor
       inicial caía em cima do chão do gráfico e não separava nada. Com uma
       queda logo no início há mesmo um período abaixo do custo — que é o que
       um portfólio real faz e o que dá sentido à leitura acima/abaixo. */
    const drift =
      12 + 44 * Math.pow(t, 1.25) - 11 * Math.exp(-Math.pow((t - 0.17) / 0.15, 2));
    v += (rnd() - 0.46) * 4.2;
    v += (drift - v) * 0.28;
    pts.push(v);
  }
  return pts;
}

const AREA_POINTS = buildValueSeries();

/** Catmull-Rom → cúbicas de Bézier: curva suave que passa por todos os pontos. */
function smoothPath(points: { x: number; y: number }[]) {
  let d = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function areaPath(points: number[]) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const step = AREA_W / (points.length - 1);
  // escala ao INTERVALO (min..max) e não a 0..max: com 44 amostras densas, uma
  // base em zero achatava a curva contra o topo e perdia-se todo o relevo
  const y = (v: number) => AREA_H - 4 - ((v - min) / (max - min)) * (AREA_H - 12);
  const xy = points.map((v, i) => ({ x: i * step, y: y(v) }));
  const line = smoothPath(xy);
  const baseline = y(points[0]);
  // Região ENTRE a curva e a linha do valor inicial (não entre a curva e o
  // fundo). Recortada em duas pelos clipPaths, dá ganho acima / perda abaixo.
  const band = `${line} L${AREA_W} ${baseline} L0 ${baseline} Z`;
  return { line, band, last: xy[xy.length - 1], baseline };
}

// Só os 2 setores de maior peso — o cartão do bento é compacto; a lista real
// (ordenada por peso desc) mostra todos, aqui trunca-se como um "top 2".
const ALLOCATION = [
  { sector: "Information Technology", percent: 0.42 },
  { sector: "Health Care", percent: 0.24 },
];

const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)"];

/**
 * Donut de alocação — o mesmo gesto da vista circular do gráfico real de
 * alocação por setor. Sem legenda de propósito: ao lado já está a lista com
 * os nomes e as percentagens, e repeti-la seria dizer duas vezes o mesmo num
 * cartão de 300px.
 *
 * Quatro fatias com um intervalo entre elas (o `GAP`), que é o que faz o
 * anel ler-se como setores divididos e não como um degradê contínuo.
 */
const DONUT = [42, 24, 20, 14];
const DONUT_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
const R = 26;
const C = 2 * Math.PI * R;
const GAP = 3; // em unidades de perímetro

export function PortfolioReplica({
  labels,
}: {
  labels: {
    marketValue: string;
    totalPnl: string;
    positions: string;
    upToday: string;
    allocationTitle: string;
    valueTabs: Record<(typeof VALUE_TABS)[number], string>;
  };
}) {
  const { line, band, last, baseline } = areaPath(AREA_POINTS);

  return (
    <div data-replica className="mt-5 space-y-3">
      {/* summary — cópia fiel de PortfolioSummary.tsx.
          2 colunas SEMPRE (não sm:grid-cols-4): o `sm:` dispara com o viewport,
          mas este cartão é meia-largura de um max-w-6xl — sobravam ~105px por
          coluna e os montantes partiam ("48 219,40" com o $ na linha de baixo).
          A página real também está a 2 colunas enquanto é estreita. */}
      <div className="glass rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {labels.marketValue}
            </p>
            <p className="nums whitespace-nowrap text-lg font-extrabold tracking-tight">48 219,40 $</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {labels.positions}
            </p>
            <p className="nums whitespace-nowrap text-lg font-extrabold tracking-tight">12</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {labels.totalPnl}
            </p>
            {/* a % entre parênteses existe no PortfolioSummary real e faltava aqui */}
            <p className="nums flex items-center gap-1 whitespace-nowrap text-lg font-extrabold tracking-tight text-bull">
              <TrendingUp className="h-4 w-4 shrink-0" />
              +3 812,10 $
              <span className="text-xs font-semibold opacity-80">(+8,6%)</span>
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {labels.upToday}
            </p>
            <p className="nums flex items-center gap-1 whitespace-nowrap text-lg font-extrabold tracking-tight text-bull">
              <TrendingUp className="h-4 w-4 shrink-0" /> 8
            </p>
          </div>
        </div>
      </div>

      {/* Empilhado, não lado a lado: a dois terços/um terço o cartão ficava
          curto e sobrava um bloco morto por baixo dentro do tile do bento.
          Alocação em cima (com o donut), evolução à largura toda em baixo —
          `order` para não ter de trocar a ordem no JSX. */}
      <div className="flex flex-col gap-3">
        {/* mini área — SVG à mão, mesmo gradiente/tabs do gráfico real de evolução */}
        <div className="glass order-2 rounded-xl p-3">
          <div className="mb-2 flex items-center justify-end">
            <div className="flex w-fit rounded-lg border border-border/40 bg-muted/50 p-1">
              {VALUE_TABS.map((tab) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all",
                    tab === "6m" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {labels.valueTabs[tab]}
                </span>
              ))}
            </div>
          </div>
          <svg
            viewBox={`0 0 ${AREA_W} ${AREA_H}`}
            className="h-auto w-full overflow-visible"
            role="img"
            aria-hidden
          >
            <defs>
              <linearGradient id="portfolio-replica-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              {/* mesma rampa, invertida: a perda desvanece para baixo */}
              <linearGradient id="portfolio-replica-loss" x1="0" y1="1" x2="0" y2="0">
                <stop offset="5%" stopColor="var(--bear)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--bear)" stopOpacity={0} />
              </linearGradient>
              <clipPath id="portfolio-replica-gain">
                <rect x={0} y={0} width={AREA_W} height={baseline} />
              </clipPath>
              <clipPath id="portfolio-replica-drawdown">
                <rect x={0} y={baseline} width={AREA_W} height={AREA_H - baseline} />
              </clipPath>
              {/* Traço em degradê da ESQUERDA para a DIREITA (não de cima para
                  baixo): começa apagado no passado e chega saturado ao valor de
                  hoje. É o que dá direção à linha — a verde-uniforme podia estar
                  a ser lida ao contrário. */}
              <linearGradient id="portfolio-replica-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="55%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={1} />
              </linearGradient>
            </defs>
            {/* A MESMA banda (curva ↔ valor inicial) desenhada duas vezes e
                recortada pela linha de referência: verde acima, vermelho
                abaixo. É o que dá caráter ao gráfico sem inventar nada — a
                área deixa de ser enchimento decorativo e passa a dizer quanto
                tempo a carteira esteve abaixo do que custou. */}
            <g clipPath="url(#portfolio-replica-gain)">
              <path d={band} fill="url(#portfolio-replica-area)" />
            </g>
            <g clipPath="url(#portfolio-replica-drawdown)">
              <path d={band} fill="url(#portfolio-replica-loss)" />
            </g>
            {/* Linha de referência no valor INICIAL do período. Sem ela, uma
                curva verde é só uma curva; com ela, o que está acima é ganho —
                e é exatamente a leitura que o cartão promete ao lado
                ("Ganho/Perda Total"). Os gráficos de portfólio a sério têm-na. */}
            <line
              x1={0}
              x2={AREA_W}
              y1={baseline}
              y2={baseline}
              stroke="var(--foreground)"
              strokeOpacity="0.45"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            {/* 2px e não 2.5: com uma curva de 44 amostras, um traço grosso
                arredonda as inflexões e volta a apagar o detalhe */}
            <path
              d={line}
              fill="none"
              stroke="url(#portfolio-replica-line)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* ponto final — o gráfico real tem `activeDot`; ancora a leitura
                no valor de hoje em vez de a linha morrer contra a margem */}
            <circle cx={last.x} cy={last.y} r="2.5" fill="#34d399" stroke="var(--card)" strokeWidth="1.5" />
          </svg>
        </div>

        {/* alocação — donut + barras, as duas vistas do gráfico real de
            alocação por setor (a app tem barsView/donutView) */}
        <div className="glass order-1 rounded-xl p-3">
          <h3 className="mb-2 text-[11px] font-semibold text-muted-foreground">
            {labels.allocationTitle}
          </h3>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" role="img" aria-hidden>
              {DONUT.map((pct, i) => {
                const len = (pct / 100) * C;
                const offset = -DONUT.slice(0, i).reduce((a, v) => a + (v / 100) * C, 0);
                return (
                  <circle
                    key={i}
                    cx={32}
                    cy={32}
                    r={R}
                    fill="none"
                    stroke={DONUT_COLORS[i]}
                    strokeWidth={9}
                    strokeDasharray={`${Math.max(0, len - GAP)} ${C - Math.max(0, len - GAP)}`}
                    strokeDashoffset={offset}
                  />
                );
              })}
            </svg>
            <div className="min-w-0 flex-1 space-y-2">
            {ALLOCATION.map((entry, i) => (
              <div key={entry.sector}>
                {/* O nome do setor tem LINHA PRÓPRIA; a percentagem desceu
                    para junto da barra.
                    Antes competiam pela mesma linha numa coluna de ~91px, e
                    "Information Technology" ficava cortado — e cada correção
                    por tamanho de letra ou gap só empurrava o problema para
                    outro viewport. Com linha própria, o rótulo tem 100% da
                    coluna em qualquer largura e o problema desaparece de vez. */}
                <p className="mb-1 text-[11px] font-medium leading-tight">{entry.sector}</p>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${entry.percent * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                  </div>
                  <span className="nums shrink-0 text-[10px] text-muted-foreground">
                    {Math.round(entry.percent * 100)}%
                  </span>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
