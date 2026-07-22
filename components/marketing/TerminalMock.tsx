"use client";

import { useState } from "react";
import { ArrowUpRight, FileText, Search } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { LiveSpark } from "@/components/marketing/LiveSpark";
import { ChartCardChrome, MiniChart } from "@/components/marketing/MiniChart";
import { REVENUE, FCF, calcCagr } from "@/components/marketing/ChartScrollDraw";
import { cn } from "@/lib/utils";

// CAGR reais dos mesmos dados da Story 01 (ChartScrollDraw) — coerência de
// números entre as duas cenas do showcase.
const CAGR_REVENUE = calcCagr(REVENUE);
const CAGR_FCF = calcCagr(FCF);

/**
 * TerminalMock — mock da app para dentro do MediaFrame enquanto não há
 * vídeo real (tickers/números são dados de exemplo, não UI). O preço e
 * a sparkline ganham vida via LiveSpark (client); as tabs (Resumo ·
 * Fundamentais · Analista) espelham `StockTabs` real da app.
 *
 * ⚠️ Os TRÊS painéis ficam SEMPRE montados no DOM (alternados com a classe
 * `hidden`, nunca desmontados condicionalmente) — o `ScrollShowcase` colhe
 * `[data-scene-bar]` uma única vez dentro do `useGSAP` no mount
 * (`gsap.utils.toArray("[data-scene-bar]", trackRef.current)`); se o painel
 * Resumo fosse desmontado ao trocar de tab, os elementos saíam do DOM e o
 * scrub do histograma (cena 2) ficava permanentemente vazio ao voltar.
 * (Havia aqui um chip flutuante "AI Brief" para a cena 3 do showcase —
 * removido: aparecia por cima do mock a meio do scroll sem contexto. O tween
 * da cena 3 no ScrollShowcase é guardado por `if (chip)`, fica inerte.)
 *
 * Substituído automaticamente quando LANDING_MEDIA.showcaseTerminal
 * apontar para um ficheiro em public/media/.
 */

type TabKey = "overview" | "financials" | "analista";
const TAB_ORDER: TabKey[] = ["overview", "financials", "analista"];

export function TerminalMock({
  liveLabel,
  tabs,
  fin,
  analystMock,
}: {
  /** pill "Em direto" junto ao nome (i18n via page) */
  liveLabel?: string;
  /** labels reais das tabs (stock.tabs.*) */
  tabs: { overview: string; financials: string; analista: string };
  /** títulos dos 3 mini-gráficos + hint "há mais" (marketing.stories.fundamentals.* + marketing.showcase.*) */
  fin: {
    revenueTitle: string;
    segmentsTitle: string;
    fcfTitle: string;
    cagrLabel: string;
    moreCharts: string;
  };
  /** mini tese + mini-chat do Analista (marketing.stories.ai.* + marketing.showcase.chat.*) */
  analystMock: {
    thesisLabel: string;
    thesis: string;
    moatLabel: string;
    moatValue: string;
    chatUser: string;
    chatAnswer: string;
    chatCite: string;
  };
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="relative p-4 sm:p-6">
      {/* pill de navegação do mock — tabs reais, clicáveis */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8 rounded-lg" />
          <div className="hidden gap-1 sm:flex">
            {TAB_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  // estados idênticos ao pill real de components/stock/StockTabs.tsx
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  tab === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {tabs[key]}
              </button>
            ))}
          </div>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5" /> AAPL{" "}
          <kbd className="rounded border border-border px-1 text-[9px]">⌘K</kbd>
        </span>
      </div>

      {/* ── Painel Resumo (default) ──────────────────────────────── */}
      <div className={cn(tab !== "overview" && "hidden")}>
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm font-semibold">
                Apple Inc. <span className="ml-1 text-muted-foreground">· AAPL</span>
                {liveLabel ? (
                  <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <i className="live-dot h-1.5 w-1.5 rounded-full bg-primary" />
                    {liveLabel}
                  </span>
                ) : null}
              </div>
              <ArrowUpRight className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <LiveSpark />
          </div>

          {/* métricas */}
          <div className="grid grid-cols-2 gap-4">
            {[
              ["Revenue TTM", "394,3 B"],
              ["FCF", "108,8 B"],
              ["ROIC", "56,2%"],
              ["Margem", "46,2%"],
            ].map(([k, v]) => (
              <div key={k} className="glass rounded-2xl p-4">
                <div className="text-xs font-medium text-muted-foreground">{k}</div>
                <div className="nums mt-1.5 text-xl font-bold tracking-tight">{v}</div>
                {/* cena 2 do showcase: histograma cresce preso ao scroll */}
                <div aria-hidden className="mt-2 flex h-6 items-end gap-1">
                  {[40, 55, 48, 72, 100].map((h, i) => (
                    <span
                      key={i}
                      data-scene-bar
                      style={{ height: `${h}%` }}
                      className="w-1.5 origin-bottom rounded-sm bg-primary/60"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Painel Fundamentais: 3 mini-gráficos com o chrome real do cartão
          de gráfico da app, numa só linha. Compacto de propósito — a versão
          anterior (2 colunas + card full-width + 3 silhuetas fantasma) ficava
          muito mais alta que o Resumo e o mock saltava ao trocar de tab. */}
      <div className={cn(tab !== "financials" && "hidden")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="glass rounded-2xl p-3">
            <ChartCardChrome title={fin.revenueTitle} cagrLabel={fin.cagrLabel} cagr={CAGR_REVENUE} />
            <MiniChart variant="bars" ariaLabel={fin.revenueTitle} />
          </div>
          <div className="glass rounded-2xl p-3">
            {/* sem cagr — fiel ao real: o motor de gráficos financeiros nunca
                passa cagr= ao cartão STACKED_BAR de "Receita por segmento" */}
            <ChartCardChrome title={fin.segmentsTitle} />
            <MiniChart variant="stacked" ariaLabel={fin.segmentsTitle} />
          </div>
          <div className="glass rounded-2xl p-3">
            <ChartCardChrome title={fin.fcfTitle} cagrLabel={fin.cagrLabel} cagr={CAGR_FCF} />
            <MiniChart variant="composed" ariaLabel={fin.fcfTitle} />
          </div>
        </div>

        {/* hint "há mais" — chip discreto em vez das silhuetas (comiam altura
            sem acrescentar informação) */}
        <div className="mt-3 flex justify-center">
          <span className="rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
            {fin.moreCharts}
          </span>
        </div>
      </div>

      {/* ── Painel Analista: mini tese + chip de moat + mini-chat ───── */}
      <div className={cn(tab !== "analista" && "hidden")}>
        <div className="glass rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-primary/80">
            {analystMock.thesisLabel}
          </div>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/90">{analystMock.thesis}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            {analystMock.moatLabel}
            <span className="text-primary/60">·</span>
            {analystMock.moatValue}
          </div>

          {/* mini-chat — bolhas idênticas ao AnalystChat real
              (components/stock/StockAnalyst.tsx, mesmas classes) */}
          <div className="mt-4 space-y-2 border-t border-border/40 pt-4">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                {analystMock.chatUser}
              </div>
            </div>
            <div className="flex flex-col items-start gap-2">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border/50 bg-muted/50 px-4 py-2.5 text-sm text-foreground">
                {analystMock.chatAnswer}
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <FileText className="h-3 w-3" />
                {analystMock.chatCite}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
