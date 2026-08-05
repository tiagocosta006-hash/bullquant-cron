"use server"

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuthError } from '@supabase/supabase-js'
import { sendWelcomeEmail, sendPasswordResetEmail, sendConfirmationEmail, isEmailEnabled } from '@/lib/resend'
import { prisma } from '@/lib/prisma'
import { recordServerEvent } from '@/lib/pulse/server'

function translateError(error: AuthError | { message?: string }) {
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('invalid login credentials')) return 'Email ou password incorretos.';
  if (msg.includes('email not confirmed')) return 'Precisas de confirmar o teu email antes de entrar. Verifica a tua caixa de entrada (e a pasta de spam).';
  if (msg.includes('user already registered')) return 'Este email já se encontra registado.';
  if (msg.includes('password should be at least')) return 'A password deve ter pelo menos 6 caracteres.';
  if (msg.includes('different from the old password')) return 'A nova password tem de ser diferente da antiga.';
  if (msg.includes('weak_password')) return 'A password é demasiado fraca. Tenta adicionar números ou símbolos.';
  if (msg.includes('invalid email')) return 'O formato do email não é válido.';
  if (msg.includes('is invalid')) return 'Esse endereço de email não é aceite. Verifica se está correto.';
  if (msg.includes('rate limit') || msg.includes('too many requests')) return 'Fizeste demasiadas tentativas seguidas. Aguarda uns minutos e tenta de novo.';
  if (msg.includes('email link is invalid or has expired')) return 'O link expirou ou é inválido. Pede um novo link.';
  
  // Em vez de "erro inesperado" que soa a plataforma instável, mas também não escondendo totalmente o erro técnico.
  return `Não foi possível concluir o pedido (${error.message || 'Desconhecido'}). Verifica os dados e tenta novamente.`;
}

function normalizeEmail(raw: unknown) {
  return String(raw ?? '').trim().toLowerCase()
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const email = normalizeEmail(formData.get('email'))
  const data = {
    email,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)
  if (error) {
    // Conta ainda por confirmar → ecrã que explica isso (com reenvio),
    // em vez de um erro solto na página de login.
    if ((error.message || '').toLowerCase().includes('email not confirmed')) {
      redirect(`/verify-email?email=${encodeURIComponent(email)}&unconfirmed=1`)
    }
    redirect(`/login?error=${encodeURIComponent(translateError(error))}&email=${encodeURIComponent(email)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// URL base da app (sem barra final): preferimos o host real do pedido
// (funciona em preview/produção atrás de proxy), com fallback para
// NEXT_PUBLIC_SITE_URL — é para aqui que o link de confirmação aponta.
async function getSiteUrl() {
  const headersList = await headers()
  const host = headersList.get('x-forwarded-host') || headersList.get('host')
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https'
  const origin = host ? `${protocol}://${host}` : process.env.NEXT_PUBLIC_SITE_URL
  return origin ? origin.replace(/\/$/, '') : 'http://localhost:3000'
}

export async function signup(formData: FormData) {
  const email = normalizeEmail(formData.get('email'))
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  const name = ((formData.get('name') as string) || '').trim()

  // Devolve email + nome para o form não perder o que já foi escrito.
  // Códigos conhecidos (passwordMismatch, emailInUse) são traduzidos no client.
  const registerError = (msg: string) =>
    redirect(`/register?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`)

  if (!password || password !== confirmPassword) {
    registerError('passwordMismatch')
  }

  const siteUrl = await getSiteUrl()
  // welcome=1 diz ao callback para enviar as boas-vindas só DEPOIS de confirmar.
  const redirectTo = `${siteUrl}/auth/callback?next=/dashboard&welcome=1`

  // ── Via com marca própria: cria o user e gera o link, enviado via Resend ──
  if (isEmailEnabled()) {
    const adminAuth = createAdminClient().auth
    const { data: linkData, error } = await adminAuth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: { data: { name }, redirectTo },
    })

    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('already been registered') || msg.includes('already registered')) {
        registerError('emailInUse')
      }
      registerError(translateError(error))
    }

    // Auto-cura: sincroniza já para o Prisma, para o caso de o trigger SQL
    // on_auth_user_created falhar ou atrasar (ver scripts/delete_ghost.ts para
    // limpar utilizadores "fantasma" que ficaram só na Supabase).
    if (linkData?.user) {
      try {
        await prisma.user.create({
          data: {
            id: linkData.user.id,
            email: linkData.user.email!,
            name,
          }
        })
      } catch (dbError) {
        console.error('Falha ao sincronizar utilizador no Prisma:', dbError)
        // Não bloqueamos o processo — se o trigger já criou o registo, isto falha
        // por conflito de chave, o que é esperado e inofensivo.
      }
    }

    // Construímos o link manualmente para forçar o envio do token por Query String (?token_hash=)
    // Se usássemos o action_link gerado pelo Supabase, ele redirecionaria com o token num Hash Fragment (#access_token=)
    // e o Next.js (SSR) não conseguiria ler os dados, gerando o erro "Missing token".
    const confirmationLink = `${siteUrl}/auth/callback?token_hash=${linkData?.properties?.hashed_token}&type=signup&next=/dashboard&welcome=1`
    const sendResult = await sendConfirmationEmail(email, name || 'Investidor', confirmationLink)
    if (sendResult && 'error' in sendResult && sendResult.error) {
      console.error('[Signup] Erro ao enviar email de confirmação via Resend:', sendResult.error)
    }

    if (linkData?.user) await recordServerEvent(await headers(), 'signup', '/register')
    revalidatePath('/', 'layout')
    redirect(`/verify-email?email=${encodeURIComponent(email)}`)
  }

  // ── Fallback (sem Resend, ex.: localhost): email de confirmação do Supabase ──
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: redirectTo },
  })
  if (error) {
    registerError(translateError(error))
  }

  // O Supabase ofusca contas já existentes: devolve um user sem identidades
  // novas (sem erro) para não revelar quem está registado. Tratamos como "já existe".
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    registerError('emailInUse')
  }

  // Auto-cura Prisma (mesma lógica da via com marca).
  if (data.user) {
    try {
      await prisma.user.create({
        data: { id: data.user.id, email: data.user.email!, name }
      })
    } catch {
      // conflito de chave esperado se o trigger já criou o registo
    }
    await recordServerEvent(await headers(), 'signup', '/register')
  }

  // Confirmação de email desligada no projeto → já vem sessão → entra direto.
  if (data.session) {
    await sendWelcomeEmail(email, name || 'Investidor')
    revalidatePath('/', 'layout')
    redirect('/dashboard')
  }

  revalidatePath('/', 'layout')
  redirect(`/verify-email?email=${encodeURIComponent(email)}`)
}

// Reenvia o email de confirmação de registo (via Resend se ativo, senão via Supabase).
export async function resendConfirmation(formData: FormData) {
  const email = normalizeEmail(formData.get('email'))

  if (!email) {
    redirect('/verify-email?error=noEmail')
  }

  const siteUrl = await getSiteUrl()

  if (isEmailEnabled()) {
    const adminAuth = createAdminClient().auth
    const { data: linkData, error } = await adminAuth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=/dashboard&welcome=1`,
      },
    })

    if (error) {
      console.error('[ResendConfirmation] Erro ao gerar link de confirmação:', error)
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('already confirmed') || msg.includes('already been confirmed')) {
        redirect('/login?message=O teu email já se encontra confirmado. Podes entrar.')
      }
      redirect(`/verify-email?email=${encodeURIComponent(email)}&error=${encodeURIComponent(translateError(error))}`)
    }

    const confirmationLink = `${siteUrl}/auth/callback?token_hash=${linkData?.properties?.hashed_token}&type=magiclink&next=/dashboard&welcome=1`
    const sendResult = await sendConfirmationEmail(email, 'Investidor', confirmationLink)
    if (sendResult?.error) {
      console.error('[ResendConfirmation] Erro ao enviar email pelo Resend:', sendResult.error)
      redirect(`/verify-email?email=${encodeURIComponent(email)}&error=${encodeURIComponent(`Erro ao enviar email (${sendResult.error.message})`)}`)
    }

    redirect(`/verify-email?email=${encodeURIComponent(email)}&resent=1`)
  }

  // Fallback: via SMTP configurado no Supabase
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=/dashboard&welcome=1`,
    },
  })

  if (error) {
    redirect(`/verify-email?email=${encodeURIComponent(email)}&error=${encodeURIComponent(translateError(error))}`)
  }

  redirect(`/verify-email?email=${encodeURIComponent(email)}&resent=1`)
}

// Login de desenvolvimento: um clique, SÓ em NODE_ENV=development.
// A conta usa a password FORTE do .env.local (DEV_LOGIN_*) — a BD/auth é
// partilhada com produção, por isso nunca credenciais fracas nem expor
// este fluxo fora de dev. Cria/repara a conta na primeira utilização.
export async function devLogin() {
  const email = process.env.DEV_LOGIN_EMAIL
  const password = process.env.DEV_LOGIN_PASSWORD
  if (process.env.NODE_ENV !== 'development' || !email || !password) {
    redirect('/login')
  }

  const supabase = await createClient()
  const first = await supabase.auth.signInWithPassword({ email, password })

  if (first.error) {
    // Primeira vez (ou password mudou no .env.local): cria/repara via admin.
    const adminAuth = createAdminClient().auth
    const { data: created, error: createError } = await adminAuth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'Dev Local' },
    })

    let userId = created?.user?.id
    if (createError) {
      // Já existe → encontra o id e força a password do .env.local.
      const { data: list } = await adminAuth.admin.listUsers({ perPage: 200 })
      const existing = list?.users?.find((u) => u.email === email)
      if (!existing) {
        redirect(`/login?error=${encodeURIComponent(`Dev login: ${createError.message}`)}`)
      }
      userId = existing!.id
      await adminAuth.admin.updateUserById(userId, { password, email_confirm: true })
    }

    // Auto-cura Prisma (mesmo padrão do signup).
    if (userId) {
      try {
        await prisma.user.create({ data: { id: userId, email, name: 'Dev Local' } })
      } catch {
        // conflito esperado se o trigger já criou o registo
      }
    }

    const retry = await supabase.auth.signInWithPassword({ email, password })
    if (retry.error) {
      redirect(`/login?error=${encodeURIComponent(`Dev login: ${retry.error.message}`)}`)
    }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function forgotPassword(formData: FormData) {
  const email = normalizeEmail(formData.get('email'))

  if (!email) {
    redirect('/forgot-password?error=Introduz um email válido.')
  }

  const siteUrl = await getSiteUrl()

  if (isEmailEnabled()) {
    const adminAuth = createAdminClient().auth
    const { data: linkData, error } = await adminAuth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
      },
    })

    if (error) {
      console.error('[ForgotPassword] Erro ao gerar link de recuperação:', error)
      redirect(`/forgot-password?error=${encodeURIComponent(translateError(error))}`)
    }

    const resetLink = `${siteUrl}/auth/callback?token_hash=${linkData?.properties?.hashed_token}&type=recovery&next=/reset-password`
    const sendResult = await sendPasswordResetEmail(email, resetLink)
    if (sendResult?.error) {
      console.error('[ForgotPassword] Erro ao enviar email pelo Resend:', sendResult.error)
      redirect(`/forgot-password?error=${encodeURIComponent(`Erro ao enviar email (${sendResult.error.message})`)}`)
    }

    redirect('/forgot-password?message=Verifica o teu email para redefinir a password.')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  })

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(translateError(error))}`)
  }

  redirect('/forgot-password?message=Verifica o teu email para redefinir a password.')
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (password !== confirmPassword) {
    redirect(`/reset-password?error=${encodeURIComponent('As passwords não coincidem.')}`)
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(translateError(error))}`)
  }
  redirect('/login?message=Password atualizada com sucesso! Faz login.')
}
