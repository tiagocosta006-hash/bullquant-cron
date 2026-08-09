/**
 * Cria o canal privado de aprovações do Terminal de Notícias.
 *
 * Correr DEPOIS de criar a segunda aplicação Discord e de convidar o bot dela
 * para o servidor:
 *
 *   npx tsx scripts/setup_discord_review_channel.ts
 *
 * Usa DISCORD_BOT_TOKEN (o da aplicação de aprovações), DISCORD_GUILD_ID e
 * DISCORD_ADMIN_USER_IDS. Imprime o id do canal para pores em
 * DISCORD_REVIEW_CHANNEL_ID.
 *
 * Faz isto por script e não à mão porque as permission overwrites do Discord
 * são fáceis de deixar mal: basta esquecer o `VIEW_CHANNEL` negado ao
 * @everyone para os rascunhos ficarem visíveis ao servidor inteiro.
 */
import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const API = "https://discord.com/api/v10";
const CHANNEL_NAME = "aprovacoes-noticias";

// Bits de permissão (Discord Permissions v2, como strings decimais).
const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const EMBED_LINKS = 1n << 14n;
const READ_HISTORY = 1n << 16n;

const BOT_PERMS = VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_HISTORY;
const ADMIN_PERMS = VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY;

async function discord(pathname: string, init?: RequestInit) {
  const res = await fetch(API + pathname, {
    ...init,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "BullValue/1.0",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${pathname}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const admins = (process.env.DISCORD_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token) throw new Error("DISCORD_BOT_TOKEN em falta (usa o da aplicação de aprovações)");
  if (!guildId) throw new Error("DISCORD_GUILD_ID em falta");
  if (admins.length === 0) throw new Error("DISCORD_ADMIN_USER_IDS em falta");
  if (admins.some((id) => !/^\d{17,20}$/.test(id))) {
    throw new Error(
      `DISCORD_ADMIN_USER_IDS tem de conter ids numéricos, não usernames. Recebido: ${admins.join(", ")}`
    );
  }

  const bot = await discord("/users/@me");
  console.log(`bot autenticado: ${bot.username} (${bot.id})`);

  // Confirma que o bot está mesmo no servidor antes de tentar criar o canal —
  // o erro do Discord nesse caso é opaco ("Unknown Guild").
  try {
    await discord(`/guilds/${guildId}`);
  } catch {
    throw new Error(
      `O bot não está no servidor ${guildId}. Convida-o primeiro (OAuth2 → URL Generator → scopes: bot).`
    );
  }

  const existentes: Array<{ id: string; name: string }> = await discord(`/guilds/${guildId}/channels`);
  const jaExiste = existentes.find((c) => c.name === CHANNEL_NAME);
  if (jaExiste) {
    console.log(`\nO canal #${CHANNEL_NAME} já existe.`);
    console.log(`DISCORD_REVIEW_CHANNEL_ID=${jaExiste.id}`);
    return;
  }

  const payload = {
    name: CHANNEL_NAME,
    type: 0, // texto
    topic: "Rascunhos do Terminal de Notícias à espera de aprovação. Publicar/Rejeitar nos botões.",
    permission_overwrites: [
      // O id do @everyone é o próprio id do servidor.
      { id: guildId, type: 0, deny: VIEW_CHANNEL.toString() },
      { id: bot.id, type: 1, allow: BOT_PERMS.toString() },
      ...admins.map((id) => ({ id, type: 1, allow: ADMIN_PERMS.toString() })),
    ],
  };

  if (process.argv.includes("--dry-run")) {
    console.log("\n(dry-run) criaria o canal com este payload:");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const canal = await discord(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  console.log(`\ncanal criado: #${canal.name}`);
  console.log(`  @everyone: sem acesso`);
  console.log(`  ${bot.username}: escrever + embeds`);
  console.log(`  admins: ${admins.join(", ")}`);
  console.log(`\nPõe isto no .env.local e nos secrets do GitHub:`);
  console.log(`DISCORD_REVIEW_CHANNEL_ID=${canal.id}`);
}

main().catch((err) => {
  console.error("erro:", (err as Error).message);
  process.exitCode = 1;
});
