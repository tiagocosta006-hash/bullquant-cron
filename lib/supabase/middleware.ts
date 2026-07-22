import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify-email')

  // Filosofia: navegar é PÚBLICO (ver empresas, calculadora DCF, explorar,
  // dashboard, calendário…). Só as páginas PESSOAIS exigem sessão. Guardar
  // dados (posições, watchlist, cenários DCF) protege-se sempre na própria API
  // com 401 — isto é só o gate das PÁGINAS.
  const isPrivateRoute =
    pathname.startsWith('/portfolio') ||
    pathname.startsWith('/watchlist') ||
    pathname.startsWith('/settings')

  // Redirecionar utilizadores autenticados para fora das páginas de auth.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Anónimos numa página pessoal vão para o login (com ?redirect para voltarem
  // ao sítio depois de entrar).
  if (!user && isPrivateRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Guest funnel: o resto da app fica atrás de conta, exceto /stock/AAPL — a
  // demo viva usada no header/CTA "Espreitar sem conta". Objetivo é
  // maximizar criação de contas, não deixar o anónimo passear pela app
  // inteira; por isso vai para /register (sem ?redirect — não é suposto
  // voltar a esta página depois de entrar, é suposto criar conta).
  // ⚠️ Checklist: qualquer rota nova em app/(app)/ nasce PÚBLICA por omissão
  // aqui — quem adicionar uma página tem de decidir explicitamente se entra
  // em isPrivateRoute (precisa de conta, com redirect de regresso) ou
  // isGuestOnlyRoute (bloqueada para anónimos, funil de aquisição).
  const upperPath = pathname.toUpperCase()
  const isGuestOnlyRoute =
    pathname === '/dashboard' ||
    pathname.startsWith('/explore') ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/compare') ||
    pathname.startsWith('/analytics') ||
    pathname.startsWith('/transcripts') ||
    pathname === '/dcf' || // exato — /dcf/[id] é a página pública de DCF partilhada
    (pathname.startsWith('/stock/') && upperPath !== '/STOCK/AAPL')

  if (!user && isGuestOnlyRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/register'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
