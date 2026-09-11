import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isDevUnlocked } from '@/lib/devAccess'

/**
 * Cliente Supabase por pedido, memoizado com React.cache(): layout, página,
 * generateMetadata e componentes server partilham a MESMA instância dentro
 * do mesmo render (fora de um render RSC, o cache() é transparente e apenas
 * executa a função — seguro em route handlers e server actions).
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored when called from Server Component
          }
        },
      },
    }
  )

  // Sessão de DESENVOLVIMENTO, aplicada no PRÓPRIO cliente para que as 28
  // rotas de API que chamam supabase.auth.getUser() directamente a herdem
  // sem serem tocadas uma a uma.
  //
  // Com DEV_UNLOCK_PRO ligado e DEV_LOGIN_EMAIL preenchido, um pedido sem
  // sessão passa a correr como esse utilizador local — que tem de existir já
  // na base de dados; aqui não se cria ninguém. Serve para inspeccionar as
  // páginas que dependem de um utilizador real (watchlist, portfólio,
  // definições) sem depender do Supabase, que hoje nem resolve em DNS e
  // deixa o login pendurado para sempre.
  //
  // isDevUnlocked() tem guard de NODE_ENV: num build de produção é sempre
  // falso, portanto não há como abrir sessão a ninguém sem autenticação real.
  if (isDevUnlocked() && process.env.DEV_LOGIN_EMAIL) {
    const original = client.auth.getUser.bind(client.auth)
    client.auth.getUser = async (jwt?: string) => {
      let res
      try {
        res = await original(jwt)
      } catch {
        res = { data: { user: null }, error: null }
      }
      if (res.data?.user) return res as Awaited<ReturnType<typeof original>>

      const { prisma } = await import('@/lib/prisma')
      const local = await prisma.user.findUnique({
        where: { email: process.env.DEV_LOGIN_EMAIL! },
        select: { id: true, email: true },
      })
      if (!local) return res as Awaited<ReturnType<typeof original>>

      return {
        data: {
          user: {
            id: local.id,
            email: local.email,
            app_metadata: {},
            user_metadata: { name: 'Dev Session' },
            aud: 'authenticated',
            created_at: new Date(0).toISOString(),
          },
        },
        error: null,
      } as unknown as Awaited<ReturnType<typeof original>>
    }
  }

  return client
})

/**
 * getUser() deduplicado por pedido. O auth.getUser() é uma ida REAL à rede
 * (GoTrue, eu-west-1) — sem isto, middleware + layout + página pagavam
 * 3 round trips sequenciais por navegação. O refresh de sessão continua a
 * ser responsabilidade do middleware (updateSession); aqui só se lê.
 */
export const getUser = cache(async () => {
  const supabase = await createClient()
  // O fallback de desenvolvimento e o try/catch de rede vivem no createClient,
  // para que as rotas que usam o cliente directamente tenham o mesmo
  // comportamento que este helper.
  try {
    const { data } = await supabase.auth.getUser()
    return data.user
  } catch {
    return null
  }
})
