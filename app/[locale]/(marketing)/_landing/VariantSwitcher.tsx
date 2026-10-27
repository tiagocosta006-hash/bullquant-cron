import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export type Variante = "a" | "b" | "c";

/**
 * Seletor das versões da landing — só aparece com `?v=` na URL, para a equipa
 * comparar. Fixo à esquerda, a meio da altura: em baixo já vivem a pill do
 * CTA, o banner de cookies e as ferramentas de dev.
 */
export async function VariantSwitcher({ atual, preview }: { atual: Variante; preview: boolean }) {
  const t = await getTranslations("marketing.variants");
  return (
    <nav
      aria-label={t("label")}
      className="glass glass-frost fixed left-2 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1 rounded-full p-1 shadow-lg"
    >
      {(["a", "b", "c"] as const).map((x) => (
        <Link
          key={x}
          href={{ pathname: "/", query: preview ? { v: x, preview: "1" } : { v: x } }}
          aria-current={x === atual ? "page" : undefined}
          title={t(x)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold uppercase transition-colors",
            x === atual ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {x}
        </Link>
      ))}
    </nav>
  );
}
