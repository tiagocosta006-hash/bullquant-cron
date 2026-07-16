// Migração one-shot: itens de portfólio SEM posição (quantity null) eram a
// "watchlist" antiga — passam para a tabela watchlist_items e saem do portfólio.
// Idempotente (skipDuplicates + re-corrível). Correr com:
//   set -a; . ./.env.local; set +a; npx tsx scripts/migrate_watchlist.ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const followOnly = await prisma.portfolioItem.findMany({
    where: { quantity: null },
    include: { portfolio: { select: { userId: true } } },
  })

  if (followOnly.length === 0) {
    console.log('Nada a migrar — não há itens de portfólio sem posição.')
    return
  }

  const created = await prisma.watchlistItem.createMany({
    data: followOnly.map((item) => ({
      userId: item.portfolio.userId,
      companyId: item.companyId,
      addedAt: item.addedAt,
    })),
    skipDuplicates: true,
  })

  const deleted = await prisma.portfolioItem.deleteMany({
    where: { id: { in: followOnly.map((item) => item.id) } },
  })

  console.log(
    `Migrados ${followOnly.length} itens sem posição: ${created.count} criados na watchlist ` +
    `(${followOnly.length - created.count} já existiam), ${deleted.count} removidos do portfólio.`
  )
}

main()
  .catch((e) => {
    console.error('Migração falhou:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
