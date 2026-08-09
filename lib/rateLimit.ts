/**
 * Rate limiting por IP para endpoints da API.
 *
 * Estratégia (mais segura possível, degrada com elegância):
 *  - Se as env vars UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN existirem,
 *    usamos Upstash Redis (sliding window). É o standard para Next.js na Vercel:
 *    o limite é PARTILHADO entre todas as instâncias serverless, por isso um
 *    atacante não escapa saltando entre instâncias.
 *  - Se não estiverem configuradas, caímos para um limiter EM MEMÓRIA. Funciona
 *    em dev e trava abuso óbvio, mas cada instância serverless tem a sua própria
 *    memória — por isso em produção Upstash é fortemente recomendado. Avisamos
 *    uma vez no arranque para não passar despercebido.
 *
 * Edge-compatible (corre no proxy.ts / middleware).
 */

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

export type RateLimitResult = {
  success: boolean
  limit: number
  remaining: number
  /** epoch ms em que a janela reinicia (para o header Retry-After) */
  reset: number
}

/** Configuração de cada bucket: quantos pedidos por quantos milissegundos. */
type WindowConfig = { tokens: number; windowMs: number }

// Buckets. `api` é o limite geral para /api/*; `search` é mais apertado porque
// /api/search é NÃO-autenticado (o "public endpoint" clássico) e barato de martelar.
const BUCKETS = {
  api: { tokens: 120, windowMs: 60_000 },
  search: { tokens: 20, windowMs: 10_000 },
  auth: { tokens: 10, windowMs: 60_000 },
  // /api/track (Pulse) é público e chamado em cada navegação — bucket
  // próprio para não consumir o orçamento geral da API.
  track: { tokens: 60, windowMs: 60_000 },
  // /api/news/* é público: polling do bot de Discord + proxy das imagens.
  // Generoso de propósito — cada carregamento do terminal pede até 20 imagens
  // a /api/news/image/*, por isso um limite apertado travaria a navegação
  // normal de um leitor ao fim de duas ou três páginas.
  news: { tokens: 200, windowMs: 60_000 },
} satisfies Record<string, WindowConfig>

export type BucketName = keyof typeof BUCKETS

const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

// ── Backend Upstash (partilhado, robusto) ──────────────────────────────────
let upstashLimiters: Record<BucketName, Ratelimit> | null = null

if (hasUpstash) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
  upstashLimiters = {
    api: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(BUCKETS.api.tokens, "60 s"),
      prefix: "rl:api",
      analytics: false,
    }),
    search: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(BUCKETS.search.tokens, "10 s"),
      prefix: "rl:search",
      analytics: false,
    }),
    track: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(BUCKETS.track.tokens, "60 s"),
      prefix: "rl:track",
      analytics: false,
    }),
    news: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(BUCKETS.news.tokens, "60 s"),
      prefix: "rl:news",
      analytics: false,
    }),
    auth: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(BUCKETS.auth.tokens, "60 s"),
      prefix: "rl:auth",
      analytics: false,
    }),
  }
} else if (process.env.NODE_ENV === "production") {
  // Só avisa em produção — em dev o fallback in-memory é o esperado.
  console.warn(
    "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN não configurados — a usar fallback em memória (não partilhado entre instâncias serverless). Configura Upstash para rate limiting robusto em produção.",
  )
}

// ── Fallback em memória (sliding window aproximado por janela fixa) ─────────
// Guarda timestamps por chave e conta os que caem dentro da janela.
const memoryHits = new Map<string, number[]>()

function checkMemory(key: string, cfg: WindowConfig, now: number): RateLimitResult {
  const windowStart = now - cfg.windowMs
  const hits = (memoryHits.get(key) ?? []).filter((t) => t > windowStart)

  if (hits.length >= cfg.tokens) {
    const oldest = hits[0]
    return {
      success: false,
      limit: cfg.tokens,
      remaining: 0,
      reset: oldest + cfg.windowMs,
    }
  }

  hits.push(now)
  memoryHits.set(key, hits)

  // Limpeza oportunista para não crescer sem limite (o Map é per-instância e curto).
  if (memoryHits.size > 10_000) {
    for (const [k, v] of memoryHits) {
      const alive = v.filter((t) => t > windowStart)
      if (alive.length === 0) memoryHits.delete(k)
      else memoryHits.set(k, alive)
    }
  }

  return {
    success: true,
    limit: cfg.tokens,
    remaining: cfg.tokens - hits.length,
    reset: now + cfg.windowMs,
  }
}

/**
 * Verifica o rate limit para um identificador (normalmente o IP) num bucket.
 * Nunca lança: se o backend falhar, faz fail-open (deixa passar) para não
 * derrubar a app por causa do limiter.
 */
export async function checkRateLimit(
  identifier: string,
  bucket: BucketName,
): Promise<RateLimitResult> {
  const cfg = BUCKETS[bucket]
  try {
    if (upstashLimiters) {
      const res = await upstashLimiters[bucket].limit(identifier)
      return {
        success: res.success,
        limit: res.limit,
        remaining: res.remaining,
        reset: res.reset,
      }
    }
    return checkMemory(`${bucket}:${identifier}`, cfg, Date.now())
  } catch (err) {
    console.error("[rateLimit] erro no backend, a permitir o pedido (fail-open):", err)
    return { success: true, limit: cfg.tokens, remaining: cfg.tokens, reset: Date.now() + cfg.windowMs }
  }
}
