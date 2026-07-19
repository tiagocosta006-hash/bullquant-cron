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
      <div className="mt-4 h-64 w-full animate-pulse rounded-2xl border border-border/40 bg-card" />
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
      <div className="glass mt-4 flex flex-col items-center gap-6 rounded-2xl p-8 text-center md:p-12">
        <div className="rounded-2xl border border-primary/15 bg-primary/10 p-4 text-primary">
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
            <div>
              <h3 className="mb-2 text-2xl font-bold tracking-tight">{t("generateTitle", { ticker })}</h3>
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
      </div>
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
    <div className="mt-4 space-y-8">
      {/* Cabeçalho + fonte */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight">{t("title")}</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <BrainCircuit className="h-3.5 w-3.5" />
          {t("badge")}
        </span>
        {secUrl && filingLabel && (
          <a
            href={secUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <FileText className="h-3.5 w-3.5" />
            {t("source", { label: filingLabel })}
          </a>
        )}
      </div>

      {/* Tese executiva */}
      <LiquidGlass className="rounded-2xl p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <p className="max-w-3xl text-base leading-relaxed text-foreground">
            {report.executiveSummary}
          </p>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border px-3 py-1.5 text-sm font-semibold ${moatColor}`}
          >
            <ShieldCheck className="h-4 w-4" />
            {t(`moatRatings.${report.moat.rating.toLowerCase()}`)}
          </span>
        </div>
      </LiquidGlass>

      {/* Modelo de negócio */}
      <Section title={t("sections.businessModel")}>
        <p className="text-sm leading-relaxed text-muted-foreground">{report.businessModel}</p>
      </Section>

      {/* Mix de segmentos */}
      {segmentChart && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sections.segments")}
          </h3>
          {report.segmentsSummary && (
            <p className="text-sm leading-relaxed text-muted-foreground">{report.segmentsSummary}</p>
          )}
          <DecisionChart
            currencySymbol={currencySymbol}
            title={t("sections.segments")}
            data={segmentChart.chartData}
            type="STACKED_BAR"
            config={{ isCurrency: true, dataKeys: segmentChart.dataKeys }}
          />
        </div>
      )}

      {/* KPIs operacionais (source-grounded) */}
      {report.operatingKpis.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sections.operatingKpis")}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {report.operatingKpis.map((kpi, i) => (
              <div
                key={i}
                className="glass group flex flex-col justify-between rounded-2xl p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4
                      className="line-clamp-2 text-sm font-medium text-muted-foreground"
                      title={kpi.name}
                    >
                      {kpi.name}
                    </h4>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-tight">{kpi.value}</p>
                  </div>
                  {kpi.quote && secUrl && (
                    <button
                      onClick={() => openSource(kpi.name, kpi.quote)}
                      className="shrink-0 rounded-md bg-primary/10 p-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      title={t("viewSource")}
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {kpi.insight && (
                  <p className="border-l-2 border-primary/30 pl-2 text-xs leading-relaxed text-muted-foreground/90">
                    {kpi.insight}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Moat */}
      <Section title={t("sections.moat")}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{report.moat.text}</p>
          {report.moat.quote && secUrl && (
            <button
              onClick={() => openSource(t("sections.moat"), report.moat.quote!)}
              className="shrink-0 rounded-md bg-primary/10 p-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              title={t("viewSource")}
            >
              <FileText className="h-4 w-4" />
            </button>
          )}
        </div>
      </Section>

      {/* Riscos */}
      {report.risks.length > 0 && (
        <Section title={t("sections.risks")}>
          <ul className="space-y-3">
            {report.risks.map((risk, i) => (
              <li key={i} className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bear" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{risk.title}</span>
                    {risk.quote && secUrl && (
                      <button
                        onClick={() => openSource(risk.title, risk.quote!)}
                        className="shrink-0 rounded-md bg-primary/10 p-1 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                        title={t("viewSource")}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{risk.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Bull vs Bear */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-bull/20 bg-bull/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-bull">
            <TrendingUp className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">{t("sections.bullCase")}</h3>
          </div>
          <ul className="space-y-2">
            {report.bull.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <span className="text-bull">▲</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-bear/20 bg-bear/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-bear">
            <TrendingDown className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">{t("sections.bearCase")}</h3>
          </div>
          <ul className="space-y-2">
            {report.bear.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <span className="text-bear">▼</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
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

// ── Wrapper de secção ────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
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
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
        <div className="mb-2 inline-flex items-center gap-2 text-primary">
          <Lock className="h-4 w-4" />
          <span className="text-sm font-semibold">{t("chat.proOnly")}</span>
        </div>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{t("chat.proDesc")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{t("chat.title")}</h3>
      </div>

      {messages.length > 0 && (
        <div ref={scrollRef} className="mb-3 max-h-96 space-y-3 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2"}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-foreground"
                }`}
              >
                {m.content || (streaming && i === messages.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : "")}
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
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {a.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
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
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat.placeholder")}
          disabled={streaming}
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary/50"
        />
        <Button type="submit" size="icon" disabled={streaming || !input.trim()} className="rounded-full">
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
