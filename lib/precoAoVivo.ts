/**
 * Preço atual, pedido UMA vez por ticker — não uma vez por componente.
 *
 * O StockHeader e o StockSnapshot mostram ambos o preço da mesma empresa, e
 * cada um tinha o seu setInterval de 60 s a chamar /api/price/[ticker]. Dois
 * componentes na mesma página a pedir exactamente o mesmo número: cada
 * visitante gerava o dobro das invocações necessárias, e numa sessão de dez
 * minutos eram vinte em vez de dez.
 *
 * O `s-maxage=30` do endpoint não resolvia nada: com um intervalo de 60 s, a
 * cache do CDN já tinha expirado sempre que o pedido chegava.
 *
 * Aqui há duas defesas:
 *
 *   1. Resultado guardado por ticker durante 50 s. Abaixo do intervalo de
 *      60 s de propósito — o preço continua a atualizar-se a cada minuto,
 *      apenas deixa de ser pedido duas vezes.
 *
 *   2. Pedidos simultâneos partilham a MESMA promessa. Sem isto, os dois
 *      componentes a montar ao mesmo tempo disparavam dois pedidos antes de
 *      qualquer um deles ter resposta para guardar.
 */

type Preco = { currentPrice: number | null; change?: number; changePercent?: number }

const TTL_MS = 50_000

const guardado = new Map<string, { em: number; valor: Preco }>()
const emCurso = new Map<string, Promise<Preco | null>>()

export async function obterPrecoAoVivo(ticker: string): Promise<Preco | null> {
  const agora = Date.now()

  const hit = guardado.get(ticker)
  if (hit && agora - hit.em < TTL_MS) return hit.valor

  const jaAPedir = emCurso.get(ticker)
  if (jaAPedir) return jaAPedir

  const pedido = (async () => {
    try {
      const res = await fetch(`/api/price/${ticker}`)
      if (!res.ok) return null
      const valor = (await res.json()) as Preco
      guardado.set(ticker, { em: Date.now(), valor })
      return valor
    } catch {
      // Uma falha não fica em cache: à próxima tenta outra vez.
      return null
    } finally {
      emCurso.delete(ticker)
    }
  })()

  emCurso.set(ticker, pedido)
  return pedido
}
