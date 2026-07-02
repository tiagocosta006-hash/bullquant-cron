/**
 * Setup global dos testes: carrega .env.local (o Prisma CLI/Client lê o
 * ambiente do processo; em dev as vars vivem em .env.local — CLAUDE.md §10).
 * Em CI sem .env.local o load falha silenciosamente e os testes que precisam
 * de DATABASE_URL fazem skip.
 */
try {
  process.loadEnvFile(".env.local")
} catch {
  // sem .env.local (ex: CI) — testes de BD fazem skip via skipIf
}
