"use server"

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuthError } from '@supabase/supabase-js'
import { sendWelcomeEmail, sendPasswordResetEmail } from '@/lib/resend'

// Função auxiliar para traduzir erros do Supabase para Português
function translateError(error: AuthError | { message?: string }) {
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('invalid login credentials')) return 'Email ou password incorretos.';
  if (msg.includes('user already registered')) return 'Este email já se encontra registado.';
  if (msg.includes('password should be at least')) return 'A password deve ter pelo menos 6 caracteres.';
  if (msg.includes('different from the old password')) return 'A nova password tem de ser diferente da antiga.';
  if (msg.includes('weak_password')) return 'A password é demasiado fraca. Tenta adicionar números ou símbolos.';
  if (msg.includes('invalid email')) return 'O formato do email não é válido.';
  if (msg.includes('rate limit')) return 'Muitas tentativas. Por favor, aguarda um pouco e tenta novamente.';
  if (msg.includes('email link is invalid or has expired')) return 'O link expirou ou é inválido. Pede um novo link.';
  
  // Em vez de "erro inesperado" que soa a plataforma instável:
  return 'Não foi possível concluir o pedido. Verifica os teus dados e tenta novamente.';
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
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: { data: { name: formData.get('name') as string } }
  }

  const { error } = await supabase.auth.signUp(data)
  if (error) {
    redirect(`/register?error=${encodeURIComponent(translateError(error))}`)
  }

  // Enviar email de Boas-Vindas
  await sendWelcomeEmail(data.email, data.options.data.name || 'Investidor')

  revalidatePath('/', 'layout')
  redirect('/login?message=Conta criada com sucesso! Podes fazer login agora.')
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

  if (!origin) {
    console.error('CRITICAL ERROR: NEXT_PUBLIC_SITE_URL is not defined in environment variables.')
    // Podemos fazer fallback para localhost APENAS se estivermos em modo de desenvolvimento (local)
    // Em produção (Vercel), isto força-nos a não esquecer de colocar a variável!
  }

  const siteUrl = origin ? origin.replace(/\/$/, '') : 'http://localhost:3001'

  // Opção A: Gerar o link de recuperação de password via Admin SDK para enviar via Resend
  const adminAuth = createAdminClient().auth
  const { data, error } = await adminAuth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    }
  })

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(translateError(error))}`)
  }

  // Enviar email com link seguro
  if (data?.properties?.hashed_token) {
    const customLink = `${siteUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery&next=/reset-password`
    await sendPasswordResetEmail(email, customLink)
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
