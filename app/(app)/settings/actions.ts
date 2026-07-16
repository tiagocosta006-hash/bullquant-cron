"use server"

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { prisma } from '@/lib/prisma'

export async function setLocale(locale: string) {
  const cookieStore = await cookies()
  cookieStore.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  revalidatePath('/', 'layout')
}

export async function updateProfile(formData: FormData) {
  const name = formData.get('name') as string
  if (!name || name.trim().length === 0) return { error: 'O nome não pode estar vazio.' }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return { error: 'Não autorizado.' }
  }

  // Atualizar na Supabase Auth (Metadata)
  const { error: updateError } = await supabase.auth.updateUser({
    data: { name }
  })

  if (updateError) {
    return { error: 'Erro ao atualizar o perfil na base de dados de autenticação.' }
  }

  // Atualizar no Prisma (Tabela users)
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { name }
    })
  } catch (error) {
    return { error: 'Erro ao atualizar o perfil na base de dados principal.' }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function updatePasswordSettings(formData: FormData) {
  const currentPassword = formData.get('currentPassword') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: 'Todos os campos são obrigatórios.' }
  }

  if (newPassword !== confirmPassword) {
    return { error: 'As novas passwords não coincidem.' }
  }

  if (newPassword.length < 6) {
    return { error: 'A nova password tem de ter pelo menos 6 caracteres.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return { error: 'Não autorizado.' }
  }

  // Verificar password atual fazendo um login com a mesma
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (signInError) {
    return { error: 'A palavra-passe atual está incorreta.' }
  }

  // Atualizar para a nova password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    const msg = updateError.message?.toLowerCase() || '';
    if (msg.includes('different from the old password')) {
      return { error: 'A nova password tem de ser diferente da antiga.' }
    }
    if (msg.includes('weak_password')) {
      return { error: 'A password é demasiado fraca. Tenta adicionar números ou símbolos.' }
    }
    return { error: 'Ocorreu um erro ao atualizar a palavra-passe.' }
  }

  return { success: true }
}

export async function updateEmailSettings(formData: FormData) {
  const currentPassword = formData.get('currentPassword') as string
  const newEmail = formData.get('newEmail') as string

  if (!currentPassword || !newEmail) {
    return { error: 'A password e o novo email são obrigatórios.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return { error: 'Não autorizado.' }
  }

  // Verificar password atual fazendo um login com a mesma
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (signInError) {
    return { error: 'A palavra-passe atual está incorreta.' }
  }

  // Pedir alteração de email à Supabase
  const { error: updateError } = await supabase.auth.updateUser({
    email: newEmail,
  })

  if (updateError) {
    const msg = updateError.message?.toLowerCase() || '';
    if (msg.includes('already registered')) {
      return { error: 'Este email já está registado noutra conta.' }
    }
    return { error: 'Ocorreu um erro ao atualizar o email. Verifica se o email é válido.' }
  }

  return { success: true }
}

// Beta: alterna FREE↔PRO sem pagamento, para testes durante o período beta.
// Kill-switch para o lançamento: definir BETA_PLAN_TOGGLE=0 no ambiente.
export async function togglePlanBeta() {
  if (process.env.BETA_PLAN_TOGGLE === '0') {
    return { error: 'notAvailable' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'notAuthorized' }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { plan: true },
  })

  if (!dbUser) {
    return { error: 'notAuthorized' }
  }

  const newPlan = dbUser.plan === 'PRO' ? 'FREE' : 'PRO'
  await prisma.user.update({
    where: { id: user.id },
    data: { plan: newPlan },
  })

  revalidatePath('/', 'layout')
  return { success: true, plan: newPlan }
}
export async function deleteAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado.' }
  }

  const adminAuth = createAdminClient().auth

  // Delete from Prisma first just in case there's no cascade
  try {
    await prisma.user.delete({
      where: { id: user.id }
    })
  } catch (error) {
    console.error("Error deleting user from Prisma:", error)
  }

  const { error: deleteError } = await adminAuth.admin.deleteUser(user.id)

  if (deleteError) {
    console.error("Error deleting user from Supabase Auth:", deleteError)
    return { error: 'Ocorreu um erro ao apagar a conta.' }
  }

  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
