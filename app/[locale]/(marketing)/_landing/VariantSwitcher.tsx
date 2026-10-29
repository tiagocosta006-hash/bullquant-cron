import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export const VARIANTES_TODAS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export type Variante = (typeof VARIANTES_TODAS)[number];
/** Versões que ainda não podem ir para produção (ver LandingE). */
export const VARIANTES_RASCUNHO: readonly Variante[] = ["e"];

/**
 * Seletor das versões da landing — só aparece com `?v=` na URL, para a equipa
 * comparar. Fixo à esquerda, a meio da altura: em baixo já vivem a pill do
 * CTA, o banner de cookies e as ferramentas de dev.
 *
 * No telemóvel a coluna de 8 letras tapava o texto da página: fica só a letra
 * atual, que abre a lista ao toque (<details>, sem JS).
 */
export async function VariantSwitcher({ atual, preview, rascunhos }: { atual: Variante; preview: boolean; rascunhos: boolean }) {
  const t = await getTranslations("marketing.variants");
  const lista = VARIANTES_TODAS.filter((x) => rascunhos || !VARIANTES_RASCUNHO.includes(x));

  const links = (tamanho: string) =>
    lista.map((x) => (
      <Link
        key={x}
        href={{ pathname: "/", query: preview ? { v: x, preview: "1" } : { v: x } }}
        aria-current={x === atual ? "page" : undefined}
        title={t(x)}
        className={cn(
          "flex items-center justify-center rounded-full text-sm font-bold uppercase transition-colors",
          tamanho,
          x === atual ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {x}
      </Link>
    ));

  return (
    <>
      <nav
        aria-label={t("label")}
        className="glass glass-frost fixed left-2 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-1 rounded-full p-1 shadow-lg md:flex"
      >
        {links("h-9 w-9")}
      </nav>

      <details className="group fixed left-1.5 top-1/2 z-40 -translate-y-1/2 md:hidden">
        <summary
          aria-label={t("label")}
          title={t(atual)}
          className="glass glass-frost flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-sm font-bold uppercase text-primary shadow-lg [&::-webkit-details-marker]:hidden"
        >
          {atual}
        </summary>
        <nav aria-label={t("label")} className="glass glass-frost mt-1.5 flex flex-col gap-1 rounded-3xl p-1 shadow-lg">
          {links("h-10 w-10")}
        </nav>
      </details>
    </>
  );
}
