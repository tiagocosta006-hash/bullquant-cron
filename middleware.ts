import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Inicializa o limitador: Permite 20 requests a cada 10 segundos
// Utilizamos uma slidingWindow para impedir que bursts esgotem imediatamente a quota
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '10 s'),
  analytics: true,
  // Cache de memória curta para acelerar verificações e poupar na fatura do Redis
  ephemeralCache: new Map(),
})

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // 1. Rate Limiting (Aplica-se apenas a rotas da API)
  if (pathname.startsWith('/api')) {
    // Em Vercel/Next.js o IP é capturado assim
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    
    try {
      const { success, limit, reset, remaining } = await ratelimit.limit(`ratelimit_${ip}`)
      
      if (!success) {
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
      // Falha suave (failsafe): Se o Redis estiver em baixo, não bloqueamos o tráfego legítimo
      console.error('Rate limiting error:', error)
    }
  }

  // 2. Proteção de Rotas & Autenticação (Supabase)
  // O ficheiro anterior estava inacessível na root, agora corre em todos os pedidos!
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Ignora caminhos de otimização de imagem, favicon, ficheiros estáticos (js, css)
     * para que o middleware só corra nas páginas reais e nas APIs.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2|ico)$).*)',
  ],
}
