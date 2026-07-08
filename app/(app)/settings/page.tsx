import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { SettingsClient } from '@/components/settings/SettingsClient'
import { cookies } from 'next/headers'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/login')
  }

  // Obter o utilizador da base de dados principal para termos o nome atualizado e o plano
  const dbUser = await prisma.user.findUnique({
    where: { id: authUser.id }
  })

  if (!dbUser) {
    redirect('/login')
  }

  const cookieStore = await cookies()
  const locale = cookieStore.get('NEXT_LOCALE')?.value || 'pt'

  const userProp = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    plan: dbUser.plan,
  }

  return <SettingsClient user={userProp} locale={locale} />
}
