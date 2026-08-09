import { createPublicKey, verify } from "node:crypto";

/**
 * Verificação da assinatura Ed25519 das interações do Discord.
 *
 * O Discord assina `timestamp + corpo` com a chave privada da aplicação e
 * envia a assinatura em `X-Signature-Ed25519`. Sem esta verificação o endpoint
 * ficava aberto: qualquer pessoa que descobrisse o URL podia publicar artigos
 * fazendo um POST com o `custom_id` certo.
 *
 * O Discord também EXIGE que pedidos com assinatura inválida respondam 401 —
 * valida isto automaticamente ao registar o Interactions Endpoint URL e recusa
 * o URL se não responder como devido.
 */

/**
 * Cabeçalho DER de uma SubjectPublicKeyInfo Ed25519. O Discord dá a chave
 * pública como 32 bytes em hexadecimal; o `node:crypto` só aceita SPKI, por
 * isso prefixamos o cabeçalho fixo do algoritmo (OID 1.3.101.112).
 */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Janela de tolerância para o timestamp, contra reenvio de pedidos antigos. */
const MAX_TIMESTAMP_SKEW_SECONDS = 300;

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

export function verifyDiscordRequest(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKeyHex: string | undefined,
  now: number = Date.now()
): VerifyResult {
  if (!publicKeyHex) return { valid: false, reason: "DISCORD_PUBLIC_KEY não configurada" };
  if (!signature || !timestamp) return { valid: false, reason: "cabeçalhos em falta" };

  // 64 bytes de assinatura, 32 de chave — em hexadecimal, o dobro.
  if (!/^[0-9a-f]{128}$/i.test(signature)) return { valid: false, reason: "assinatura malformada" };
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex)) return { valid: false, reason: "chave pública malformada" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { valid: false, reason: "timestamp inválido" };
  if (Math.abs(now / 1000 - ts) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return { valid: false, reason: "timestamp fora da janela" };
  }

  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });

    // Ed25519 não usa algoritmo de hash separado — daí o `null`.
    const ok = verify(
      null,
      Buffer.from(timestamp + rawBody, "utf8"),
      key,
      Buffer.from(signature, "hex")
    );

    return ok ? { valid: true } : { valid: false, reason: "assinatura não corresponde" };
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }
}
