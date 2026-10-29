/**
 * setInterval que só corre com o separador visível.
 *
 * Os preços eram pedidos de minuto a minuto mesmo com o separador escondido:
 * uma página de ação esquecida aberta gerava 1440 invocações por dia na Vercel
 * (cada uma a passar pelo middleware), sem ninguém a olhar para ela. Com o
 * separador escondido não se pede nada; ao voltar, pede-se logo se o último
 * pedido já tem mais de um intervalo.
 *
 * Devolve a função de limpeza, para usar diretamente no return do useEffect.
 */
export function intervaloVisivel(fn: () => void, ms: number): () => void {
  let ultimo = Date.now()
  const correr = () => {
    ultimo = Date.now()
    fn()
  }
  const id = setInterval(() => {
    if (!document.hidden) correr()
  }, ms)
  const aoMudar = () => {
    if (!document.hidden && Date.now() - ultimo >= ms) correr()
  }
  document.addEventListener('visibilitychange', aoMudar)
  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', aoMudar)
  }
}
