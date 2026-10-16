import { getLocale } from "next-intl/server"
import { redirect } from "@/i18n/routing"
import { getUser } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { isDevUnlocked } from "@/lib/devAccess"

/**
 * Páginas inteiras só para PRO. Não há plano gratuito: quem tem conta mas não tem subscrição
 * ativa vai para /pricing. (As rotas de API fazem o mesmo em lib/api/acessoPro.ts.)
 * Anónimos não chegam aqui: o middleware já os mandou para /login ou /pricing.
 */
export async function exigirPlanoProNaPagina(): Promise<void> {
  if (isDevUnlocked()) return
  const user = await getUser()
  if (!user) return
  const db = await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true } })
  if (db?.plan === "PRO") return
  redirect({ href: "/pricing", locale: await getLocale() })
}
