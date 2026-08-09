import Link from "next/link";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS } from "@/lib/news/labels";

// Reexportado para os componentes; a fonte é lib/news/labels.ts (sem React,
// porque as mensagens do Discord também precisam destes rótulos).
export { CATEGORY_LABELS } from "@/lib/news/labels";

const SENTIMENT_STYLES: Record<string, string> = {
  POSITIVO: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  NEGATIVO: "bg-red-500/10 text-red-600 dark:text-red-400",
  NEUTRO: "bg-muted text-muted-foreground",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary">
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

export function SentimentBadge({ sentimento }: { sentimento: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        SENTIMENT_STYLES[sentimento] ?? SENTIMENT_STYLES.NEUTRO
      )}
    >
      {sentimento.toLowerCase()}
    </span>
  );
}

export function TickerBadges({ tickers, locale }: { tickers: string[]; locale: string }) {
  if (tickers.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tickers.map((ticker) => (
        <Link
          key={ticker}
          href={`/${locale}/stock/${ticker}`}
          className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {ticker}
        </Link>
      ))}
    </div>
  );
}

/**
 * Renderiza o markdown inline que o redator usa: `**negrito**` e `*itálico*`
 * (o prompt pede itálico nos termos financeiros ingleses — earnings, guidance,
 * private placement). Sem isto os asteriscos apareciam literais na página.
 *
 * Constrói nós React, nunca HTML — o texto vem de um LLM e nada garante que
 * não contenha marcação; `dangerouslySetInnerHTML` aqui seria um vetor de XSS.
 */
export function InlineMarkdown({ text }: { text: string }) {
  const partes = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).filter(Boolean);

  return (
    <>
      {partes.map((parte, i) => {
        if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) {
          return <strong key={i}>{parte.slice(2, -2)}</strong>;
        }
        if (parte.startsWith("*") && parte.endsWith("*") && parte.length > 2) {
          return <em key={i}>{parte.slice(1, -1)}</em>;
        }
        return <span key={i}>{parte}</span>;
      })}
    </>
  );
}

/** "há 2h" — o terminal é PT-PT, por isso o formato é fixo. */
export function timeAgoPt(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const dias = Math.floor(diff / 86400);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/**
 * Rodapé do artigo: atribuição às fontes e aviso de não-recomendação.
 *
 * A menção à autoria por IA foi removida a pedido do Costa (2026-08-09). A
 * atribuição às fontes fica — é o que sustenta o uso do material original e
 * não é negociável. Ver docs/PIPELINES.md §6.9 para o enquadramento.
 */
export function ArticleFooter({
  sources,
  className,
}: {
  sources: Array<{ name: string; url: string }>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground", className)}>
      <p>
        Artigo da redação da Bull Value a partir de fontes noticiosas
        internacionais. Não constitui recomendação de investimento.
      </p>
      {sources.length > 0 && (
        <p className="mt-2">
          <span className="font-medium text-foreground">Fontes originais: </span>
          {sources.map((source, i) => (
            <span key={source.url}>
              {i > 0 && " · "}
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline underline-offset-2 hover:text-primary"
              >
                {source.name}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
