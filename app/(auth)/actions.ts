"use server"

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuthError } from '@supabase/supabase-js'
import { sendPasswordResetEmail } from '@/lib/resend'
import { prisma } from '@/lib/prisma'

function translateError(error: AuthError | { message?: string }) {
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('invalid login credentials')) return 'Email ou password incorretos.';
  if (msg.includes('email not confirmed')) return 'Precisas de confirmar o teu email antes de entrar. Verifica a tua caixa de entrada (e a pasta de spam).';
  if (msg.includes('user already registered')) return 'Este email já se encontra registado.';
  if (msg.includes('password should be at least')) return 'A password deve ter pelo menos 6 caracteres.';
  if (msg.includes('different from the old password')) return 'A nova password tem de ser diferente da antiga.';
  if (msg.includes('weak_password')) return 'A password é demasiado fraca. Tenta adicionar números ou símbolos.';
  if (msg.includes('invalid email')) return 'O formato do email não é válido.';
  if (msg.includes('rate limit') || msg.includes('too many requests')) return 'Fizeste demasiadas tentativas seguidas. Aguarda uns minutos e tenta de novo.';
  if (msg.includes('email link is invalid or has expired')) return 'O link expirou ou é inválido. Pede um novo link.';
  
  // Em vez de "erro inesperado" que soa a plataforma instável, mas também não escondendo totalmente o erro técnico.
  return `Não foi possível concluir o pedido (${error.message || 'Desconhecido'}). Verifica os dados e tenta novamente.`;
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)
  if (error) {
    redirect(`/login?error=${encodeURIComponent(translateError(error))}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()
  const payload = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: { data: { name: formData.get('name') as string } }
  }

  const { data: authData, error } = await supabase.auth.signUp(payload)
  if (error) {
    redirect(`/register?error=${encodeURIComponent(translateError(error))}`)
  }

  // A Supabase devolve sucesso falso (com identities vazio) se o email já existir, 
  // para proteger contra Enumeração de Emails. Temos de intercetar isto manualmente:
  if (authData?.user && authData.user.identities && authData.user.identities.length === 0) {
    redirect(`/register?error=${encodeURIComponent('Este email já se encontra registado.')}`)
  }

  // Sincronizar o utilizador para o Prisma imediatamente
  if (authData?.user) {
    try {
      await prisma.user.create({
        data: {
          id: authData.user.id, // O ID no Prisma irá coincidir exatamente com o UUID da Supabase
          email: authData.user.email!,
          name: payload.options.data.name,
        }
      })
    } catch (dbError) {
      console.error('Falha ao sincronizar utilizador no Prisma:', dbError)
      // Não bloqueamos o processo caso o utilizador já exista na BD,
      // mas garantimos que fica registado se for um novo utilizador puro.
    }
  }

  // Nota: Removemos o envio do email de Boas-Vindas prematuro.
  // Como o utilizador ainda tem de confirmar o email, receberia dois emails em simultâneo.

  revalidatePath('/', 'layout')
  redirect('/login?message=Conta criada com sucesso! Verifica o teu email para a ativar.')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function forgotPassword(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const origin = process.env.NEXT_PUBLIC_SITE_URL

  if (!origin && process.env.NODE_ENV === 'production') {
    console.error('CRITICAL ERROR: NEXT_PUBLIC_SITE_URL is not defined in production.')
    redirect('/forgot-password?error=Erro de configuração do servidor. Contacte o suporte.')
  }

  const siteUrl = origin ? origin.replace(/\/$/, '') : 'http://localhost:3000'

  // Pedir à Supabase para gerir o envio do email de recuperação (usando o SMTP do Resend que configuraste)
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
