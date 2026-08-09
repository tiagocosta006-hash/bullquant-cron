"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BrainCircuit,
  FileText,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Send,
  Loader2,
  Lock,
  RefreshCw,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { DecisionChart } from "./DecisionChart";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { BullMarkAnimated } from "@/components/brand/BullMarkAnimated";
import { buildTextFragmentUrl } from "@/lib/finance/textFragment";
import { cn } from "@/lib/utils";

// ── Tipos do relatório (espelham o schema Zod da rota) ───────────────
type Moat = { rating: "WIDE" | "NARROW" | "NONE"; text: string; quote: string | null };
type OperatingKpi = { name: string; value: string; quote: string; insight: string };
type Risk = { title: string; detail: string; quote: string | null };
type Report = {
  executiveSummary: string;
  businessModel: string;
  moat: Moat;
  segmentsSummary: string | null;
  operatingKpis: OperatingKpi[];
  risks: Risk[];
  bull: string[];
  bear: string[];
};

type FundamentalRow = {
  fiscalYear?: number;
  revenue?: number | string | null;
  revenueSegments?: Record<string, number> | null;
};

type Status =
  | "loading"
  | "empty"
  | "generating"
  | "ready"
  | "error"
  | "rate_limit"
  | "needs_auth";

type ChatCitation = { label: string; quote: string };
type ChatAction = { label: string; href: string };
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  actions?: ChatAction[];
};

// Paleta categórica CVD-safe (igual ao FinancialsEngine para coerência visual).
const SEGMENT_COLORS = [
  "#2a78d6",
  "#1baf7a",
  "#eda100",
  "#008300",
  "#4a3aa7",
  "#e34948",
  "#e87ba4",
  "#eb6834",
];

// ── Demo pública (guest em /stock/AAPL) ───────────────────────────────
// Dossier pré-carregado/hardcoded: nunca chama o Gemini (não gasta créditos
// nem depende da cache real ter expirado). "Interação" real com IA (o chat)
// continua sempre trancada — só isto (relatório estático) fica desbloqueado,
// com uma sequência de loading falsa para dar a sensação de rapidez.
const DEMO_LOADING_STEP_MS = 1600;
// Transição "a carregar" -> "pronto": a linha esvai-se (fade-out) durante
// isto, só depois o dossier monta e revela secção a secção.
const DEMO_FINISH_FADE_MS = 320;
// Atraso entre a entrada de cada secção do dossier, em ms — rápido de propósito.
const DEMO_REVEAL_STAGGER_MS = 90;

const DEMO_AAPL_REPORT: Report = {
  executiveSummary:
    "A Apple gera a maior parte do lucro através do iPhone e de um ecossistema de serviços recorrentes (App Store, iCloud, Apple Music, publicidade) que fideliza os utilizadores e sustenta margens elevadas.",
  businessModel:
    "O negócio assenta em dois pilares: Hardware (iPhone, Mac, iPad, wearables) com margens mais baixas mas grande volume, e Serviços (App Store, subscrições, publicidade, AppleCare) com margens muito superiores e receita recorrente. O ecossistema fechado entre dispositivos e serviços aumenta os custos de mudança e a retenção.",
  moat: {
    rating: "WIDE",
    text: "O fosso competitivo assenta na marca, no ecossistema fechado de hardware e software e nos elevados custos de mudança para o utilizador — sair do ecossistema Apple implica perder integração entre dispositivos, dados e subscrições.",
    quote: null,
  },
  segmentsSummary: null,
  operatingKpis: [
    {
      name: "Base instalada de dispositivos ativos",
      value: "+2.2 mil milhões",
      quote: "",
      insight: "Ecossistema em expansão contínua, reforçando a retenção de utilizadores e a monetização via Serviços.",
    },
    {
      name: "Peso da receita de Serviços",
      value: "~25% da receita total",
      quote: "",
      insight: "Segmento de margem mais alta, com crescimento consistente impulsionado por assinaturas e App Store.",
    },
    {
      name: "Margem bruta de Serviços",
      value: "~70%",
      quote: "",
      insight: "Muito superior à margem de Hardware — melhora o mix global à medida que o segmento cresce em peso.",
    },
    {
      name: "Recompra de ações próprias",
      value: "Dezenas de mil milhões / ano",
      quote: "",
      insight: "Redução consistente do número de ações em circulação, apoiando o crescimento do EPS.",
    },
  ],
  risks: [
    {
      title: "Concentração de receita no iPhone",
      detail: "Apesar da diversificação para Serviços, o iPhone continua a ser o principal motor de receita — ciclos de renovação mais longos pressionam o crescimento de Hardware.",
      quote: null,
    },
    {
      title: "Exposição à cadeia de fornecimento e à China",
      detail: "Uma parte significativa da produção e das vendas depende da China, expondo a empresa a riscos geopolíticos, tarifários e de disrupção logística.",
      quote: null,
    },
    {
      title: "Escrutínio regulatório sobre a App Store",
      detail: "Reguladores na UE e nos EUA têm pressionado o modelo de comissões da App Store, o que pode comprimir margens de Serviços no futuro.",
      quote: null,
    },
  ],
  bull: [
    "Ecossistema fechado com elevados custos de mudança sustenta preços premium e fidelização.",
    "Receita de Serviços de alta margem a crescer mais depressa do que o Hardware, melhorando o mix.",
    "Balanço robusto e devolução consistente de capital via recompras e dividendos.",
  ],
  bear: [
    "Ciclos de upgrade do iPhone cada vez mais longos podem abrandar o crescimento de receita de Hardware.",
    "Pressão regulatória sobre as comissões da App Store é um risco estrutural para a margem de Serviços.",
    "Dependência da cadeia de fornecimento chinesa expõe a empresa a choques geopolíticos.",
  ],
};

export function StockAnalyst({
  ticker,
  fundamentals,
  isPro,
  isLoggedIn,
  isDemo,
  currencySymbol = "$",
}: {
  ticker: string;
  fundamentals: FundamentalRow[];
  isPro?: boolean;
  isLoggedIn?: boolean;
  isDemo?: boolean;
  currencySymbol?: string;
}) {
  const t = useTranslations("analista");

  const [status, setStatus] = useState<Status>(isDemo ? "empty" : "loading");
  const [report, setReport] = useState<Report | null>(null);
  const [secUrl, setSecUrl] = useState<string | null>(null);
  const [filingLabel, setFilingLabel] = useState<string | null>(null);
  const [sourceDialog, setSourceDialog] = useState<{ quote: string; kpiName: string } | null>(null);
  const [demoStep, setDemoStep] = useState(0);
  const [demoFinishing, setDemoFinishing] = useState(false);
  const [demoHistoryOpen, setDemoHistoryOpen] = useState(false);
  const demoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoFinishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Uma linha só, ao estilo Claude: começa em "a pensar" e vai substituindo o
  // texto no próprio sítio por cada passo — com histórico expansível (como o
  // "Thought for Xs" do Claude) para quem quiser ver os passos todos.
  const demoPhases = [t("demo.thinking"), ...((t.raw("demo.steps") as string[]) || [])];

  useEffect(() => {
    return () => {
      if (demoTimerRef.current) clearInterval(demoTimerRef.current);
      if (demoFinishTimeoutRef.current) clearTimeout(demoFinishTimeoutRef.current);
    };
  }, []);

  // ── 1. GET peek (cache) no mount — não aplicável na demo (nunca chama a API) ──
  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/analyst/${ticker}`);
        const json = await res.json();
        if (!alive) return;
        if (json.report) {
          setReport(json.report);
          setSecUrl(json.secUrl ?? null);
          setFilingLabel(json.filingLabel ?? null);
          setStatus("ready");
        } else {
          setStatus("empty");
        }
      } catch {
        if (alive) setStatus("empty");
      }
    })();
    return () => {
      alive = false;
    };
  }, [ticker, isDemo]);

  // ── 2a. Demo: sequência de loading falsa + dossier pré-carregado ──────
  const runDemoGenerate = useCallback(() => {
    setStatus("generating");
    setDemoStep(0);
    setDemoFinishing(false);
    setDemoHistoryOpen(false);
    if (demoTimerRef.current) clearInterval(demoTimerRef.current);
    if (demoFinishTimeoutRef.current) clearTimeout(demoFinishTimeoutRef.current);
    let i = 0;
    demoTimerRef.current = setInterval(() => {
      i += 1;
      if (i >= demoPhases.length) {
        if (demoTimerRef.current) clearInterval(demoTimerRef.current);
        // Corte suave em vez de seco: a linha "a pensar" esvai-se primeiro
        // (opacity/translate via CSS), só depois o dossier entra a revelar-se
        // secção a secção (ver DEMO_REVEAL_STAGGER_MS no render READY).
        setDemoFinishing(true);
        demoFinishTimeoutRef.current = setTimeout(() => {
          setReport(DEMO_AAPL_REPORT);
          setSecUrl(null);
          setFilingLabel(null);
          setStatus("ready");
        }, DEMO_FINISH_FADE_MS);
      } else {
        setDemoStep(i);
      }
    }, DEMO_LOADING_STEP_MS);
  }, [demoPhases.length]);

  // ── 2b. POST gerar (conta real) ────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (isDemo) {
      runDemoGenerate();
      return;
    }
    setStatus("generating");
    try {
      const res = await fetch(`/api/analyst/${ticker}`, { method: "POST" });
      if (res.status === 401) {
        setStatus("needs_auth");
        return;
      }
      if (res.status === 429) {
        setStatus("rate_limit");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const json = await res.json();
      if (json.report) {
        setReport(json.report);
        setSecUrl(json.secUrl ?? null);
        setFilingLabel(json.filingLabel ?? null);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [ticker, isDemo, runDemoGenerate]);

  // ── Mix de segmentos (dados fiáveis do XBRL, via props) ────────────
  const segmentChart = useMemo(() => {
    const annuals = [...fundamentals]
      .filter((f) => typeof f.fiscalYear === "number")
      .sort((a, b) => (a.fiscalYear ?? 0) - (b.fiscalYear ?? 0));

    const keySet = new Set<string>();
    annuals.forEach((f) => {
      if (f.revenueSegments) Object.keys(f.revenueSegments).forEach((k) => keySet.add(k));
    });
    if (keySet.size === 0) return null;

    // Guard anti-duplicação: alguns emitentes reportam segmentos HIERÁRQUICOS
    // e sobrepostos (ex.: Google — "Google Services" ⊃ "Google advertising" ⊃
    // "YouTube ads"). Somados num stack, duplicam/triplicam a receita e o
    // gráfico rebenta (barras a bater no topo do eixo). Se a soma dos segmentos
    // exceder materialmente a receita real na maioria dos anos com dados,
    // escondemos o gráfico — a correção de raiz é no segment map de ingestão,
    // não aqui na apresentação.
    const yearsWithSegs = annuals.filter(
      (f) => f.revenueSegments && Object.keys(f.revenueSegments).length > 0,
    );
    const overlapYears = yearsWithSegs.filter((f) => {
      const rev = Number(f.revenue);
      if (!Number.isFinite(rev) || rev <= 0) return false;
      const sum = Object.values(f.revenueSegments ?? {}).reduce(
        (s, v) => s + (Number(v) || 0),
        0,
      );
      return sum > rev * 1.1;
    });
    if (yearsWithSegs.length > 0 && overlapYears.length >= Math.ceil(yearsWithSegs.length / 2)) {
      return null;
    }

    let keys = Array.from(keySet);
    let folded: Set<string> | null = null;
    const MAX = SEGMENT_COLORS.length;
    if (keys.length > MAX) {
      const totals = new Map<string, number>();
      keys.forEach((k) =>
        totals.set(
          k,
          annuals.reduce((s, f) => s + (f.revenueSegments?.[k] ?? 0), 0),
        ),
      );
      const bySize = [...keys].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
      const kept = bySize.slice(0, MAX - 1);
      folded = new Set(bySize.slice(MAX - 1));
      keys = [...kept, "Other"];
    }

    const chartData = annuals.map((f) => {
      let segs = f.revenueSegments ?? {};
      if (folded) {
        const merged: Record<string, number> = {};
        let other = 0;
        Object.entries(segs).forEach(([k, v]) => {
          if (folded!.has(k) || k === "Other") other += v;
          else merged[k] = v;
        });
        merged["Other"] = other;
        segs = merged;
      }
      return { label: `${f.fiscalYear}`, ...segs };
    });

    return {
      chartData,
      dataKeys: keys.map((k, i) => ({
        key: k,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
        type: "bar" as const,
        stackId: "a",
      })),
    };
  }, [fundamentals]);

  const openSource = (kpiName: string, quote: string) => setSourceDialog({ quote, kpiName });
  const handleOpenSec = () => {
    if (!sourceDialog || !secUrl) return;
    window.open(buildTextFragmentUrl(secUrl, sourceDialog.quote), "_blank");
    setSourceDialog(null);
  };

  // ── Estados que não são "ready" ───────────────────────────────────
  if (status === "loading") {
    return (
      <div className="mt-4 space-y-6">
        <div className="h-40 w-full animate-pulse rounded-3xl border border-border/40 bg-card" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border/40 bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (
    status === "empty" ||
    status === "generating" ||
    status === "error" ||
    status === "rate_limit" ||
    status === "needs_auth"
  ) {
    return (
      <LiquidGlass className="relative mt-4 flex flex-col items-center gap-6 overflow-hidden rounded-3xl p-8 text-center md:p-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        {/* Na demo a "gerar", o mark já faz de ícone lá em baixo, ao lado do
            texto — mostrar também este círculo cá em cima duplicava o ícone
            e desalinhava a composição toda. */}
        {!(isDemo && status === "generating") && (
          <div className="rounded-2xl border border-primary/15 bg-primary/10 p-4 text-primary shadow-lg shadow-primary/5">
            <BrainCircuit className="h-10 w-10" />
          </div>
        )}
        {status === "needs_auth" ? (
          <div className="max-w-lg space-y-4">
            <div className="space-y-2">
              <h3 className="text-2xl font-bold tracking-tight">{t("needsAuthTitle")}</h3>
              <p className="text-muted-foreground">{t("needsAuthDesc")}</p>
            </div>
            <a href="/register">
              <Button size="lg" className="gap-2">
                <Lock className="h-4 w-4" />
                {t("registerCta")}
              </Button>
            </a>
          </div>
        ) : status === "rate_limit" ? (
          <div className="max-w-lg space-y-2">
            <h3 className="text-2xl font-bold tracking-tight">{t("rateLimitTitle")}</h3>
            <p className="text-muted-foreground">{t("rateLimitDesc")}</p>
          </div>
        ) : status === "error" ? (
          <div className="max-w-lg space-y-4">
            <h3 className="text-2xl font-bold tracking-tight">{t("errorTitle")}</h3>
            <Button onClick={handleGenerate} size="lg" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {t("retry")}
            </Button>
          </div>
        ) : isDemo && status === "generating" ? (
          // Composição enxuta enquanto "pensa": logo + linha de estado, lado
          // a lado (estilo Claude). Sem badge/título/descrição — esses já se
          // leram no ecrã anterior; repeti-los aqui ficava a fazer ruído.
          <div className="mx-auto flex w-96 flex-col gap-1">
            {/* Largura FIXA (w-96), não max-w a encolher para o conteúdo: se o
                contentor seguisse o texto, cada frase de tamanho diferente
                recentrava o grupo inteiro e o logo "saltava" de posição a
                cada passo. Com largura fixa e tudo alinhado à esquerda, o
                logo fica sempre no mesmo sítio — só ele é que anima, nunca
                o espaço que ocupa. 24rem/384px comporta a frase mais longa
                (medido: 284px em PT) numa linha só — truncate no texto é só
                rede de segurança, não é suposto disparar. */}
            <div
              className={cn(
                "flex items-center gap-2 transition-all duration-300 ease-out",
                demoFinishing ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100",
              )}
            >
              {/* Estilo Claude: pequenino, ao lado do texto, sem saltar de
                  tamanho nem de posição — só a coreografia interna (.demo-
                  logo-loop, CSS puro em globals.css) é que se mexe. */}
              <BullMarkAnimated className="demo-logo-loop h-4 w-4 shrink-0 text-primary" />
              <span key={demoStep} className="demo-thinking-text flex-1 truncate text-left text-sm font-medium">
                {demoPhases[demoStep]}
              </span>
              {demoStep > 0 && (
                <button
                  type="button"
                  onClick={() => setDemoHistoryOpen((o) => !o)}
                  aria-label={t("demo.historyToggle")}
                  className="pressable mt-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", demoHistoryOpen && "rotate-180")}
                  />
                </button>
              )}
            </div>

            {/* Histórico em linha do tempo (estilo Claude): traço vertical
                contínuo, ponto por passo — cheio+dourado no atual, vazio
                nos concluídos, sem caixa/moldura à volta. */}
            {demoHistoryOpen && !demoFinishing && (
              <ul className="w-full space-y-0 pt-2 text-left text-xs duration-200 animate-in fade-in slide-in-from-top-1">
                {demoPhases.slice(0, demoStep + 1).map((phase, i) => {
                  const isLast = i === demoStep;
                  return (
                    <li key={phase} className="relative flex gap-3 pb-3 pl-1 last:pb-0">
                      {!isLast && (
                        <span className="absolute left-[7px] top-2 h-full w-px bg-border" aria-hidden />
                      )}
                      <span
                        className={cn(
                          "relative z-10 mt-1 h-[7px] w-[7px] shrink-0 rounded-full",
                          isLast ? "bg-primary" : "bg-muted-foreground/40",
                        )}
                      />
                      <span className={isLast ? "text-foreground" : "text-muted-foreground"}>{phase}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <BrainCircuit className="h-3.5 w-3.5" />
                {t("badge")}
              </span>
              {isDemo && (
                <span
                  title={t("demo.tooltip")}
                  className="ml-1.5 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary"
                >
                  {t("demo.badge")}
                </span>
              )}
              <h3 className="text-2xl font-bold tracking-tight md:text-3xl">
                {t("generateTitle", { ticker })}
              </h3>
              <p className="mx-auto max-w-lg text-muted-foreground">{t("generateDesc")}</p>
            </div>

            <Button
              onClick={handleGenerate}
              size="lg"
              disabled={status === "generating"}
              className="gap-2 font-semibold shadow-lg transition-all hover:shadow-primary/25"
            >
              {status === "generating" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t("generating")}
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  {t("generateCta")}
                </>
              )}
            </Button>
          </div>
        )}
      </LiquidGlass>
    );
  }

  // ── READY ─────────────────────────────────────────────────────────
  if (!report) return null;

  const moatColor =
    report.moat.rating === "WIDE"
      ? "text-bull border-bull/30 bg-bull/10"
      : report.moat.rating === "NARROW"
        ? "text-primary border-primary/30 bg-primary/10"
        : "text-muted-foreground border-border bg-muted/50";

  // Reveal em cascata (só na demo): cada bloco entra com um pequeno atraso a
  // seguir ao anterior — o dossier "constrói-se" secção a secção em vez de
  // aparecer tudo de repente. `backwards` mantém o bloco no estado inicial
  // (invisível/deslocado) durante o próprio atraso, sem flash.
  // Recebe a className base e devolve-a já fundida (cn) — nunca aplicar isto
  // como spread depois de um `className` explícito no JSX: um objecto
  // espalhado por cima substitui a prop em vez de a fundir, e já perdemos o
  // padding/overflow do herói dessa forma (o "T" de "Tese" ficava cortado
  // pelo canto arredondado por falta do p-6).
  let demoRevealIndex = 0;
  const demoReveal = (baseClassName?: string): { className?: string; style?: React.CSSProperties } => {
    if (!isDemo) return { className: baseClassName };
    const delay = demoRevealIndex * DEMO_REVEAL_STAGGER_MS;
    demoRevealIndex += 1;
    return {
      className: cn(baseClassName, "duration-[420ms] animate-in fade-in slide-in-from-bottom-3 ease-out"),
      style: { animationDelay: `${delay}ms`, animationFillMode: "backwards" },
    };
  };

  return (
    // Na demo, a entrada é só a cascata de demoReveal() em cada secção — um
    // fade-in extra aqui, ao mesmo tempo, compunha com o das secções e lia-se
    // como um corte (duas curvas de opacidade sobrepostas em vez de uma só).
    <div className={cn("mt-4 space-y-10", !isDemo && "duration-500 animate-in fade-in slide-in-from-bottom-2")}>
      {/* Cabeçalho + fonte */}
      <div {...demoReveal("flex flex-wrap items-center gap-3")}>
        <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <BrainCircuit className="h-3.5 w-3.5" />
          {t("badge")}
        </span>
        {isDemo && (
          <span
            title={t("demo.tooltip")}
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary"
          >
            {t("demo.badge")}
          </span>
        )}
        {secUrl && filingLabel && (
          <a
            href={secUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <FileText className="h-3.5 w-3.5" />
            {t("source", { label: filingLabel })}
          </a>
        )}
      </div>

      {/* Herói da tese */}
      <LiquidGlass {...demoReveal("relative overflow-hidden rounded-3xl p-6 md:p-8")}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl space-y-3">
            <Eyebrow>{t("thesisLabel")}</Eyebrow>
            <p className="text-lg font-medium leading-relaxed text-foreground md:text-xl md:leading-relaxed">
              {report.executiveSummary}
            </p>
          </div>
          <div
            className={cn(
              "flex shrink-0 items-center gap-3 self-start rounded-2xl border px-4 py-3",
              moatColor,
            )}
          >
            <ShieldCheck className="h-6 w-6" />
            <div className="leading-tight">
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                {t("moatLabel")}
              </div>
              <div className="text-sm font-bold">
                {t(`moatRatings.${report.moat.rating.toLowerCase()}`)}
              </div>
            </div>
          </div>
        </div>
      </LiquidGlass>

      {/* Layout 2 colunas: dossier rola à esquerda, chat fixo à direita
          (desktop). Em mobile empilha — sem prefixo lg: os utilitários
          sticky/altura ficam inativos e o rail cai para altura automática. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* ── Coluna esquerda: dossier ─────────────────────────────── */}
        <div className="space-y-8">
          {/* Modelo de negócio */}
          <EditorialSection eyebrow={t("sections.businessModel")} first {...demoReveal()}>
            <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
              {report.businessModel}
            </p>
          </EditorialSection>

          {/* Mix de segmentos */}
          {segmentChart && (
            <EditorialSection eyebrow={t("sections.segments")} {...demoReveal()}>
              {report.segmentsSummary && (
                <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
                  {report.segmentsSummary}
                </p>
              )}
              <DecisionChart
                currencySymbol={currencySymbol}
                title={t("sections.segments")}
                data={segmentChart.chartData}
                type="STACKED_BAR"
                config={{ isCurrency: true, dataKeys: segmentChart.dataKeys }}
              />
            </EditorialSection>
          )}

          {/* KPIs operacionais (source-grounded) */}
          {report.operatingKpis.length > 0 && (
            <EditorialSection eyebrow={t("sections.operatingKpis")} {...demoReveal()}>
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border/50 bg-border/50 sm:grid-cols-2 lg:grid-cols-4">
                {report.operatingKpis.map((kpi, i) => (
                  <div
                    key={i}
                    className="group glass flex flex-col justify-between gap-3 rounded-none p-4 transition-colors hover:bg-foreground/[0.03]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        className="line-clamp-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        title={kpi.name}
                      >
                        {kpi.name}
                      </h4>
                      {kpi.quote && secUrl && (
                        <SourceButton onClick={() => openSource(kpi.name, kpi.quote)} label={t("viewSource")} />
                      )}
                    </div>
                    <p className="nums text-2xl font-bold tracking-tight text-foreground">{kpi.value}</p>
                    {kpi.insight && (
                      <p className="text-xs leading-relaxed text-muted-foreground/80">{kpi.insight}</p>
                    )}
                  </div>
                ))}
              </div>
            </EditorialSection>
          )}

          {/* Moat */}
          <EditorialSection eyebrow={t("sections.moat")} {...demoReveal()}>
            <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
              {report.moat.text}
            </p>
            {report.moat.quote && secUrl && (
              <blockquote className="relative mt-1 max-w-3xl overflow-hidden rounded-xl border border-border/60 bg-muted/30 p-4 pl-6">
                <span className="pointer-events-none absolute left-2 top-0 font-serif text-5xl leading-none text-primary/20">
                  &ldquo;
                </span>
                <p className="relative text-sm italic leading-relaxed text-foreground/85">
                  {report.moat.quote}
                </p>
                <button
                  onClick={() => openSource(t("sections.moat"), report.moat.quote!)}
                  className="pressable mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  {t("viewSource")}
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </blockquote>
            )}
          </EditorialSection>

          {/* Riscos */}
          {report.risks.length > 0 && (
            <EditorialSection eyebrow={t("sections.risks")} {...demoReveal()}>
              <ul className="space-y-4">
                {report.risks.map((risk, i) => (
                  <li key={i} className="border-l-2 border-bear/40 pl-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-bear" />
                        {risk.title}
                      </span>
                      {risk.quote && secUrl && (
                        <SourceButton onClick={() => openSource(risk.title, risk.quote!)} label={t("viewSource")} />
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{risk.detail}</p>
                  </li>
                ))}
              </ul>
            </EditorialSection>
          )}

          {/* Bull vs Bear */}
          <div {...demoReveal("grid grid-cols-1 gap-4 md:grid-cols-2")}>
            <CasePanel tone="bull" title={t("sections.bullCase")} items={report.bull} />
            <CasePanel tone="bear" title={t("sections.bearCase")} items={report.bear} />
          </div>
        </div>

        {/* ── Coluna direita: chat fixo (sticky em lg+) ────────────── */}
        <div {...demoReveal("lg:sticky lg:top-24 lg:h-[calc(100svh-8rem)]")}>
          <AnalystChat
            ticker={ticker}
            isPro={!!isPro}
            isLoggedIn={!!isLoggedIn}
            secUrl={secUrl}
            onOpenSource={openSource}
            className="h-full"
          />
        </div>
      </div>

      <p {...demoReveal("text-xs text-muted-foreground/70")}>{t("disclaimer")}</p>

      {/* Dialog de citação */}
      <Dialog open={!!sourceDialog} onOpenChange={(open) => !open && setSourceDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              {t("sourceTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("sourceDesc")} <strong className="text-foreground">{sourceDialog?.kpiName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="relative my-2 overflow-hidden rounded-lg border border-border bg-muted/50 p-5 text-sm leading-relaxed text-foreground/90">
            <span className="pointer-events-none absolute -top-2 left-2 text-6xl text-primary/10">
              &ldquo;
            </span>
            <span className="relative z-10 text-[15px]">{sourceDialog?.quote}</span>
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <DialogClose render={<Button type="button" variant="ghost" />}>
              {t("back")}
            </DialogClose>
            {secUrl && (
              <Button type="button" onClick={handleOpenSec} className="gap-2">
                {t("openSec")}
                <FileText className="h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Eyebrow (rótulo de secção dourado, uppercase) ────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-primary/80">{children}</h3>
  );
}

// ── Secção editorial: eyebrow + régua de cabelo, sem caixa ────────────
function EditorialSection({
  eyebrow,
  children,
  first,
  className,
  style,
}: {
  eyebrow: string;
  children: React.ReactNode;
  first?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={cn("space-y-4", !first && "border-t border-border/40 pt-8", className)}
      style={style}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      {children}
    </section>
  );
}

// ── Botão de fonte (afordância fantasma, não bloco preenchido) ───────
function SourceButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="pressable shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary"
    >
      <FileText className="h-3.5 w-3.5" />
    </button>
  );
}

// ── Painel de caso (bull/bear) ───────────────────────────────────────
function CasePanel({
  tone,
  title,
  items,
}: {
  tone: "bull" | "bear";
  title: string;
  items: string[];
}) {
  const isBull = tone === "bull";
  return (
    // .glass como base (CSS puro, sem custo de ResizeObserver/SDF do
    // LiquidGlass — reservado às 2-3 superfícies grandes) com o tint
    // semântico bull/bear por cima, como overlay, não substituição.
    <div
      className={cn(
        "glass relative overflow-hidden rounded-2xl border p-5",
        isBull ? "border-bull/25 bg-bull/[0.06]" : "border-bear/25 bg-bear/[0.06]",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-0.5",
          isBull ? "bg-bull/50" : "bg-bear/50",
        )}
      />
      <div className={cn("mb-4 flex items-center gap-2", isBull ? "text-bull" : "text-bear")}>
        {isBull ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        <h3 className="text-sm font-semibold uppercase tracking-wider">{title}</h3>
      </div>
      <ul className="space-y-2.5">
        {items.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground/80">
            <span className={cn("mt-0.5 shrink-0 text-xs", isBull ? "text-bull" : "text-bear")}>
              {isBull ? "▲" : "▼"}
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Parser mínimo do stream de UI messages (SSE) ─────────────────────
// Sem @ai-sdk/react instalado: interpretamos os chunks `data: {...}\n\n`
// manualmente. Cada evento é um UIMessageChunk (text-delta, tool-input-
// available, tool-output-available, error, ...). Ver lib/ai/tools.ts para
// os tools `cite`/`suggestAction` cujos outputs viram citações/chips aqui.
function parseSseEvents(buffer: string): { events: unknown[]; remainder: string } {
  const events: unknown[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf("\n\n")) !== -1) {
    const rawEvent = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    for (const line of rawEvent.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;
      try {
        events.push(JSON.parse(jsonStr));
      } catch {
        // chunk parcial/corrompido — ignora, o stream continua
      }
    }
  }
  return { events, remainder: rest };
}

// ── Indicador de "a escrever" (três pontos) ──────────────────────────
function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}

// ── Chat (Pro) ───────────────────────────────────────────────────────
function AnalystChat({
  ticker,
  isPro,
  isLoggedIn,
  secUrl,
  onOpenSource,
  className,
}: {
  ticker: string;
  isPro: boolean;
  isLoggedIn: boolean;
  secUrl: string | null;
  onOpenSource: (label: string, quote: string) => void;
  className?: string;
}) {
  const t = useTranslations("analista");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suggestions = (t.raw("chat.suggestions") as string[]) || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || streaming) return;
      const next: ChatMessage[] = [...messages, { role: "user", content: q }];
      setMessages(next);
      setInput("");
      setStreaming(true);
      // placeholder do assistente para stream incremental
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      const toolNames = new Map<string, string>();
      // Texto reposto a cada novo "step" (start-step) — um step tipicamente
      // é só tool-calls OU só a resposta final, nunca os dois misturados;
      // sem este reset, um eventual preâmbulo antes de uma tool-call (ex.:
      // "vou verificar isso...") ficava concatenado com a resposta final
      // seguinte, produzindo uma bolha confusa. Citações/ações persistem
      // entre steps — enriquecem a resposta final, não são "descartáveis".
      let text_ = "";
      const citations: ChatCitation[] = [];
      const actions: ChatAction[] = [];
      const updateMessage = () =>
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: text_,
            citations: [...citations],
            actions: [...actions],
          };
          return copy;
        });

      try {
        const res = await fetch(`/api/analyst/${ticker}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map(({ role, content }) => ({ role, content })),
          }),
        });
        if (!res.ok || !res.body) {
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: t("chat.error") };
            return copy;
          });
          setStreaming(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, remainder } = parseSseEvents(buffer);
          buffer = remainder;

          for (const raw of events) {
            const chunk = raw as { type: string; [key: string]: unknown };
            if (chunk.type === "start-step") {
              text_ = ""; // novo step — não misturar com texto de um step anterior
              updateMessage();
            } else if (chunk.type === "text-delta") {
              text_ += (chunk.delta as string) ?? "";
              updateMessage();
            } else if (chunk.type === "tool-input-available") {
              toolNames.set(chunk.toolCallId as string, chunk.toolName as string);
            } else if (chunk.type === "tool-output-available") {
              const name = toolNames.get(chunk.toolCallId as string);
              const output = chunk.output as Record<string, string> | undefined;
              if (name === "cite" && output?.label && output?.quote) {
                citations.push({ label: output.label, quote: output.quote });
                updateMessage();
              } else if (name === "suggestAction" && output?.label && output?.href) {
                actions.push({ label: output.label, href: output.href });
                updateMessage();
              }
            } else if (chunk.type === "error") {
              // errorText já vem classificado/localizado pelo servidor (ver
              // onError na rota) — nunca é o erro bruto do provedor de IA.
              text_ = (chunk.errorText as string) || t("chat.error");
              updateMessage();
            }
          }
        }
      } catch {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: t("chat.error") };
          return copy;
        });
      } finally {
        setStreaming(false);
      }
    },
    [messages, streaming, ticker, t],
  );



  return (
    <div className={cn("flex h-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/60", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{t("chat.title")}</h3>
      </div>

      <div className="flex flex-1 min-h-0 flex-col p-4">
        {messages.length > 0 && (
          <div ref={scrollRef} className="mb-4 flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2"}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground shadow-sm"
                      : "rounded-2xl rounded-bl-md border border-border/50 bg-muted/50 text-foreground",
                  )}
                >
                  {m.content ||
                    (streaming && i === messages.length - 1 ? <TypingDots /> : "")}
                </div>

                {m.role === "assistant" && (!!m.citations?.length || !!m.actions?.length) && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.citations?.map((c, ci) => (
                      <button
                        key={`cite-${ci}`}
                        onClick={() => onOpenSource(c.label, c.quote)}
                        disabled={!secUrl}
                        className="pressable inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:translate-y-0"
                      >
                        <FileText className="h-3 w-3" />
                        {c.label}
                      </button>
                    ))}
                    {m.actions?.map((a, ai) => (
                      <a
                        key={`action-${ai}`}
                        href={a.href}
                        className="pressable inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        {a.label}
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="pressable rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
            {/* spacer — sem histórico, ainda assim pina o form ao fundo do rail */}
            <div className="flex-1" />
          </>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("chat.placeholder")}
            disabled={streaming}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <Button
            type="submit"
            size="icon"
            disabled={streaming || !input.trim()}
            className="pressable h-8 w-8 shrink-0 rounded-full"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
