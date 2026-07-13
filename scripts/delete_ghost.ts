import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.log("Fornece o email")
    return
  }
  try {
    await prisma.user.delete({
      where: { email }
    })
    console.log(`Utilizador ${email} apagado do Prisma com sucesso.`)
  } catch (e) {
    console.log(`Erro ao apagar:`, e)
  }
}
main()
