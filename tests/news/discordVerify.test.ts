import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyDiscordRequest } from "@/lib/discord/verify";
import { isDiscordApprover } from "@/lib/discord/client";

/**
 * Gera um par Ed25519 e devolve a chave pública em hexadecimal cru (32 bytes),
 * que é o formato em que o Discord a publica no Developer Portal.
 */
function parDeChaves() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  // Os últimos 32 bytes da SPKI são a chave crua.
  return { privateKey, publicKeyHex: spki.subarray(-32).toString("hex") };
}

function assinar(privateKey: Parameters<typeof sign>[2], timestamp: string, body: string) {
  return sign(null, Buffer.from(timestamp + body, "utf8"), privateKey).toString("hex");
}

const AGORA = 1_770_000_000_000; // instante fixo — nada de Date.now() nos testes
const TS = String(Math.floor(AGORA / 1000));
const BODY = JSON.stringify({ type: 1 });

describe("verifyDiscordRequest", () => {
  it("aceita uma assinatura válida", () => {
    const { privateKey, publicKeyHex } = parDeChaves();
    const sig = assinar(privateKey, TS, BODY);
    expect(verifyDiscordRequest(BODY, sig, TS, publicKeyHex, AGORA)).toEqual({ valid: true });
  });

  it("rejeita quando o corpo foi adulterado", () => {
    const { privateKey, publicKeyHex } = parDeChaves();
    const sig = assinar(privateKey, TS, BODY);
    const adulterado = JSON.stringify({ type: 3, data: { custom_id: "news:publish:xyz" } });
    expect(verifyDiscordRequest(adulterado, sig, TS, publicKeyHex, AGORA).valid).toBe(false);
  });

  it("rejeita uma assinatura de outra chave", () => {
    const a = parDeChaves();
    const b = parDeChaves();
    const sig = assinar(a.privateKey, TS, BODY);
    expect(verifyDiscordRequest(BODY, sig, TS, b.publicKeyHex, AGORA).valid).toBe(false);
  });

  it("rejeita um timestamp fora da janela (reenvio de pedido antigo)", () => {
    const { privateKey, publicKeyHex } = parDeChaves();
    const antigo = String(Math.floor(AGORA / 1000) - 3600);
    const sig = assinar(privateKey, antigo, BODY);
    const r = verifyDiscordRequest(BODY, sig, antigo, publicKeyHex, AGORA);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("janela");
  });

  it("rejeita cabeçalhos em falta", () => {
    const { publicKeyHex } = parDeChaves();
    expect(verifyDiscordRequest(BODY, null, TS, publicKeyHex, AGORA).valid).toBe(false);
    expect(verifyDiscordRequest(BODY, "ab".repeat(64), null, publicKeyHex, AGORA).valid).toBe(false);
  });

  it("rejeita assinatura malformada sem rebentar", () => {
    const { publicKeyHex } = parDeChaves();
    expect(verifyDiscordRequest(BODY, "não é hex", TS, publicKeyHex, AGORA).valid).toBe(false);
    expect(verifyDiscordRequest(BODY, "abcd", TS, publicKeyHex, AGORA).valid).toBe(false);
  });

  // Sem chave configurada o endpoint tem de falhar FECHADO — se deixasse passar,
  // um deploy sem a variável abria a publicação a qualquer pessoa.
  it("rejeita quando a chave pública não está configurada", () => {
    const { privateKey } = parDeChaves();
    const sig = assinar(privateKey, TS, BODY);
    const r = verifyDiscordRequest(BODY, sig, TS, undefined, AGORA);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("DISCORD_PUBLIC_KEY");
  });
});

describe("isDiscordApprover", () => {
  const original = process.env.DISCORD_ADMIN_USER_IDS;
  beforeEach(() => {
    process.env.DISCORD_ADMIN_USER_IDS = "123456789, 987654321";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.DISCORD_ADMIN_USER_IDS;
    else process.env.DISCORD_ADMIN_USER_IDS = original;
  });

  it("aceita ids da allowlist, ignorando espaços", () => {
    expect(isDiscordApprover("123456789")).toBe(true);
    expect(isDiscordApprover("987654321")).toBe(true);
  });

  it("recusa quem não está na allowlist", () => {
    expect(isDiscordApprover("555")).toBe(false);
    expect(isDiscordApprover(undefined)).toBe(false);
  });

  // Falhar fechado: toda a gente com acesso ao canal vê os botões, por isso uma
  // allowlist vazia não pode significar "qualquer um pode".
  it("recusa toda a gente quando a allowlist está vazia", () => {
    process.env.DISCORD_ADMIN_USER_IDS = "";
    expect(isDiscordApprover("123456789")).toBe(false);
  });
});
