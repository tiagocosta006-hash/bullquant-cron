import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto"

/**
 * Encriptação simétrica (AES-256-GCM) para segredos de terceiros em repouso
 * (ex: API keys de integrações externas como Trading212). Nunca usar para
 * passwords de utilizadores — isso é sempre gerido pelo Supabase Auth.
 *
 * ENCRYPTION_KEY (env, só no servidor) deve ter pelo menos 32 caracteres.
 * Derivamos a chave AES via scrypt em vez de usar o valor bruto, para tolerar
 * qualquer string de entrada com segurança.
 */

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const SALT = "bullquant-encryption-v1" // fixo e não-secreto — só serve para derivar a chave via scrypt, não substitui o ENCRYPTION_KEY

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret || secret.length < 32) {
    throw new Error("ENCRYPTION_KEY must be set (min 32 chars) to encrypt/decrypt secrets")
  }
  return scryptSync(secret, SALT, 32)
}

/** Devolve "iv:authTag:ciphertext", tudo em hex, pronto a guardar num campo de texto. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decryptSecret(payload: string): string {
  const [ivHex, authTagHex, encryptedHex] = payload.split(":")
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted payload format")
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()])
  return decrypted.toString("utf8")
}
