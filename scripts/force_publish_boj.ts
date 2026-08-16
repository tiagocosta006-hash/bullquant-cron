import { PrismaClient } from "@prisma/client";
import { serializeArticle } from "../lib/news/serialize";

const API = "https://discord.com/api/v10";
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = "1536065120642277508";

const SENTIMENT_COLORS: Record<string, number> = {
  POSITIVO: 0x10b981,
  NEGATIVO: 0xef4444,
  NEUTRO: 0x71717a,
};

const CATEGORY_LABELS: Record<string, string> = {
  MACROECONOMIA: "📊 Macroeconomia",
  MERCADOS: "📈 Mercados",
  EMPRESAS: "🏢 Empresas",
  CRIPTOMOEDAS: "🪙 Criptomoedas",
  TECNOLOGIA: "💻 Tecnologia",
};

const prismaProd = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
    }
  }
});

async function main() {
  const article = await prismaProd.newsArticle.findFirst({
    where: { titulo: { contains: "BOJ" } },
    include: { cluster: true },
  });

  if (!article) {
    console.log("BOJ article not found!");
    return;
  }

  const dto = serializeArticle(article);

  const campos = [
    { name: "Categoria", value: CATEGORY_LABELS[dto.categoria] ?? dto.categoria, inline: true },
    { name: "Sentimento", value: dto.sentimento.toLowerCase(), inline: true },
  ];
  if (dto.tickers.length > 0) {
    campos.push({ name: "Tickers", value: dto.tickers.join(", "), inline: false });
  }

  const body = {
    embeds: [
      {
        title: dto.titulo.slice(0, 256),
        description: dto.resumo.slice(0, 4096),
        url: dto.bullValueUrl,
        color: SENTIMENT_COLORS[dto.sentimento] ?? SENTIMENT_COLORS.NEUTRO,
        fields: campos,
        image: { url: `https://thebullvalue.com${dto.imageProxyUrl}` },
        timestamp: dto.publishedAt,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "Ler Artigo Completo",
            url: dto.bullValueUrl,
          },
        ],
      },
    ],
  };

  const res = await fetch(`${API}/channels/${CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    console.log("Successfully posted to public news channel!");
  } else {
    console.error("Failed to post:", await res.text());
  }
}

main().finally(() => prismaProd.$disconnect());
