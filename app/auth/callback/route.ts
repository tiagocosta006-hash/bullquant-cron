import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Sanitise: only allow same-origin relative paths (no "//evil.com" exploits)
  const rawNext = searchParams.get('next') ?? '/'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  let authError = null

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authError = error
  } else if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ 
      token_hash, 
      type: type as any 
    })
    authError = error
  } else {
    // Return the user to an error page with some instructions
    return NextResponse.redirect(`${origin}/login?message=O link expirou ou é inválido.`)
  }

  if (!authError) {
    // Se o utilizador acabou de alterar e confirmar o email, sincronizamos com o Prisma
    if (type === 'email_change') {
      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email) {
          await prisma.user.update({
            where: { id: user.id },
            data: { email: user.email }
          })
        }
      } catch (err) {
        console.error('Erro ao sincronizar novo email com o Prisma:', err)
      }
    }

    const forwardedHost = request.headers.get('x-forwarded-host')
    const isLocalEnv = process.env.NODE_ENV === 'development'
    
    if (isLocalEnv) {
      return NextResponse.redirect(`${origin}${next}`)
    } else if (forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${next}`)
    } else {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with some instructions
  return NextResponse.redirect(`${origin}/login?message=O link expirou ou é inválido.`)
}
