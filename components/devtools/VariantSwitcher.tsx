/**
 * VariantSwitcher — seletor fixo das rotas de comparação de design
 * (/fotos, /tamanho). Andaime de desenvolvimento, nunca produção: as páginas
 * que o usam fazem `notFound()` fora de dev.
 *
 * Coluna à ESQUERDA e não barra centrada no topo: centrada batia no header do
 * site e na linha "Cobertura S&P 500 · Dados da SEC EDGAR".
 *
 * Sem "use client": são âncoras normais e cada variante é um URL próprio — a
 * navegação é o próprio browser. Estado em React aqui só serviria para tornar
 * as alternativas impossíveis de partilhar por link.
 */

export type SwitcherOption = { id: string; label: string; hint?: string };

export function VariantSwitcher({
  title,
  options,
  current,
  hrefFor,
  footer,
}: {
  title: string;
  options: readonly SwitcherOption[];
  current: string;
  hrefFor: (id: string) => string;
  /** linha final opcional — ex.: link para a outra família de variantes */
  footer?: React.ReactNode;
}) {
  return (
    <nav
      aria-label={title}
      /* Recuado a 25% e só opaco em hover/foco: é uma ferramenta de comparação,
         e ficar sempre a 100% por cima do subtítulo do hero estragava
         precisamente aquilo que se está a tentar avaliar. */
      className="fixed left-4 top-1/2 z-[60] flex w-44 -translate-y-1/2 flex-col items-stretch gap-0.5 rounded-2xl border border-border bg-card/95 p-1.5 text-xs opacity-25 shadow-lg backdrop-blur transition-opacity hover:opacity-100 focus-within:opacity-100"
    >
      <span className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {options.map((o) => (
        <a
          key={o.id}
          href={hrefFor(o.id)}
          title={o.hint}
          className={
            o.id === current
              ? "rounded-xl bg-primary px-3 py-1.5 text-left font-semibold text-primary-foreground"
              : "rounded-xl px-3 py-1.5 text-left font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          }
        >
          {o.label}
        </a>
      ))}
      {footer ? (
        <div className="mt-1 border-t border-border/60 px-2 pb-0.5 pt-2 text-[11px] leading-snug text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </nav>
  );
}
