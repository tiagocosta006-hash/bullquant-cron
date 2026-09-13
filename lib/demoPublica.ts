/**
 * As duas listas que decidem o que se vê sem pagar — e sem conta.
 *
 * Vivem num módulo SEM dependências de propósito: o middleware corre em Edge,
 * onde não há Prisma nem o cliente de servidor do Supabase, e tem de poder
 * importar isto. O guarda das rotas de API (lib/api/acessoPro.ts) importa o
 * mesmo, e é isso que garante que a página, o funil e a API não divergem.
 *
 * Foi exactamente a divergência que abriu o conteúdo pago: a lista das sete
 * grandes estava declarada dentro do componente da página, e a API que servia
 * os mesmos dados não tinha regra nenhuma.
 */

/**
 * O único ticker que um anónimo vê por inteiro.
 *
 * É a demo viva do funil de aquisição: o middleware deixa passar /stock/AAPL
 * e /dcf sem sessão, e a calculadora fica trancada a esta empresa. Mudar isto
 * obriga a mudar `isGuestOnlyRoute` em lib/supabase/middleware.ts.
 */
export const TICKER_DEMO = "AAPL";

export function eTickerDemo(ticker: string | null | undefined): boolean {
  return !!ticker && ticker.toUpperCase() === TICKER_DEMO;
}

/**
 * As sete grandes ficam abertas a qualquer conta autenticada — é o que a
 * página de ação mostra a quem ainda não paga, para a plataforma se poder
 * experimentar com empresas que as pessoas reconhecem.
 */
export const MAG_7 = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA"];

export function eMag7(ticker: string | null | undefined): boolean {
  return !!ticker && MAG_7.includes(ticker.toUpperCase());
}
