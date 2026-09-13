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
 *
 * ── O formato foi escrito à mão e estava errado ──────────────────────────
 *
 * A primeira versão deste ficheiro assumiu um esquema de assinatura e um
 * formato de payload que o Whop não usa. Estava tudo ao lado: assinava-se o
 * corpo em hex quando é base64 de `id.timestamp.corpo`, lia-se `action`
 * quando o campo é `type`, esperava-se `membership.went_valid` quando o
 * evento é `membership.activated`, e procurava-se um `data.valid` que não
 * existe. Nenhum pagamento real teria passado daqui.
 *
 * O que está abaixo segue o que o Whop documenta.
 */

// ── Verificação: Standard Webhooks ──────────────────────────────────────────
//
// Três cabeçalhos, sempre com estes nomes:
//   webhook-id         identificador da mensagem (o MESMO em todas as
//                      retentativas do mesmo evento)
//   webhook-timestamp  unix em segundos
//   webhook-signature  "v1,<base64>" — e pode trazer várias, separadas por
//                      espaço, durante uma rotação de segredo
//
// Assina-se `{id}.{timestamp}.{corpo bruto}` com HMAC-SHA256 e compara-se em
// base64. O corpo TEM de ser os bytes crus: fazer JSON.parse e voltar a
// serializar muda espaços e ordem de chaves, e a assinatura deixa de bater.

/** Cinco minutos, como o Standard Webhooks manda. Uma assinatura antiga é uma
 *  assinatura capturada, e revalidá-la eternamente é o que torna um replay
 *  possível. */
const TOLERANCIA_SEGUNDOS = 300;

/**
 * Chaves candidatas para o HMAC.
 *
 * O segredo vem como `ws_…`. A documentação do Whop diz para guardar a string
 * inteira, sem tirar o prefixo, e que o SDK "deriva a chave" a partir dela —
 * o que não diz se o HMAC usa os bytes da string toda, ou se o prefixo cai e
 * o resto é descodificado de base64 (que é como o Standard Webhooks define os
 * segredos `whsec_`).
 *
 * Não vale a pena adivinhar: tentam-se as três leituras. Todas passam pela
 * mesma comparação em tempo constante, portanto tentar mais do que uma não
 * enfraquece nada — só evita que a integração falhe por causa de uma linha de
 * documentação ambígua.
 */
function chavesCandidatas(segredo: string): Buffer[] {
  const chaves = [Buffer.from(segredo, "utf8")];
  const semPrefixo = segredo.replace(/^(ws_|whsec_)/, "");
  if (semPrefixo !== segredo) {
    chaves.push(Buffer.from(semPrefixo, "utf8"));
    try {
      const bytes = Buffer.from(semPrefixo, "base64");
      if (bytes.length > 0) chaves.push(bytes);
    } catch {
      // base64 inválido — a leitura simplesmente não se aplica
    }
  }
  return chaves;
}

function assinaturaValida(corpoBruto: string, headers: Headers, segredo: string): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const cabecalho = headers.get("webhook-signature");
  if (!id || !timestamp || !cabecalho) return false;

  const t = Number(timestamp);
  if (!Number.isFinite(t)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > TOLERANCIA_SEGUNDOS) return false;

  const conteudo = `${id}.${timestamp}.${corpoBruto}`;

  // "v1,AAA v2,BBB" → ["AAA", "BBB"]. Fica-se pela parte a seguir à vírgula;
  // a versão não entra no cálculo.
  const recebidas = cabecalho
    .split(" ")
    .map((p) => p.split(",").pop() ?? "")
    .filter(Boolean);

  for (const chave of chavesCandidatas(segredo)) {
    const esperada = crypto.createHmac("sha256", chave).update(conteudo, "utf8").digest();
    for (const recebida of recebidas) {
      const bytes = Buffer.from(recebida, "base64");
      if (bytes.length === esperada.length && crypto.timingSafeEqual(bytes, esperada)) {
        return true;
      }
    }
  }
  return false;
}

// ── Payload ─────────────────────────────────────────────────────────────────

type WhopEvent = {
  id?: string;
  type?: string;
  timestamp?: string;
  data?: {
    id?: string;
    status?: string;
    plan?: { id?: string };
    product?: { id?: string };
    user?: { id?: string; email?: string; name?: string };
    // Presente na forma nova da API (quando se fixa `api_version_date`), onde
    // o objeto `user` aninhado deixa de vir. Aqui o endpoint é v1 sem versão
    // fixada, mas ler os dois custa nada e evita uma surpresa se isso mudar.
    user_id?: string;
    plan_id?: string;
    product_id?: string;
  };
};

/**
 * O acesso decide-se pelo TIPO do evento, não pelo estado.
 *
 * O `membership.activated` cobre início de período experimental, renovação e
 * reativação; o `membership.deactivated` cobre cancelamento, expiração e saída
 * da comunidade. O `data.status` é informação útil para guardar, mas não é o
 * sinal: um `past_due` continua a ser alguém com acesso (é o período de graça
 * do Whop, com tentativas de cobrança por fazer) e cortar aí seria expulsar
 * quem teve um cartão a expirar na véspera.
 */
const TIPOS_QUE_DAO_ACESSO = new Set(["membership.activated"]);
const TIPOS_QUE_TIRAM_ACESSO = new Set(["membership.deactivated"]);

export async function POST(request: Request) {
  const segredo = process.env.WHOP_WEBHOOK_SECRET;

  // Um valor de espera NÃO é um segredo. A variável esteve em produção com o
  // literal "POR_PREENCHER" à espera de ser trocada, e nesse estado o endpoint
  // parecia protegido — devolvia 401 a quem não assinasse — mas aceitava
  // qualquer pedido assinado com a própria palavra. Ou seja: quem a
  // adivinhasse dava a si mesmo PRO.
  const PLACEHOLDERS = new Set([
    "por_preencher", "porpreencher", "preencher", "changeme", "change_me",
    "todo", "to_do", "placeholder", "secret", "segredo", "xxx", "test",
  ]);
  if (segredo && PLACEHOLDERS.has(segredo.trim().toLowerCase())) {
    console.error(
      "[whop] WHOP_WEBHOOK_SECRET ainda tem um valor de espera " +
      `("${segredo}") — pedido recusado. Põe o signing secret real do Whop.`
    );
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 });
  }

  if (!segredo) {
    // Sem segredo configurado NÃO se processa nada. A alternativa — aceitar
    // sem verificar — deixaria qualquer pessoa com o URL dar-se acesso PRO.
    console.error("[whop] WHOP_WEBHOOK_SECRET não configurado — pedido recusado");
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 });
  }

  const corpo = await request.text();

  if (!assinaturaValida(corpo, request.headers, segredo)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let evento: WhopEvent;
  try {
    evento = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const tipo = evento.type ?? "";
  const d = evento.data ?? {};

  // Só interessam eventos de membership. Os outros (pagamentos, reembolsos)
  // acabam sempre por gerar um destes, portanto ouvir os dois duplicaria
  // trabalho e abriria espaço a estados contraditórios.
  const daAcesso = TIPOS_QUE_DAO_ACESSO.has(tipo);
  const tiraAcesso = TIPOS_QUE_TIRAM_ACESSO.has(tipo);
  if (!daAcesso && !tiraAcesso) {
    return NextResponse.json({ ignorado: tipo }, { status: 200 });
  }

  // Filtrar por produto: uma membership de outro produto do mesmo Whop não
  // deve abrir esta plataforma. Sem WHOP_PRODUCT_ID definido, aceita tudo —
  // aceitável enquanto houver um produto só, mas convém definir.
  const produtoEsperado = process.env.WHOP_PRODUCT_ID;
  const produto = d.product?.id ?? d.product_id ?? d.plan?.id ?? d.plan_id;
  if (produtoEsperado && produto && produto !== produtoEsperado) {
    return NextResponse.json({ ignorado: "outro produto" }, { status: 200 });
  }

  const email = (d.user?.email ?? "").toLowerCase().trim();
  const whopUserId = d.user?.id ?? d.user_id ?? null;
  const estado = d.status ?? (daAcesso ? "active" : "canceled");
  const temAcesso = daAcesso;

  // ── Porque é que aqui NÃO se devolve erro ─────────────────────────────────
  //
  // O Whop trata qualquer resposta que não seja 2xx (e qualquer resposta que
  // demore mais de 5 segundos) como entrega falhada. Repete 12 vezes ao longo
  // de ~71 horas e, se as falhas continuarem 72 horas com 10 ou mais entregas
  // falhadas, DESLIGA o webhook — e os eventos desse período não são
  // reenviados. Um 500 nosso a repetir-se derruba a integração inteira.
  //
  // Por isso um payload sem email devolve 200 e grita nos logs. Não é uma
  // falha transitória que valha a pena repetir: o email só falta quando a
  // permissão `member:email:read` não está dada ao webhook no painel do Whop,
  // e repetir mil vezes não a concede. É uma configuração a corrigir, e o log
  // é que a faz aparecer.
  if (temAcesso && !email) {
    console.error(
      "[whop] MEMBERSHIP VÁLIDA SEM EMAIL — o webhook não tem a permissão " +
      `member:email:read. membership=${d.id} tipo=${tipo} user=${whopUserId}. ` +
      "Sem email não há como ligar o pagamento a uma conta."
    );
    return NextResponse.json({ ignorado: "sem email" }, { status: 200 });
  }

  if (!email && !whopUserId) {
    console.error("[whop] evento sem email nem user_id:", tipo);
    return NextResponse.json({ ignorado: "sem identificação" }, { status: 200 });
  }

  try {
    // Procura-se primeiro pelo id do Whop (estável) e só depois pelo email,
    // que a pessoa pode mudar. Na primeira compra só há email, e é aí que a
    // ligação entre as duas contas fica registada.
    const utilizador =
      (whopUserId ? await prisma.user.findUnique({ where: { whopUserId } }) : null) ??
      (email ? await prisma.user.findUnique({ where: { email } }) : null);

    if (!utilizador) {
      // Quem cancela sem nunca ter tido conta aqui não precisa de rasto nenhum.
      if (!temAcesso) {
        if (email) {
          await prisma.whopPendingMembership.deleteMany({ where: { email } });
        }
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

    console.log(`[whop] ${tipo}: ${utilizador.email} → ${temAcesso ? "PRO" : "FREE"}`);
    return NextResponse.json({ recebido: true }, { status: 200 });
  } catch (erro) {
    // Aqui SIM vale a pena repetir: uma falha de base de dados é transitória, e
    // as escritas acima são idempotentes (o mesmo evento aplicado duas vezes
    // deixa o mesmo estado), portanto uma retentativa não faz mal nenhum.
    console.error("[whop] falha ao processar:", erro);
    return NextResponse.json({ error: "Falha a processar" }, { status: 500 });
  }
}
