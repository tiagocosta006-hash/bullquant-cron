import { Reveal } from "@/components/fx/Reveal";
import { cn } from "@/lib/utils";

/**
 * FeatureStory — split reutilizável das stories: coluna de texto sticky
 * (headline grande + bullets) e coluna de conteúdo (gráfico/demo/media).
 * Server Component: o motion vive nos children e no Reveal.
 */
export function FeatureStory({
  eyebrow,
  title,
  titleAccent,
  desc,
  bullets,
  reverse = false,
  children,
}: {
  eyebrow: string;
  title: string;
  titleAccent?: string;
  desc: string;
  bullets?: string[];
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-20">
      <Reveal
        className={cn(
          "lg:col-span-5 lg:sticky lg:top-32 lg:self-start",
          reverse && "lg:order-2",
        )}
      >
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {eyebrow}
        </div>
        <h2 className="mt-6 max-w-[16ch] text-balance text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-5xl md:text-6xl">
          {title}
          {titleAccent ? <span className="text-primary"> {titleAccent}</span> : null}
        </h2>
        <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">{desc}</p>
        {bullets && bullets.length > 0 ? (
          <ul className="mt-8 space-y-3.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[15px] leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
        ) : null}
      </Reveal>

      <Reveal className={cn("lg:col-span-7", reverse && "lg:order-1")}>{children}</Reveal>
    </div>
  );
}
