import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { User } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { isDevUnlocked } from "@/lib/devAccess"

export function micDisplayName(user: User) {
  const name = user.user_metadata?.name
  return typeof name === "string" && name.trim() ? name.trim() : user.email?.split("@")[0] ?? user.id
}

const COOKIE = "bv_mic_analyst"
const TTL = 8 * 3600

export function micConfigured() {
  return (process.env.MIC_SHARED_PASSWORD?.length ?? 0) >= 12
}

export function validMicPassword(value: unknown) {
  if (!micConfigured() || typeof value !== "string" || value.length > 512) return false
  const digest = (input: string) => createHash("sha256").update(input).digest()
  return timingSafeEqual(digest(value), digest(process.env.MIC_SHARED_PASSWORD!))
}

async function signature(userId: string, expiry: number) {
  if (!micConfigured()) return null
  const sessionId = isDevUnlocked() && process.env.DEV_LOGIN_EMAIL
    ? "local"
    : (await (await createClient()).auth.getClaims()).data?.claims.session_id
  if (typeof sessionId !== "string") return null
  return createHmac("sha256", process.env.MIC_SHARED_PASSWORD!)
    .update(JSON.stringify([userId, sessionId, expiry])).digest("hex")
}

export async function isMicAnalyst(userId: string) {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token || !/^\d{10}\.[a-f0-9]{64}$/.test(token)) return false
  const [rawExpiry, supplied] = token.split(".")
  const expiry = Number(rawExpiry)
  if (expiry <= Math.floor(Date.now() / 1000)) return false
  try {
    const expected = await signature(userId, expiry)
    return !!expected && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"))
  } catch {
    return false
  }
}

export async function prepareMicAccess(userId: string) {
  const expiry = Math.floor(Date.now() / 1000) + TTL
  const signed = await signature(userId, expiry)
  if (!signed) return null
  return async () => {
    (await cookies()).set(COOKIE, `${expiry}.${signed}`, {
      path: "/", httpOnly: true,
      secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: TTL,
    })
  }
}

export async function clearMicAccess() {
  (await cookies()).delete(COOKIE)
}
