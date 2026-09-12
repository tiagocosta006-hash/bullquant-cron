import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Webhook do Whop — a fonte de verdade do acesso pago.
 *
 * O acesso vive num sítio só: o campo `plan` do utilizador. As páginas gated
 * leem `plan === "PRO"` e não sabem que o Whop existe — este handler limita-se
 * a escrever lá. É o mesmo desenho do webhook do Paddle, de propósito: trocar
 * de fornecedor volta a ser mudar uma rota, não reescrever o gating.
 *
 * Por isso NÃO há tabela `whop_members` nem políticas de RLS. Esta aplicação
 * decide acesso no servidor, com Prisma; um segundo sistema de permissões a
 * viver em paralelo seria uma fonte de verdade a mais — e as seis páginas
 * gated continuariam a ler `plan`, portanto quem pagasse não veria diferença.
 */

// Estados que dão acesso. `past_due` entra de propósito: é o período de graça
// do Whop, em que o pagamento falhou mas ainda há tentativas por fazer. Cortar
// aí seria expulsar alguém por um cartão que expirou na véspera.
const ESTADOS_COM_ACESSO = new Set(["active", "trialing", "completed", "past_due"]);

type WhopEvent = {
  action?: string;
  data?: {
    id?: string;
    status?: string;
    valid?: boolean;
    product_id?: string;
    plan_id?: string;
    user_id?: string;
    user?: { id?: string; email?: string };
    email?: string;
  };
};

/**
 * Comparação em tempo constante. Um `===` normal devolve logo ao primeiro byte
 * diferente, e essa diferença de tempo é mensurável — dá para descobrir a
 * assinatura byte a byte.
 */
function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string): boolean {
  if (!cabecalho) return false;

  // O Whop manda a assinatura em hex, por vezes prefixada (ex.: "sha256=").
  const recebida = cabecalho.includes("=") ? cabecalho.split("=").pop()! : cabecalho;
  const esperada = crypto.createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");

  const a = Buffer.from(recebida.trim(), "hex");
  const b = Buffer.from(esperada, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const segredo = process.env.WHOP_WEBHOOK_SECRET;
  if (!segredo) {
    // Sem segredo configurado NÃO se processa nada. A alternativa — aceitar
    // sem verificar — deixaria qualquer pessoa com o URL dar-se acesso PRO.
    console.error("[whop] WHOP_WEBHOOK_SECRET não configurado — pedido recusado");
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 });
  }

  const corpo = await request.text();
  const cabecalho =
    request.headers.get("x-whop-signature") ??
    request.headers.get("whop-signature") ??
    request.headers.get("x-signature");

  if (!assinaturaValida(corpo, cabecalho, segredo)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let evento: WhopEvent;
  try {
    evento = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const acao = evento.action ?? "";
  const d = evento.data ?? {};

  // Só interessam eventos de membership. Os outros (pagamentos, reembolsos)
  // acabam sempre por gerar um destes, portanto ouvir os dois duplicaria
  // trabalho e abriria espaço a estados contraditórios.
  if (!acao.startsWith("membership.")) {
    return NextResponse.json({ ignorado: acao }, { status: 200 });
  }

  // Filtrar por produto: uma membership de outro produto do mesmo Whop não
  // deve abrir esta plataforma. Sem WHOP_PRODUCT_ID definido, aceita tudo —
  // aceitável enquanto houver um produto só, mas convém definir.
  const produtoEsperado = process.env.WHOP_PRODUCT_ID;
  const produto = d.product_id ?? d.plan_id;
  if (produtoEsperado && produto && produto !== produtoEsperado) {
    return NextResponse.json({ ignorado: "outro produto" }, { status: 200 });
  }

  const email = (d.user?.email ?? d.email ?? "").toLowerCase().trim();
  const whopUserId = d.user?.id ?? d.user_id ?? null;
  const estado = d.status ?? (acao.endsWith("deactivated") ? "inactive" : "active");

  // `valid` é a palavra final do Whop sobre a membership; quando vem, manda.
  const temAcesso =
    typeof d.valid === "boolean" ? d.valid : ESTADOS_COM_ACESSO.has(estado);

  // Uma membership que concede acesso TEM de trazer email: é com ele que a
  // conta nasce. 500 para o Whop repetir — se o payload nunca trouxer email, é
  // permissão a corrigir no endpoint do Whop, e um 400 (que o Whop trata como
  // definitivo) escondia isso para sempre, deixando alguém a pagar sem acesso.
  if (temAcesso && !email) {
    console.error("[whop] membership válida sem email no payload:", d.id, acao);
    return NextResponse.json({ error: "Payload sem email" }, { status: 500 });
  }

  if (!email && !whopUserId) {
    console.error("[whop] evento sem email nem user_id:", acao);
    return NextResponse.json({ error: "Sem identificação do utilizador" }, { status: 400 });
  }

  try {
    // Procura-se primeiro pelo id do Whop (estável) e só depois pelo email,
    // que a pessoa pode mudar. Na primeira compra só há email, e é aí que a
    // ligação entre as duas contas fica registada.
    let utilizador =
      (whopUserId ? await prisma.user.findUnique({ where: { whopUserId } }) : null) ??
      (email ? await prisma.user.findUnique({ where: { email } }) : null);

    if (!utilizador) {
      // Quem cancela sem nunca ter tido conta aqui não precisa de rasto nenhum.
      if (!temAcesso) {
        await prisma.whopPendingMembership.deleteMany({ where: { email } });
        return NextResponse.json({ ignorado: "sem conta e sem acesso" }, { status: 200 });
      }

      // A conta NÃO nasce aqui. Cada site tem o seu login, e a password é
      // sempre a que a pessoa define no thebullvalue.com — criar-lhe uma conta
      // no Supabase Auth a partir do webhook deixava-a com um registo que não
      // sabe abrir. O pagamento fica à espera e é resgatado no momento do
      // registo, se o email bater certo (ver (auth)/actions.ts).
      await prisma.whopPendingMembership.upsert({
        where: { email },
        create: {
          email,
          whopUserId,
          membershipId: d.id ?? `sem-id-${email}`,
          productId: produto ?? null,
          status: estado,
        },
        update: { status: estado, whopUserId, productId: produto ?? null, claimedAt: null },
      });

      console.log(`[whop] pagamento guardado à espera de registo: ${email}`);
      return NextResponse.json({ pendente: true }, { status: 200 });
    }

    await prisma.user.update({
      where: { id: utilizador.id },
      data: {
        plan: temAcesso ? "PRO" : "FREE",
        whopUserId: whopUserId ?? utilizador.whopUserId,
        whopMembershipId: d.id ?? utilizador.whopMembershipId,
        whopStatus: estado,
        whopProductId: produto ?? utilizador.whopProductId,
      },
    });

    // Já há conta, portanto não há nada à espera de registo. Deixar um pendente
    // para trás faria o PRO voltar sozinho se a pessoa alguma vez se
    // registasse de novo com o mesmo email depois de cancelar.
    if (email) {
      await prisma.whopPendingMembership.deleteMany({ where: { email } });
    }

    console.log(`[whop] ${acao}: ${utilizador.email} → ${temAcesso ? "PRO" : "FREE"}`);
    return NextResponse.json({ recebido: true }, { status: 200 });
  } catch (erro) {
    // 500 de propósito: o Whop volta a tentar. Devolver 200 aqui perdia o
    // evento para sempre e deixava alguém a pagar sem acesso.
    console.error("[whop] falha ao processar:", erro);
    return NextResponse.json({ error: "Falha a processar" }, { status: 500 });
  }
}
