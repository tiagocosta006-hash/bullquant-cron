import { describe, expect, it } from "vitest";
import { analystHistory, ChatStreamError, readAnalystAnswer, type ChatAnswer } from "@/lib/ai/chat-stream";

function sse(events: unknown[], crlf = false) {
  const newline = crlf ? "\r\n" : "\n";
  const bytes = new TextEncoder().encode(events.map((e) => `data: ${JSON.stringify(e)}${newline}${newline}`).join("") + `data: [DONE]${newline}${newline}`);
  // Deliberately split frames, JSON and multi-byte Portuguese characters.
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  });
}
const text = (value: string, id = "text") => [
  { type: "text-start", id }, { type: "text-delta", id, delta: value }, { type: "text-end", id },
];
const tool = (id: string, name: string, output: object) => [
  { type: "tool-input-available", toolCallId: id, toolName: name, input: output },
  { type: "tool-output-available", toolCallId: id, output },
];

describe("Analyst chat stream", () => {
  it("bounds long conversations and excludes failed replies from follow-up context", () => {
    const turns = Array.from({ length: 51 }, (_, i) => ({ role: "user" as const, content: `Question ${i}` }));
    expect(analystHistory(turns)).toHaveLength(39);
    expect(analystHistory(turns).at(-1)?.content).toBe("Question 50");
    const large = Array.from({ length: 10 }, () => ({ role: "user" as const, content: "x".repeat(24_000) }));
    expect(analystHistory(large)).toHaveLength(4);
    expect(analystHistory([
      { role: "user", content: "Question" },
      { role: "assistant", content: "Incomplete reply", error: "Interrupted" },
      { role: "user", content: "Follow-up" },
    ])).toEqual([{ role: "user", content: "Question" }, { role: "user", content: "Follow-up" }]);
  });

  it.each([false, true])("keeps the answer across annotation steps and fragmented SSE (CRLF=%s)", async (crlf) => {
    const updates: ChatAnswer[] = [];
    await readAnalystAnswer(sse([
      { type: "start", messageId: "answer" }, { type: "start-step" },
      ...text("A margem é 20%."),
      ...tool("cite1", "cite", { label: "Margem", quote: "margem de 20%" }),
      { type: "finish-step" }, { type: "start-step" },
      ...tool("action", "suggestAction", { label: "Comparar", href: "/compare?ticker=MSFT" }),
      { type: "finish-step" }, { type: "start-step" },
      ...text("O negócio tem receitas recorrentes.", "final"),
      { type: "finish-step" }, { type: "finish", finishReason: "stop" },
    ], crlf), (answer) => updates.push(answer));
    const firstText = updates.findIndex((a) => a.content.length > 0);
    expect(updates.slice(firstText).every((a) => a.content.startsWith("A margem é 20%."))).toBe(true);
    expect(updates.at(-1)).toEqual({
      content: "A margem é 20%.\n\nO negócio tem receitas recorrentes.",
      citations: [{ label: "Margem", quote: "margem de 20%" }],
      actions: [{ label: "Comparar", href: "/compare?ticker=MSFT" }],
    });
  });

  it("keeps partial text when a provider error arrives", async () => {
    const updates: ChatAnswer[] = [];
    await expect(readAnalystAnswer(sse([
      ...text("Resposta já recebida"), { type: "error", errorText: "Serviço indisponível" },
    ]), (a) => updates.push(a))).rejects.toMatchObject({ publicMessage: "Serviço indisponível" });
    expect(updates.at(-1)?.content).toBe("Resposta já recebida");
  });

  it.each([undefined, "length", "tool-calls", "error"])("reports incomplete answers instead of silently succeeding (%s)", async (reason) => {
    const updates: ChatAnswer[] = [];
    await expect(readAnalystAnswer(sse([
      ...text("Resposta parcial"), ...(reason ? [{ type: "finish", finishReason: reason }] : []),
    ]), (a) => updates.push(a))).rejects.toBeInstanceOf(ChatStreamError);
    expect(updates.at(-1)?.content).toBe("Resposta parcial");
  });

  it("rejects empty replies and explicit aborts", async () => {
    for (const event of [{ type: "finish", finishReason: "stop" }, { type: "abort" }]) {
      await expect(readAnalystAnswer(sse([event]), () => {})).rejects.toBeInstanceOf(ChatStreamError);
    }
  });

  it("deduplicates citations/actions and rejects destinations outside supported platform routes", async () => {
    let result: ChatAnswer | undefined;
    await readAnalystAnswer(sse([
      ...text("Resposta"),
      ...tool("c1", "cite", { label: "Fonte", quote: "Citação" }),
      ...tool("c2", "cite", { label: "Fonte", quote: "Citação" }),
      ...tool("a1", "suggestAction", { label: "DCF", href: "/dcf?ticker=MSFT" }),
      ...tool("a2", "suggestAction", { label: "DCF", href: "/dcf?ticker=MSFT" }),
      ...tool("a3", "suggestAction", { label: "Externo", href: "javascript:alert(1)" }),
      ...tool("a4", "suggestAction", { label: "Externo", href: "//example.com" }),
      { type: "finish", finishReason: "stop" },
    ]), (a) => { result = a; });
    expect(result?.citations).toHaveLength(1);
    expect(result?.actions).toEqual([{ label: "DCF", href: "/dcf?ticker=MSFT" }]);
  });

  it("does not silently ignore invalid protocol frames", async () => {
    await expect(readAnalystAnswer(sse([{ type: "text-delta", delta: 123 }]), () => {})).rejects.toBeInstanceOf(ChatStreamError);
  });
});
