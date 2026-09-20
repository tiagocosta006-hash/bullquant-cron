import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { carregarSeriesReduzidas } from "@/lib/finance/seriesMacro";
import { MacroDashboardClient } from "./MacroDashboardClient";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isDevUnlocked } from "@/lib/devAccess";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MACRO_TICKERS = [
  '^DGS1MO', '^DGS10', '^DGS30', '^T10Y2Y', 
  '^FEDFUNDS', '^CPI_YOY', '^GDP_YOY', '^UNRATE', '^VIX'
];

/**
 * As séries macro, cacheadas e reduzidas ao que um gráfico mostra.
 *
 * Antes: `findMany` sem limite de datas sobre nove tickers, com `revalidate: 0`
 * por cima. Eram 59.584 pares data/valor (séries diárias desde 2001) enviados
 * ao browser DENTRO do HTML, a cada pedido e sem cache nenhuma — 2,5 MB de
 * página contra os 110-240 KB de todas as outras. Um gráfico tem ~800 px de
 * largura: noventa e oito por cento daqueles pontos caíam uns por cima dos
 * outros.
 *
 * Duas correções, ambas já usadas noutros sítios do código:
 *
 *   · Redução para ~800 pontos por série. O ÚLTIMO ponto é sempre preservado
 *     — é o valor de hoje, e perdê-lo mudava o número que a pessoa lê.
 *   · `unstable_cache` à volta da leitura. A página é `force-dynamic` porque
 *     lê a sessão, e por isso o CDN nunca a pode guardar; o que se cacheia é o
 *     trabalho de base de dados. Estas séries mudam uma vez por dia.
 *
 * ── E uma correcção à correcção ──────────────────────────────────────────
 *
 * A primeira versão reduzia os pontos EM JAVASCRIPT, depois de trazer tudo da
 * base. Isso arrumou a página (2,5 MB → 362 KB) e não mexeu no que saía do
 * Postgres: continuava a ler 136.257 linhas e 2,2 MB por chamada. Foi essa
 * consulta que esgotou o egress do Supabase e deixou a autenticação em baixo.
 * A redução vive agora no SQL, em lib/finance/seriesMacro.ts.
 */
const carregarSeriesMacro = unstable_cache(
  () => carregarSeriesReduzidas(MACRO_TICKERS),
  ["series-macro"],
  { revalidate: 3600, tags: ["macro"] },
);

export default async function MacroPage() {
  const user = await getUser();

  // DEV_UNLOCK_PRO desbloqueia esta página em dev sem login real (ver
  // lib/devAccess.ts); isDevUnlocked() é sempre false em produção.
  if (!user && !isDevUnlocked()) {
    redirect("/login");
  }

  const series = await carregarSeriesMacro();

  // Fetch Admin Commentaries
  const commentaries = await prisma.macroCommentary.findMany();
  const commentaryDict = commentaries.reduce((acc, curr) => {
    acc[curr.type] = { content: curr.content, updatedAt: curr.updatedAt.toISOString() };
    return acc;
  }, {} as Record<string, { content: string; updatedAt: string }>);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-20 pb-16">
      <MacroDashboardClient initialData={series} commentaries={commentaryDict} />
    </div>
  );
}
