import { cn } from "@/lib/utils";

/**
 * PageHeader — a anatomia de topo de TODAS as páginas do terminal:
 * chip de ícone em vidro dourado, título grande SF, subtítulo contido
 * e slot de ações alinhado à direita. Uma página = um PageHeader.
 * Server-safe (markup puro), usável também em client components.
 */
export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-4">
        {icon && (
          <div className="glass mt-1 hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-primary sm:flex">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Etiqueta de secção — o mesmo rótulo uppercase discreto em todo o lado. */
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground", className)}>
      {children}
    </h2>
  );
}

/** Nota informativa em vidro (avisos educativos/disclaimers). */
export function InfoNote({
  icon,
  children,
  className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass flex items-start gap-3 rounded-2xl p-4", className)}>
      {icon && <span className="mt-0.5 shrink-0 text-primary">{icon}</span>}
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
