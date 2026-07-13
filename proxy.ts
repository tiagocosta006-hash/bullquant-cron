import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { checkRateLimit } from '@/lib/rateLimit'

/** Extrai o IP do cliente. Na Vercel vem em x-forwarded-for; caímos para x-real-ip. */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rate limiting por IP em toda a API. /api/search é NÃO-autenticado, por isso
  // leva um bucket mais apertado; o resto da API leva o limite geral.
  if (pathname.startsWith('/api/')) {
    const ip = getClientIp(request)
    const bucket = pathname.startsWith('/api/search') ? 'search' : 'api'
    const result = await checkRateLimit(ip, bucket)

    if (!result.success) {
      const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
      return NextResponse.json(
        { error: 'rate_limit', message: 'Demasiados pedidos. Tenta novamente daqui a instantes.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': String(result.remaining),
          },
        },
      )
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
