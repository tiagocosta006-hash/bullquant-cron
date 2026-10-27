import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { criarCheckoutWhop } from "@/lib/whop";
import { VERSOES } from "@/lib/legal/config";
import { PLANOS, lerPlano } from "@/lib/planos";

/**
 * Abre o checkout da Whop para a conta com sessão iniciada.
 *
 * É o caminho de quem já tem conta e não tem PRO (registou-se e não pagou, ou
 * cancelou). Quem ainda não tem conta faz o registo, que segue sozinho para o
 * checkout (ver signup em app/[locale]/(auth)/actions.ts).
 *
 * POST, a partir do formulário do cartão de preços, com `imediato=on` (o
 * pedido expresso de início imediato, DL 24/2014 art. 15.º). Não é GET de
 * propósito: um link ou uma imagem noutro site podiam fazer o browser de
 * alguém com sessão chamar isto e registar um consentimento que a pessoa
 * nunca deu. Pela mesma razão, recusa pedidos de outra origem.
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const siteUrl = process.env.NODE_ENV === "development" || !forwardedHost ? origin : `https://${forwardedHost}`;

  const form = await request.formData().catch(() => null);
  const locale = form?.get("locale") === "en" ? "en" : "pt";
  const prefixo = locale === "pt" ? "" : "/en";
  const ir = (caminho: string) => NextResponse.redirect(`${siteUrl}${prefixo}${caminho}`, 303);

  const origemPedido = request.headers.get("origin");
  if (origemPedido && new URL(origemPedido).host !== new URL(siteUrl).host) {
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return ir("/register");

  // Garante a linha em public.users: há contas que existem no Supabase Auth
  // sem ela (o trigger falhou). Sem a linha, o webhook não encontrava a conta
  // pelo id do checkout e o pagamento ficava sem dono.
  const conta = await prisma.user
    .upsert({ where: { id: user.id }, create: { id: user.id, email: user.email.toLowerCase(), name: (user.user_metadata?.name as string) || null }, update: {}, select: { plan: true, whopProductId: true } })
    .catch(async (erro) => {
      console.error("[checkout] não foi possível garantir a conta:", erro);
      return prisma.user.findUnique({ where: { id: user.id }, select: { plan: true, whopProductId: true } });
    });
  if (!conta) return ir("/pricing?erro=checkout");
  // Com PRO só se pode subir do PRO para a comunidade; o resto já está pago.
  const plano = lerPlano(form?.get("plano"));
  const temComunidade = conta.whopProductId === PLANOS.comunidade.whopProduto;
  if (conta.plan === "PRO" && (plano === "pro" || temComunidade)) return ir("/dashboard");

  if (form?.get("imediato") !== "on") return ir("/pricing?erro=consentimento");

  const url = await criarCheckoutWhop({
    plano,
    userId: user.id,
    email: user.email,
    siteUrl,
    consentimento: `imediato;termos=${VERSOES.termos};em=${new Date().toISOString()}`,
    prefixo,
  });
  return NextResponse.redirect(url, 303);
}

/** Um GET (link antigo, favorito) volta aos preços em vez de abrir o checkout. */
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/pricing", request.url), 303);
}
