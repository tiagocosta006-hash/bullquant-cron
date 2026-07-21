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
  const isAuthRoute =
    ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname) &&
    request.method === 'POST'

  // Rate limiting por IP. /api/search é NÃO-autenticado, por isso leva um
  // bucket mais apertado; o resto da API leva o limite geral; as rotas de
  // auth (login/registo/reset) levam um bucket próprio contra brute-force.
  if (pathname.startsWith('/api/') || isAuthRoute) {
    const ip = getClientIp(request)
    const bucket = isAuthRoute
      ? 'auth'
      : pathname.startsWith('/api/search')
        ? 'search'
        : pathname.startsWith('/api/track')
          ? 'track'
          : 'api'
    const result = await checkRateLimit(ip, bucket)

    if (!result.success) {
      const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))

      if (isAuthRoute) {
        const url = request.nextUrl.clone()
        url.searchParams.set('error', 'Fizeste demasiadas tentativas. Aguarda uns minutos.')
        // 303 força um GET a seguir, evitando um loop infinito de POST.
        return NextResponse.redirect(url, 303)
      }

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
