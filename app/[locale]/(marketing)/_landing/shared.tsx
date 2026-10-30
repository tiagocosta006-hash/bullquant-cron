import { ChevronDown } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { PLANOS, PLANO_IDS } from "@/lib/planos";

/**
 * Peças partilhadas pelas versões da landing (?v=a|b|c — ver ../page.tsx):
 * a equipa, a animação do título palavra a palavra, o FAQ e o JSON-LD.
 */

/* Equipa na faixa de prova — mesmas fotos da página /about (public/team/).
   Sem foto → iniciais, como lá. */
// image é opcional de propósito: com todos os membros a ter foto, o `as const`
// tornava `image` sempre truthy e o TS estreitava o ramo do fallback de iniciais
// para `never` (erro de build). Tipar `image?` mantém o fallback válido para
// quando um membro ainda não tiver foto em public/team/.
export const TEAM: { name: string; roleKey: string; image?: string; initials: string }[] = [
  { name: "Rodrigo Martins", roleKey: "role1", image: "/team/rodrigo.jpg", initials: "RM" },
  { name: "Tiago Costa", roleKey: "role2", image: "/team/tiago.jpg", initials: "TC" },
  { name: "Alexandre Machado", roleKey: "role3", image: "/team/alex.jpeg", initials: "AM" },
];

/* Ordem das perguntas do FAQ (marketing.faq.qN/aN), também no JSON-LD. */
export const FAQ_IDS = [1, 6, 7, 2, 5, 3, 4] as const;

export const heroDelay = (s: number) => ({ "--hero-delay": `${s}s` }) as React.CSSProperties;

/* Headline palavra a palavra: cada palavra sobe de trás de uma clip-line
   (.hero-clip/.hero-word em globals.css); --w dá o stagger e o delay do
   sheen no accent. O h1 leva aria-label com a frase completa.
   NOTA: o cls (gold-sheen-text) vai num span INTERIOR — na mesma node
   que .hero-word, a `animation` do sheen esmagava a da subida e a
   palavra ficava presa fora do clip (invisível). */
export const heroWords = (text: string, offset: number, cls?: string) =>
  text.split(" ").map((w, i) => (
    <span key={`${offset}-${i}`} aria-hidden className="hero-clip">
      <span className="hero-word" style={{ "--w": offset + i } as React.CSSProperties}>
        {cls ? <span className={cls}>{w}</span> : w}
      </span>
    </span>
  ));

/**
 * Primeira palavra do título quando é o nome do produto: "Bull" na cor do
 * texto, "Value" a dourado, tudo 18% maior (a meio dos 10–25% pedidos).
 *
 * `text-[1.18em]` e não um px: o h1 muda de tamanho em quatro breakpoints
 * (5xl → 7xl → 8xl → 7.5rem) e uma medida absoluta desalinhava-se em três
 * deles. Em `em` a marca fica sempre 18% acima do resto da frase.
 *
 * Data-driven de propósito — só dispara se `titleLead` COMEÇAR por
 * BRAND.name. Em EN a frase é "See the value…", não leva marca, e não recebe
 * tratamento nenhum. Um `if (locale === "pt")` daria o mesmo resultado hoje e
 * partia-se no dia em que a copy PT mudasse.
 */
// O título usa a marca sem o artigo ("BullValue: …"), e BRAND.name é
// "The BullValue" — comparar com o nome inteiro nunca dava match e o
// tratamento não chegava a aparecer.
const MARCA_TITULO = BRAND.name.replace(/^The /, ""); // "BullValue"
const BRAND_SPLIT = MARCA_TITULO.length - BRAND.nameParts[1].length; // "Bull" | "Value"

export function heroLead(text: string) {
  if (!text.startsWith(MARCA_TITULO)) return heroWords(text, 0);
  const resto = text.slice(MARCA_TITULO.length); // ex.: ": a plataforma para os"
  const [cauda, ...palavras] = resto.split(" "); // cauda = ":" colado à marca
  return (
    <>
      <span aria-hidden className="hero-clip">
        <span className="hero-word text-[1.18em]" style={{ "--w": 0 } as React.CSSProperties}>
          {MARCA_TITULO.slice(0, BRAND_SPLIT)}
          <span className="text-primary">{MARCA_TITULO.slice(BRAND_SPLIT)}</span>
          {cauda}
        </span>
      </span>
      {heroWords(palavras.join(" "), 1)}
    </>
  );
}

export type FaqItem = { q: string; a: string };

/**
 * JSON-LD da landing: o produto com os dois planos e o FAQ que está À VISTA
 * (o Google exige que o FAQPage corresponda ao texto visível na página).
 */
export function LandingJsonLd({ faq }: { faq: FaqItem[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": BRAND.name,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "url": BRAND.siteUrl,
        "offers": PLANO_IDS.map((id) => ({
          "@type": "Offer",
          "name": id === "pro" ? "BullValue PRO" : "BullValue PRO + Comunidade",
          "price": String(PLANOS[id].preco),
          "billingIncrement": "P1M",
          "priceCurrency": "EUR",
        })),
      },
      {
        "@type": "FAQPage",
        "mainEntity": faq.map(({ q, a }) => ({
          "@type": "Question",
          "name": q,
          "acceptedAnswer": { "@type": "Answer", "text": a },
        })),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

/** Lista do FAQ em <details> (sem JS; o chevron roda por CSS, .faq-item em globals.css). */
export function FaqList({ items, className = "mt-10 space-y-3" }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={className}>
      {items.map(({ q, a }) => (
        <details key={q} className="faq-item glass rounded-2xl">
          <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold">
            {q}
            <ChevronDown className="faq-chevron h-4 w-4 shrink-0 text-muted-foreground" />
          </summary>
          <p className="max-w-[68ch] px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground">{a}</p>
        </details>
      ))}
    </div>
  );
}

/** Preço mensal em cêntimos por dia (média do ano), para "uns X cêntimos por dia". */
export const centimosPorDia = (preco: number) => Math.round(((preco * 12) / 365) * 100);
