import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '10 s'),
  analytics: true,
  ephemeralCache: new Map(),
})

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  const isApiRoute = pathname.startsWith('/api')
  const isAuthRoute = ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname) && request.method === 'POST'

  // 1. Rate Limiting for API routes and Auth actions
  if (isApiRoute || isAuthRoute) {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    
    try {
      const { success, limit, reset, remaining } = await ratelimit.limit(`ratelimit_${ip}`)
      
      if (!success) {
        if (isAuthRoute) {
          const url = request.nextUrl.clone()
          url.searchParams.set('error', 'Fizeste demasiadas tentativas. Aguarda uns minutos.')
          // Use 303 to force a GET request and avoid a POST infinite loop
          return NextResponse.redirect(url, 303)
        }

        return NextResponse.json(
          { error: 'Muitos pedidos. Por favor aguarde um momento.' },
          { 
            status: 429,
            headers: {
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': reset.toString(),
              'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
            }
          }
        )
      }
    } catch (error) {
      console.error('Rate limiting error:', error)
    }
  }

  // 2. Supabase Auth Session Update
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
