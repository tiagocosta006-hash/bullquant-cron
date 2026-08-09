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
  index,
  children,
}: {
  eyebrow: string;
  title: string;
  titleAccent?: string;
  desc: string;
  bullets?: string[];
  reverse?: boolean;
  /** número de capítulo fantasma ("01"…) — numeral, não precisa de i18n */
  index?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-20">
      <Reveal
        className={cn(
          /* SEM `lg:sticky lg:top-32`. A coluna do texto ficava PREGADA no
             ecrã enquanto o gráfico ao lado subia — duas metades da mesma
             secção a andar a ritmos diferentes. Era esta a origem do
             "a secção 01 tem scroll separado": não eram os ScrollTriggers do
             gráfico, era o texto a não acompanhar. Agora as duas colunas
             sobem juntas. */
          "relative lg:col-span-5",
          reverse && "lg:order-2",
        )}
      >
        {index ? (
          <span
            aria-hidden
            className="nums pointer-events-none absolute -top-12 right-0 select-none text-[5rem] font-extrabold leading-none tracking-tighter text-foreground/[0.05] lg:text-[9rem]"
          >
            {index}
          </span>
        ) : null}
        <div data-kicker className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {eyebrow}
        </div>
        {/* hairline de capítulo — desenha-se quando o Reveal entra */}
        <span aria-hidden className="chapter-rule mt-5 block h-px w-24" />
        <h2 className="mt-5 max-w-[16ch] text-balance text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-5xl md:text-6xl">
          {title}
          {/* sem gold-sheen-text: com 3 stories, o brilho aparecia 3x e roubava
              o destaque ao herói e ao preço. O ouro sozinho já marca o acento. */}
          {titleAccent ? (
            <span className="text-primary"> {titleAccent}</span>
          ) : null}
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

      <Reveal className={cn("lg:col-span-7", reverse && "lg:order-1")}>
        {/* Sem Parallax: o visual derivava em relacao ao texto imediatamente ao
            lado, que esta quieto. Duas coisas emparelhadas a moverem-se a
            ritmos diferentes leem-se como erro de alinhamento. */}
        <div>
          {children}
        </div>
      </Reveal>
    </div>
  );
}
