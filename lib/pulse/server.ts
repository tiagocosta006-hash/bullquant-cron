import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Pulse — utilitários server-side do analytics first-party.
 * Privacidade: o IP nunca é persistido; o sessionId é um hash com salt
 * que roda diariamente, pelo que sessões de dias diferentes não são
 * correlacionáveis. Ver docs/PULSE.md.
 */

export const PULSE_EVENT_TYPES = [
  "pageview",
  "cta_click",
  "signup",
  "dcf_saved",
  "watchlist_add",
] as const;

export type PulseEventType = (typeof PULSE_EVENT_TYPES)[number];

export const pulsePayloadSchema = z.object({
  type: z.enum(PULSE_EVENT_TYPES),
  path: z.string().min(1).max(200),
  referrer: z.string().max(500).optional(),
  meta: z.record(z.string(), z.string().max(120)).optional(),
});

/** Hash anónimo de sessão: roda diariamente, IP nunca guardado. */
export function hashSession(ip: string, ua: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.PULSE_SALT ?? "pulse";
  return createHash("sha256").update(`${day}|${salt}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pingdom|monitor|preview|scrape|facebookexternalhit|whatsapp|telegram|curl|wget|python-requests/i;

export function isBot(ua: string): boolean {
  return ua.length === 0 || BOT_RE.test(ua);
}

export function deviceFromUa(ua: string): "desktop" | "mobile" | "tablet" {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Guard do dashboard /analytics: allowlist de emails em env var
 * (não há campo admin no modelo User). Comparação case-insensitive.
 */
export function isPulseAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ANALYTICS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

/**
 * Regista um evento diretamente do servidor (server actions — ex.: signup,
 * onde o redirect impede o track client-side). Nunca lança.
 */
export async function recordServerEvent(
  headers: Headers,
  type: PulseEventType,
  path: string,
  meta?: Record<string, string>,
  referrer?: string | null,
): Promise<void> {
  try {
    const ua = headers.get("user-agent") ?? "";
    if (isBot(ua)) return;
    if (headers.get("dnt") === "1" || headers.get("sec-gpc") === "1") return;
    const ip =
      headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      headers.get("x-real-ip") ||
      "unknown";
    await prisma.pulseEvent.create({
      data: {
        type,
        path,
        referrer: referrer ?? null,
        country: headers.get("x-vercel-ip-country"),
        device: deviceFromUa(ua),
        locale: headers.get("accept-language")?.slice(0, 2)?.toLowerCase() ?? null,
        sessionId: hashSession(ip, ua),
        meta: meta ?? undefined,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("[pulse] recordServerEvent:", err);
  }
}
