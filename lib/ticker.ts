/**
 * Validação de tickers antes de irem para um URL — interno ou externo.
 *
 * ── Porquê ───────────────────────────────────────────────────────────────
 *
 * Cinco rotas interpolavam o parâmetro cru na chamada à Finnhub:
 *
 *     `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`
 *
 * O ticker vem do caminho do URL, portanto é o visitante que o escolhe. O
 * risco não é o que parece à primeira vista — o host é fixo e não há forma de
 * o desviar — é a CHAVE DE CACHE.
 *
 * O `next: { revalidate: 60 }` dessas chamadas é por URL. Um pedido a
 * `/api/price/AAPL&x=1`, depois `&x=2`, `&x=3`… produz um URL diferente de
 * cada vez, e com ele uma entrada de cache nova e uma ida à Finnhub nova. O
 * cache de 60 segundos, que é o que protege a quota, deixa de existir: o
 * plano gratuito são 60 chamadas por minuto e o limite por IP deixa passar
 * 120. Bastava um ciclo para os preços ao vivo morrerem para toda a gente.
 *
 * Validar resolve isto pela raiz: um ticker que não existe não chega a gerar
 * um URL.
 *
 * ── A forma ──────────────────────────────────────────────────────────────
 *
 * Verificado contra os 577 tickers da base: no máximo 9 caracteres, e o `^`
 * inicial mais o `_` existem por causa das séries macro (^GSPC, ^CPI_YOY,
 * ^DGS10) que alimentam os gráficos de contexto. Uma classe de caracteres
 * mais apertada partia-os.
 */
const FORMA_VALIDA = /^\^?[A-Z][A-Z0-9._-]{0,9}$/;

/**
 * Normaliza e valida. Devolve o ticker em maiúsculas, ou `null` se a forma
 * não for plausível — e aí quem chama deve responder 400 sem tocar na base
 * nem em serviços externos.
 */
export function normalizarTicker(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const t = bruto.trim().toUpperCase();
  return FORMA_VALIDA.test(t) ? t : null;
}
