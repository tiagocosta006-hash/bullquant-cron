import { NextResponse, type NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'
import { updateSession } from '@/lib/supabase/middleware'
import { checkRateLimit } from '@/lib/rateLimit'

const intlMiddleware = createMiddleware(routing)

/** Extrai o IP do cliente. Na Vercel vem em x-forwarded-for; caímos para x-real-ip. */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Ignorar rotas de API para o next-intl (ele só atua em rotas de UI)
  const isApiRoute = pathname.startsWith('/api/')
  
  const isAuthRoute =
    ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname) &&
    request.method === 'POST'

  // 1. Rate limiting por IP
  if (isApiRoute || isAuthRoute) {
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

  // Se for uma API Route, não passamos pelo next-intl, apenas validamos sessão
  if (isApiRoute) {
    return await updateSession(request)
  }

  // 2. Para rotas UI, combinamos a atualização da sessão (Supabase) e a routing (next-intl)
  // O updateSession pode atualizar cookies de sessão que devem ser propagados.
  const supabaseResponse = await updateSession(request)
  const intlResponse = intlMiddleware(request)

  // Copiar os cookies atualizados pelo Supabase para a resposta do Next-Intl
  supabaseResponse.cookies.getAll().forEach(cookie => {
    intlResponse.cookies.set(cookie.name, cookie.value, cookie)
  })

  // Injetar o pathname atual nos headers para a geração dinâmica de SEO (canonicals e hreflang)
  intlResponse.headers.set('x-pathname', pathname)

  return intlResponse
}

export const config = {
  // Ignorar caminhos internos do Next.js, ficheiros estáticos, imagens e scripts
  matcher: [
    '/((?!_next/static|_next/image|brand/|team/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html|js|css|woff|woff2|json|xml)$).*)',
  ],
}
