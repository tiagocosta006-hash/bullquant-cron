import { describe, it, expect } from "vitest";
import { AI_ACTION_COSTS, PLAN_DAILY_CREDITS } from "@/lib/ai/credits";
import { RPD_UTILIZADORES, RESERVA } from "@/lib/ai/orcamento";
import pt from "@/messages/pt.json";
import en from "@/messages/en.json";

/**
 * O que a página de preços promete tem de caber no que o Gemini deixa passar.
 * Estes testes existem porque os dois números viviam em sítios diferentes —
 * o limite no código, a promessa no i18n — e andaram meses dessincronizados:
 * prometia-se 20 créditos/dia quando o project inteiro tem 20 PEDIDOS/dia.
 */
describe("créditos prometidos vs orçamento real do Gemini", () => {
  const utilizaveis = RPD_UTILIZADORES - RESERVA;

  it("o pior caso de um PRO não esgota sozinho o orçamento do dia", () => {
    // Pior caso = tudo gasto na ação mais barata, que é a que rende mais
    // pedidos por crédito.
    const maisBarata = Math.min(...Object.values(AI_ACTION_COSTS));
    const pedidosMaxPro = Math.floor(PLAN_DAILY_CREDITS.PRO / maisBarata);
    expect(pedidosMaxPro).toBeLessThan(utilizaveis);
  });

  it("o plano gratuito chega para a análise completa que a página promete", () => {
    // A copy diz "uma análise completa do Analista" — se os créditos do FREE
    // descerem abaixo do custo de `analyst_report`, a promessa passa a ser
    // falsa e este teste falha antes de chegar a produção.
    expect(PLAN_DAILY_CREDITS.FREE).toBeGreaterThanOrEqual(
      AI_ACTION_COSTS.analyst_report,
    );
  });

  it("o plano Pro chega para uma conversa com o analista", () => {
    // O chat é a única ação que não tem cache: cada mensagem é um pedido novo.
    expect(PLAN_DAILY_CREDITS.PRO).toBeGreaterThanOrEqual(
      AI_ACTION_COSTS.analyst_chat,
    );
  });

  it("a página de preços anuncia os números que o código impõe", () => {
    const numeros = (texto: string) => (texto.match(/\d+/g) ?? []).map(Number);

    expect(numeros(pt.marketing.pricing.free.f4)).toContain(PLAN_DAILY_CREDITS.FREE);
    expect(numeros(pt.marketing.pricing.pro.f2)).toContain(PLAN_DAILY_CREDITS.PRO);
    expect(numeros(en.marketing.pricing.free.f4)).toContain(PLAN_DAILY_CREDITS.FREE);
    expect(numeros(en.marketing.pricing.pro.f2)).toContain(PLAN_DAILY_CREDITS.PRO);
  });

  it("a FAQ anuncia os mesmos números que a tabela de preços", () => {
    for (const faq of [pt.marketing.faq.a1, en.marketing.faq.a1]) {
      expect(faq).toContain(String(PLAN_DAILY_CREDITS.FREE));
      expect(faq).toContain(String(PLAN_DAILY_CREDITS.PRO));
    }
  });
});
