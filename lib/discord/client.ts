import type { NewsArticleDTO } from "@/lib/news/serialize";
import { CATEGORY_LABELS } from "@/lib/news/labels";

/**
 * Cliente REST mínimo do Discord — só o que o circuito de aprovação precisa.
 *
 * As mensagens são publicadas com o token do BOT (não por webhook de canal):
 * só webhooks de aplicação podem enviar componentes interativos, e um webhook
 * normal de canal veria o campo `components` simplesmente ignorado.
 */

const API = "https://discord.com/api/v10";
const TIMEOUT_MS = 10_000;

/** Cores dos embeds por sentimento, em decimal (é o que o Discord aceita). */
const SENTIMENT_COLORS: Record<string, number> = {
  POSITIVO: 0x10b981,
  NEGATIVO: 0xef4444,
  NEUTRO: 0x71717a,
};

export const BUTTON_PUBLISH = "news:publish";
export const BUTTON_REJECT = "news:reject";

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN || null;
}

/**
 * Publica um rascunho no canal de revisão com botões Publicar/Rejeitar.
 * Nunca lança: uma falha do Discord não pode derrubar a ingestão — o artigo
 * fica na mesma em DRAFT e visível em /admin/news.
 */
export async function postArticleForReview(
  article: NewsArticleDTO,
  relevanceScore: number | null
): Promise<boolean> {
  const token = botToken();
  const channelId = process.env.DISCORD_REVIEW_CHANNEL_ID;

  if (!token || !channelId) {
    console.warn("[discord] DISCORD_BOT_TOKEN/DISCORD_REVIEW_CHANNEL_ID em falta — sem notificação");
    return false;
  }

  const campos = [
    { name: "Categoria", value: CATEGORY_LABELS[article.categoria] ?? article.categoria, inline: true },
    { name: "Sentimento", value: article.sentimento.toLowerCase(), inline: true },
  ];
  if (relevanceScore != null) {
    campos.push({ name: "Relevância", value: `${relevanceScore}/100`, inline: true });
  }
  if (article.tickers.length > 0) {
    campos.push({ name: "Tickers", value: article.tickers.join(", "), inline: false });
  }
  campos.push({
    name: "Fontes",
    value: article.sources.map((s) => `[${s.name}](${s.url})`).join(" · ") || "—",
    inline: false,
  });

  const body = {
    embeds: [
      {
        title: article.titulo.slice(0, 256),
        description: article.resumo.slice(0, 4096),
        url: article.bullValueUrl,
        color: SENTIMENT_COLORS[article.sentimento] ?? SENTIMENT_COLORS.NEUTRO,
        fields: campos,
        image: article.imageUrl ? { url: article.imageUrl } : undefined,
        footer: { text: "Rascunho — não está visível no site" },
        timestamp: article.publishedAt,
      },
    ],
    components: [
      {
        type: 1, // action row
        components: [
          {
            type: 2, // button
            style: 3, // success
            label: "Publicar",
            emoji: { name: "✅" },
            custom_id: `${BUTTON_PUBLISH}:${article.id}`,
          },
          {
            type: 2,
            style: 4, // danger
            label: "Rejeitar",
            emoji: { name: "🗑️" },
            custom_id: `${BUTTON_REJECT}:${article.id}`,
          },
          {
            type: 2,
            style: 5, // link
            label: "Ler",
            url: article.bullValueUrl,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(`${API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[discord] falha a publicar (${res.status}):`, (await res.text()).slice(0, 300));
      return false;
    }

    return true;
  } catch (err) {
    console.error("[discord] erro de rede:", (err as Error).message);
    return false;
  }
}

/** Ids de Discord autorizados a aprovar, de `DISCORD_ADMIN_USER_IDS`. */
export function isDiscordApprover(userId: string | undefined): boolean {
  if (!userId) return false;
  const allowlist = (process.env.DISCORD_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  // Sem allowlist ninguém aprova — falhar fechado, nunca aberto: toda a gente
  // com acesso ao canal veria os botões.
  return allowlist.includes(userId);
}
