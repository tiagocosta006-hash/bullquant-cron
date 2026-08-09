import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { NewsStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyDiscordRequest } from "@/lib/discord/verify";
import { BUTTON_PUBLISH, BUTTON_REJECT, isDiscordApprover } from "@/lib/discord/client";

/**
 * Endpoint de interações do Discord — é aqui que chegam os cliques nos botões
 * Publicar/Rejeitar das mensagens de revisão.
 *
 * Configurar em Discord Developer Portal → a aplicação → "Interactions
 * Endpoint URL": https://thebullvalue.com/api/discord/interactions
 *
 * ⚠️ Definir esse URL faz TODAS as interações da aplicação passarem por HTTP em
 * vez do gateway. Se o bot de Discord da Bullocracy vier a usar slash commands
 * pelo gateway, essas passam a chegar aqui também e têm de ser tratadas (ou
 * respondidas com um erro explícito) neste handler.
 *
 * O Discord exige resposta em menos de 3 segundos e 401 para assinaturas
 * inválidas — valida ambas as coisas ao registar o URL.
 */

// Precisa do runtime Node: a verificação Ed25519 usa `node:crypto`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tipos de interação e de resposta (Discord API v10).
const INTERACTION_PING = 1;
const INTERACTION_COMPONENT = 3;
const RESPONSE_PONG = 1;
const RESPONSE_UPDATE_MESSAGE = 7;
const RESPONSE_EPHEMERAL_FLAG = 64;
const RESPONSE_MESSAGE = 4;

interface DiscordInteraction {
  type: number;
  data?: { custom_id?: string };
  member?: { user?: { id?: string; username?: string } };
  user?: { id?: string; username?: string };
  message?: { embeds?: Array<Record<string, unknown>> };
}

/** Resposta efémera — só o utilizador que carregou a vê. */
function ephemeral(content: string) {
  return NextResponse.json({
    type: RESPONSE_MESSAGE,
    data: { content, flags: RESPONSE_EPHEMERAL_FLAG },
  });
}

export async function POST(req: NextRequest) {
  // O corpo cru é indispensável: a assinatura cobre o texto exato enviado, e
  // um JSON.parse + re-stringify mudaria os bytes e invalidaria a verificação.
  const rawBody = await req.text();

  const check = verifyDiscordRequest(
    rawBody,
    req.headers.get("x-signature-ed25519"),
    req.headers.get("x-signature-timestamp"),
    process.env.DISCORD_PUBLIC_KEY
  );

  if (!check.valid) {
    console.warn("[discord] interação rejeitada:", check.reason);
    return new NextResponse("invalid request signature", { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  // O Discord faz um PING ao registar o URL e periodicamente a seguir.
  if (interaction.type === INTERACTION_PING) {
    return NextResponse.json({ type: RESPONSE_PONG });
  }

  if (interaction.type !== INTERACTION_COMPONENT) {
    return ephemeral("Interação não suportada por este endpoint.");
  }

  const customId = interaction.data?.custom_id ?? "";
  const [namespace, action, articleId] = customId.split(":");
  if (namespace !== "news" || !articleId) {
    return ephemeral("Botão desconhecido.");
  }

  // Em canal de servidor o utilizador vem em `member.user`; em DM vem em `user`.
  const user = interaction.member?.user ?? interaction.user;

  if (!isDiscordApprover(user?.id)) {
    console.warn(`[discord] tentativa de aprovação não autorizada (id=${user?.id})`);
    return ephemeral("Não tens permissão para publicar artigos.");
  }

  const article = await prisma.newsArticle.findUnique({
    where: { id: articleId },
    select: { id: true, titulo: true, slug: true, status: true },
  });

  if (!article) return ephemeral("Este artigo já não existe.");

  if (article.status !== NewsStatus.DRAFT) {
    return ephemeral(`Este artigo já está ${article.status.toLowerCase()}.`);
  }

  const publicar = action === BUTTON_PUBLISH.split(":")[1];
  const rejeitar = action === BUTTON_REJECT.split(":")[1];
  if (!publicar && !rejeitar) return ephemeral("Ação desconhecida.");

  await prisma.newsArticle.update({
    where: { id: article.id },
    data: { status: publicar ? NewsStatus.PUBLISHED : NewsStatus.ARCHIVED },
  });

  if (publicar) {
    revalidatePath("/[locale]/news", "page");
    revalidatePath(`/[locale]/news/[slug]`, "page");
  }

  console.log(
    `[discord] ${publicar ? "publicado" : "rejeitado"} por ${user?.username ?? user?.id}: ${article.titulo}`
  );

  // Substitui a mensagem original: mantém o embed e troca os botões por um
  // rótulo com o desfecho, para não ficar a dúvida se já foi tratado.
  return NextResponse.json({
    type: RESPONSE_UPDATE_MESSAGE,
    data: {
      embeds: interaction.message?.embeds ?? [],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2, // secondary, desativado
              label: publicar
                ? `Publicado por ${user?.username ?? "admin"}`
                : `Rejeitado por ${user?.username ?? "admin"}`,
              emoji: { name: publicar ? "✅" : "🗑️" },
              custom_id: "news:done",
              disabled: true,
            },
          ],
        },
      ],
    },
  });
}
