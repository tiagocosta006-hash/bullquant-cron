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

export function StockAnalyst({
  ticker,
  fundamentals,
  isPro,
  currencySymbol = "$",
}: {
  ticker: string;
  fundamentals: FundamentalRow[];
  isPro?: boolean;
  currencySymbol?: string;
}) {
  const t = useTranslations("analista");

  const [status, setStatus] = useState<Status>("loading");
  const [report, setReport] = useState<Report | null>(null);
  const [secUrl, setSecUrl] = useState<string | null>(null);
  const [filingLabel, setFilingLabel] = useState<string | null>(null);
  const [sourceDialog, setSourceDialog] = useState<{ quote: string; kpiName: string } | null>(null);

  // ── 1. GET peek (cache) no mount ──────────────────────────────────
  useEffect(() => {
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
  }, [ticker]);

  // ── 2. POST gerar ─────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
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
  }, [ticker]);

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
        <div className="rounded-2xl border border-primary/15 bg-primary/10 p-4 text-primary shadow-lg shadow-primary/5">
          <BrainCircuit className="h-10 w-10" />
        </div>
        {status === "needs_auth" ? (
          <div className="max-w-lg space-y-4">
            <div className="space-y-2">
              <h3 className="text-2xl font-bold tracking-tight">{t("needsAuthTitle")}</h3>
              <p className="text-muted-foreground">{t("needsAuthDesc")}</p>
            </div>
            <a href="/login">
              <Button size="lg" className="gap-2">
                <Lock className="h-4 w-4" />
                {t("login")}
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
        ) : (
          <div className="max-w-2xl space-y-6">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <BrainCircuit className="h-3.5 w-3.5" />
                {t("badge")}
              </span>
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

  return (
    <div className="mt-4 space-y-10 duration-500 animate-in fade-in slide-in-from-bottom-2">
      {/* Cabeçalho + fonte */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <BrainCircuit className="h-3.5 w-3.5" />
          {t("badge")}
        </span>
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
      <LiquidGlass className="relative overflow-hidden rounded-3xl p-6 md:p-8">
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

      {/* Modelo de negócio */}
      <EditorialSection eyebrow={t("sections.businessModel")} first>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          {report.businessModel}
        </p>
      </EditorialSection>

      {/* Mix de segmentos */}
      {segmentChart && (
        <EditorialSection eyebrow={t("sections.segments")}>
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
        <EditorialSection eyebrow={t("sections.operatingKpis")}>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border/50 bg-border/50 sm:grid-cols-2 lg:grid-cols-4">
            {report.operatingKpis.map((kpi, i) => (
              <div
                key={i}
                className="group flex flex-col justify-between gap-3 bg-card p-4 transition-colors hover:bg-card/60"
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
      <EditorialSection eyebrow={t("sections.moat")}>
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
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
            >
              {t("viewSource")}
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </blockquote>
        )}
      </EditorialSection>

      {/* Riscos */}
      {report.risks.length > 0 && (
        <EditorialSection eyebrow={t("sections.risks")}>
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CasePanel tone="bull" title={t("sections.bullCase")} items={report.bull} />
        <CasePanel tone="bear" title={t("sections.bearCase")} items={report.bear} />
      </div>

      {/* Chat */}
      <AnalystChat ticker={ticker} isPro={!!isPro} secUrl={secUrl} onOpenSource={openSource} />

      <p className="text-xs text-muted-foreground/70">{t("disclaimer")}</p>

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
}: {
  eyebrow: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section className={cn("space-y-4", !first && "border-t border-border/40 pt-8")}>
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
      className="shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary"
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
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5",
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
  secUrl,
  onOpenSource,
}: {
  ticker: string;
  isPro: boolean;
  secUrl: string | null;
  onOpenSource: (label: string, quote: string) => void;
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

  if (!isPro) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8 text-center">
        <div className="mx-auto mb-3 w-fit rounded-xl border border-primary/20 bg-primary/10 p-3 text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <p className="text-sm font-semibold text-primary">{t("chat.proOnly")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("chat.proDesc")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/60">
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{t("chat.title")}</h3>
      </div>

      <div className="p-4">
        {messages.length > 0 && (
          <div ref={scrollRef} className="mb-4 max-h-96 space-y-4 overflow-y-auto pr-1">
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
                        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                      >
                        <FileText className="h-3 w-3" />
                        {c.label}
                      </button>
                    ))}
                    {m.actions?.map((a, ai) => (
                      <a
                        key={`action-${ai}`}
                        href={a.href}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
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
          <div className="mb-4 flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s)}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-1.5 rounded-full border border-border bg-background py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20"
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
            className="h-8 w-8 shrink-0 rounded-full"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
