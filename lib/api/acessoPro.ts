import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isDevUnlocked } from "@/lib/devAccess";
import { eTickerDemo } from "@/lib/demoPublica";

export { MAG_7, eMag7, TICKER_DEMO, eTickerDemo } from "@/lib/demoPublica";

/**
 * Guarda de acesso para as rotas de API que servem conteúdo PRO.
 *
 * ── Porque é que isto existe ─────────────────────────────────────────────
 *
 * As páginas gated não RETINHAM o conteúdo: renderizavam-no por inteiro e
 * punham-lhe um `<ProGate>` por cima com `pointer-events-none select-none`.
 * O que estava por baixo continuava a carregar, e os componentes que o
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
 * ── Três níveis, não dois ────────────────────────────────────────────────
 *
 * O funil de aquisição depende de haver coisas visíveis sem conta, e a
 * primeira versão deste guarda esqueceu-se disso: exigia sessão antes de
 * olhar para o ticker, e com isso partiu a demo pública (/stock/AAPL e /dcf,
 * as duas rotas que o middleware deixa passar a anónimos).
 *
 *   anónimo ou gratuito → só o TICKER_DEMO, e só onde a demo o mostra
 *   PRO                 → tudo
 *
 * Chegou a haver um nível intermédio, em que uma conta gratuita via as sete
 * grandes por inteiro. Saiu: fazia do registo um atalho para conteúdo pago —
 * bastava criar conta para ter a Apple, a Microsoft, a Nvidia, a Amazon, a
 * Google, a Meta e a Tesla completas, que são justamente as mais procuradas.
 *
 * ── Cache ────────────────────────────────────────────────────────────────
 *
 * Estas rotas serviam `public, s-maxage=3600`, ou seja a cache do CDN
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

type Autorizado = { ok: true; userId: string | null; pro: boolean };
type Recusado = { ok: false; resposta: NextResponse };

type Opcoes = {
  /** O ticker pedido, para as excepções abaixo. */
  ticker?: string | null;
  /** Deixa o TICKER_DEMO passar SEM sessão nenhuma (demo do funil). */
  demoAnonima?: boolean;
};

function recusa(status: number, corpo: Record<string, unknown>): Recusado {
  return {
    ok: false,
    resposta: NextResponse.json(corpo, {
      status,
      headers: { "Cache-Control": "no-store" },
    }),
  };
}

export async function exigirPro(opcoes: Opcoes = {}): Promise<Autorizado | Recusado> {
  const { ticker = null, demoAnonima = false } = opcoes;

  // O desbloqueio de desenvolvimento tem guard de NODE_ENV lá dentro: num
  // build de produção devolve sempre false, mesmo que a variável apareça no
  // ambiente por engano.
  //
  // Resolve-se o id REAL da sessão de desenvolvimento em vez de inventar um.
  // O getUser() em dev não toca na rede — devolve o utilizador local
  // configurado em DEV_LOGIN_EMAIL, lido do Prisma (ver lib/supabase/server.ts).
  // A primeira versão disto devolvia a string "dev", e quem cobra créditos
  // escrevia-a em AIUsageLog.userId, que tem chave estrangeira para users:
  // rebentava em qualquer rota de IA que não servisse da cache.
  if (isDevUnlocked()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { ok: true, userId: user?.id ?? null, pro: true };
  }

  // A demo é decidida ANTES de se procurar sessão: é o que um anónimo vê, e
  // procurar-lhe uma sessão que não tem só o mandaria embora.
  if (demoAnonima && eTickerDemo(ticker)) {
    return { ok: true, userId: null, pro: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return recusa(401, { error: "Autenticação necessária" });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { plan: true },
  });
  const pro = dbUser?.plan === "PRO";

  if (pro) {
    return { ok: true, userId: user.id, pro };
  }

  // 403 e não 401: a pessoa está identificada, o que falta é o plano. Um 401
  // levaria o cliente a mandá-la para o login, onde ela já esteve.
  return recusa(403, { error: "Plano PRO necessário", upgrade: true });
}
