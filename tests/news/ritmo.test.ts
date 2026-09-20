import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * O `comRitmo` guarda estado no módulo (a última chamada e a fila), por isso
 * cada teste importa uma instância fresca via `resetModules`.
 */
async function carregarRitmo(intervaloMs: number) {
  vi.resetModules();
  process.env.NEWS_GEMINI_INTERVALO_MS = String(intervaloMs);
  return import("@/lib/news/ritmo");
}

describe("comRitmo — espaçamento entre chamadas ao Gemini", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    delete process.env.NEWS_GEMINI_INTERVALO_MS;
  });

  it("deixa a primeira chamada passar de imediato", async () => {
    const { comRitmo } = await carregarRitmo(50);
    const inicio = Date.now();
    await comRitmo(async () => "ok");
    expect(Date.now() - inicio).toBeLessThan(40);
  });

  it("espaça chamadas seguidas pelo intervalo configurado", async () => {
    const { comRitmo } = await carregarRitmo(60);
    const carimbos: number[] = [];
    const marcar = async () => {
      carimbos.push(Date.now());
      return null;
    };

    await comRitmo(marcar);
    await comRitmo(marcar);

    expect(carimbos[1] - carimbos[0]).toBeGreaterThanOrEqual(55);
  });

  it("serializa chamadas concorrentes em vez de as deixar sair juntas", async () => {
    const { comRitmo } = await carregarRitmo(60);
    const carimbos: number[] = [];
    const marcar = async () => {
      carimbos.push(Date.now());
      return null;
    };

    // É este o caso real: o ingestor dispara os artigos em rajada.
    await Promise.all([comRitmo(marcar), comRitmo(marcar), comRitmo(marcar)]);

    expect(carimbos).toHaveLength(3);
    expect(carimbos[1] - carimbos[0]).toBeGreaterThanOrEqual(55);
    expect(carimbos[2] - carimbos[1]).toBeGreaterThanOrEqual(55);
  });

  it("uma chamada falhada não parte a fila para as seguintes", async () => {
    const { comRitmo } = await carregarRitmo(30);

    await expect(
      comRitmo(async () => {
        throw new Error("429 do Google");
      }),
    ).rejects.toThrow("429 do Google");

    // Sem o catch na fila, esta rejeitava por arrasto.
    await expect(comRitmo(async () => "sobrevivi")).resolves.toBe("sobrevivi");
  });
});

describe("eQuotaExcedida", () => {
  it("reconhece a mensagem real do Google", async () => {
    const { eQuotaExcedida } = await carregarRitmo(10);
    const real = new Error(
      "You exceeded your current quota, please check your plan and billing details. " +
        "* Quota exceeded for metric: generativelanguage.googleapis.com/" +
        "generate_content_free_tier_requests, limit: 5",
    );
    expect(eQuotaExcedida(real)).toBe(true);
  });

  it("não confunde com a sobrecarga temporária do modelo", async () => {
    const { eQuotaExcedida } = await carregarRitmo(10);
    // Esta é transitória e vale a pena voltar a tentar mais tarde — não deve
    // interromper a corrida toda como a quota faz.
    const sobrecarga = new Error("This model is currently experiencing high demand.");
    expect(eQuotaExcedida(sobrecarga)).toBe(false);
  });
});
