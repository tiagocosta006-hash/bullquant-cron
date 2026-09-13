import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isDevUnlocked } from "@/lib/devAccess";

/**
 * Guarda de acesso para as rotas de API que servem conteúdo PRO.
 *
 * ── Porque é que isto existe ─────────────────────────────────────────────
 *
 * As páginas gated não RETINHAM o conteúdo: renderizavam-no por inteiro e
 * punham-lhe um `<ProGate>` por cima com `pointer-events-none select-none`.
 * O que estava por baixo continuava a ser carregado — e os componentes que o
 * carregam (FinancialsEngine, ValuationMultiples, DcfCalculator,
 * InsiderActivity) buscam os dados a rotas de API que não pediam nada a
 * ninguém.
 *
 * Medido contra produção, sem sessão, sem cookie, sem conta:
 *
 *     /api/fundamentals/AAPL   200   117 KB   histórico financeiro completo
 *     /api/valuation/AAPL      200    72 KB   múltiplos de avaliação
 *     /api/dcf-data/AAPL       200   2,0 KB   dados para a DCF
 *
 * Ou seja: o produto inteiro, para as 530 empresas, a um `curl` de distância.
 * O `ProGate` é uma cortina; isto é a porta.
 *
 * ── Cache ────────────────────────────────────────────────────────────────
 *
 * Estas rotas serviam `public, s-maxage=3600`, o que as punha na cache do CDN
 * PARTILHADA por toda a gente. Pôr um guarda e deixar esse cabeçalho seria
 * pior do que não ter guarda nenhum: o CDN guardava a resposta de um
 * utilizador com acesso e servia-a a quem não tem — ou guardava um 401 e
 * partia a aplicação para quem paga.
 *
 * Por isso `private`: cada browser guarda a sua cópia, o CDN não guarda
 * nenhuma. Custa dois queries indexados por utilizador por hora, que é o
 * preço de a resposta depender de quem pergunta.
 */
export const CACHE_PRIVADO = "private, max-age=3600, stale-while-revalidate=86400";

/**
 * As sete grandes ficam abertas a qualquer conta autenticada — é o que a
 * página de ação mostra a quem ainda não paga, para a plataforma se poder
 * experimentar com empresas que as pessoas reconhecem.
 *
 * Vive aqui e não na página porque a regra tem de ser a MESMA nos dois
 * sítios: com a lista declarada só no componente, a API ficava livre de a
 * contradizer — e foi exactamente assim que o conteúdo pago acabou aberto.
 */
export const MAG_7 = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA"];

export function eMag7(ticker: string | null | undefined): boolean {
  return !!ticker && MAG_7.includes(ticker.toUpperCase());
}

type Autorizado = { ok: true; userId: string; pro: boolean };
type Recusado = { ok: false; resposta: NextResponse };

/**
 * Exige sessão e plano PRO.
 *
 * @param tickerLivreSeMag7 quando dado, uma das sete grandes passa sem PRO
 *        (mas continua a exigir sessão) — espelha o `isPro || isMag7` da
 *        página de ação.
 */
export async function exigirPro(
  tickerLivreSeMag7?: string | null,
): Promise<Autorizado | Recusado> {
  // O desbloqueio de desenvolvimento tem guard de NODE_ENV lá dentro: num
  // build de produção devolve sempre false, mesmo que a variável apareça no
  // ambiente por engano.
  if (isDevUnlocked()) {
    return { ok: true, userId: "dev", pro: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { error: "Autenticação necessária" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { plan: true },
  });
  const pro = dbUser?.plan === "PRO";

  if (pro || eMag7(tickerLivreSeMag7)) {
    return { ok: true, userId: user.id, pro };
  }

  // 403 e não 401: a pessoa está identificada, o que falta é o plano. Um 401
  // levaria o cliente a mandá-la para o login, onde ela já esteve.
  return {
    ok: false,
    resposta: NextResponse.json(
      { error: "Plano PRO necessário", upgrade: true },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    ),
  };
}
