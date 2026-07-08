"use server"

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
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
