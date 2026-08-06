/**
 * Desbloqueio LOCAL de conteúdo gated (login + plano Pro), para inspecionar
 * gráficos e páginas sem ter de autenticar em cada arranque do dev server.
 *
 * Ativa-se com `DEV_UNLOCK_PRO=true` no `.env.local` (ficheiro ignorado pelo
 * git). O guard de `NODE_ENV` é a rede de segurança: num build de produção a
 * condição é falsa e a função devolve sempre `false`, mesmo que a variável
 * apareça por engano no ambiente. Nunca usar isto para lógica de negócio —
 * serve só para desenvolvimento.
 */
export function isDevUnlocked(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_UNLOCK_PRO === "true"
}
