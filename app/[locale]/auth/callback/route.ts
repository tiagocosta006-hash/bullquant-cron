import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sendWelcomeEmail } from '@/lib/resend'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Sanitise: only allow same-origin relative paths (no "//evil.com" exploits)
  const rawNext = searchParams.get('next') ?? '/'
  let next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'
  // welcome=1 marca uma confirmação de registo → boas-vindas só após confirmar.
  const isWelcome = searchParams.get('welcome') === '1'

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
    return NextResponse.redirect(`${origin}/login?error=O link expirou ou é inválido. (Missing token)`)
  }

  if (authError) {
    return NextResponse.redirect(`${origin}/login?error=Erro de Verificação: ${encodeURIComponent(authError.message)}`)
  }

  if (!authError) {
    // Registo acabado de confirmar → email de boas-vindas (no-op sem Resend).
    if (isWelcome) {
      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email) {
          await sendWelcomeEmail(user.email, (user.user_metadata?.name as string) || 'Investidor')
        }
      } catch (e) {
        console.error('Falha ao enviar email de boas-vindas:', e)
      }
    }
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

    // Confirmou o email mas não chegou a pagar (fechou o checkout da Whop):
    // o dashboard estaria todo trancado — vai para os preços, onde ativa o PRO
    // num clique. Quem pagou já é PRO (o webhook chega antes do clique no email).
    if (next === '/dashboard') {
      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const conta = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true } }) : null
        if (conta && conta.plan !== 'PRO') next = '/pricing'
      } catch (err) {
        console.error('Falha a ler o plano no callback:', err)
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
  return NextResponse.redirect(`${origin}/login?error=O link expirou ou é inválido.`)
}
