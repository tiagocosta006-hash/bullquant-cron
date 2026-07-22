import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server'

import { prisma } from '@/lib/prisma'
import { SettingsClient } from '@/components/settings/SettingsClient'
import { cookies } from 'next/headers'
import { getCreditsStatus } from '@/lib/ai/credits'


export default async function SettingsPage() {
  const authUser = await getUser()

  if (!authUser) {
    redirect('/login')
  }

  // Obter o utilizador da base de dados principal para termos o nome atualizado e o plano
  let dbUser = await prisma.user.findUnique({
    where: { id: authUser.id }
  })

  // Self-Healing: Se o utilizador estiver logado na Supabase mas faltar na BD Prisma
  // (ex: conta antiga fantasma criada antes da correção), criamos agora para não bugar:
  if (!dbUser) {
    try {
      dbUser = await prisma.user.create({
        data: {
          id: authUser.id,
          email: authUser.email!,
          name: authUser.user_metadata?.name || 'Utilizador',
        }
      })
    } catch (e: any) {
      // Se der erro porque o email já existe (P2002), significa que a conta no Prisma 
      // tem um ID antigo (apagada e recriada na Supabase). Vamos "re-ligar" a conta antiga ao novo ID!
      if (e.code === 'P2002') {
        dbUser = await prisma.user.update({
          where: { email: authUser.email! },
          data: { id: authUser.id }
        })
      } else {
        console.error('Falha na recuperação automática da conta:', e)
        redirect('/login?message=Erro de base de dados. Por favor contacta o suporte.')
      }
    }
  }

  const cookieStore = await cookies()
  const locale = cookieStore.get('NEXT_LOCALE')?.value || 'pt'

  // Créditos de IA de hoje (só gerações reais contam — mesma fonte das rotas de IA)
  const credits = await getCreditsStatus(authUser.id, dbUser.plan)

  const userProp = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    plan: dbUser.plan,
    hasSubscription: !!dbUser.paddleCustomerId,
  }

  return (
    <SettingsClient
      user={userProp}
      locale={locale}
      aiUsedToday={credits.used}
      aiDailyLimit={credits.limit}
      betaEnabled={process.env.BETA_PLAN_TOGGLE !== '0'}
    />
  )
}
