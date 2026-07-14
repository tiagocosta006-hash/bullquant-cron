import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente Supabase por pedido, memoizado com React.cache(): layout, página,
 * generateMetadata e componentes server partilham a MESMA instância dentro
 * do mesmo render (fora de um render RSC, o cache() é transparente e apenas
 * executa a função — seguro em route handlers e server actions).
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
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
})

/**
 * getUser() deduplicado por pedido. O auth.getUser() é uma ida REAL à rede
 * (GoTrue, eu-west-1) — sem isto, middleware + layout + página pagavam
 * 3 round trips sequenciais por navegação. O refresh de sessão continua a
 * ser responsabilidade do middleware (updateSession); aqui só se lê.
 */
export const getUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
