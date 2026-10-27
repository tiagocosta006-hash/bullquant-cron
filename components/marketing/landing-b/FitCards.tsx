import { Check, Minus } from "lucide-react";
import { Reveal } from "@/components/fx/Reveal";

/**
 * "É para ti / não é para ti" (versão B): trata as duas objeções de quem
 * chega do Instagram (sou iniciante? isto são dicas?) antes do preço. Sem
 * vermelho no "não é": não é uma variação, é só uma lista.
 */
export function FitCards({ yesTitle, yes, noTitle, no }: { yesTitle: string; yes: string[]; noTitle: string; no: string[] }) {
  return (
    <div className="mt-10 grid gap-5 md:grid-cols-2">
      <Reveal className="glass rounded-3xl p-5 md:p-8">
        <h3 className="text-lg font-bold">{yesTitle}</h3>
        <ul className="mt-4 space-y-3">
          {yes.map((item) => (
            <li key={item} className="flex gap-3 text-[15px]">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal className="rounded-3xl border border-border/60 bg-card/40 p-5 md:p-8">
        <h3 className="text-lg font-bold">{noTitle}</h3>
        <ul className="mt-4 space-y-3">
          {no.map((item) => (
            <li key={item} className="flex gap-3 text-[15px] text-foreground/80">
              <Minus className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}
