import { describe, expect, it } from "vitest";
import { createUIMessageStreamResponse } from "ai";
import { analystReplyStream } from "@/lib/ai/chat-response";
import { readAnalystAnswer, type ChatAnswer } from "@/lib/ai/chat-stream";

function result(answer = "Resposta estável.") {
  return {
    partialOutputStream: (async function* () {
      yield { answer: answer.slice(0, 5) };
      yield { answer };
    })(),
    output: Promise.resolve({ answer, citations: [
      { label: "Fonte real", quote: "Revenue was 100." },
      { label: "Não existe", quote: "Invented citation" },
    ], action: { label: "Comparar", destination: "compare" as const } }),
    finishReason: Promise.resolve("stop" as const),
  };
}
const options = { ticker: "MSFT", grounding: "The filing says: Revenue was 100.", onError: () => "Resposta interrompida" };

describe("Structured analyst answer to browser stream", () => {
  it("streams only answer text and adds verified sources/actions without extra model calls", async () => {
    const response = createUIMessageStreamResponse({ stream: analystReplyStream(result(), options) });
    const updates: ChatAnswer[] = [];
    await readAnalystAnswer(response.body!, (a) => updates.push(a));
    expect(updates.some((a) => a.content === "Respo")).toBe(true);
    expect(updates.at(-1)).toEqual({
      content: "Resposta estável.",
      citations: [{ label: "Fonte real", quote: "Revenue was 100." }],
      actions: [{ label: "Comparar", href: "/compare?ticker=MSFT" }],
    });
    expect(updates.every((a) => !a.content.includes('"answer"'))).toBe(true);
  });

  it("keeps the text and reports incomplete generation separately", async () => {
    const incomplete = { ...result(), finishReason: Promise.resolve("length" as const) };
    const response = createUIMessageStreamResponse({ stream: analystReplyStream(incomplete, options) });
    const updates: ChatAnswer[] = [];
    await expect(readAnalystAnswer(response.body!, (a) => updates.push(a))).rejects.toMatchObject({ publicMessage: "Resposta interrompida" });
    expect(updates.at(-1)?.content).toBe("Resposta estável.");
  });

  it("rejects revisions rather than replacing text already shown", async () => {
    const revision = { ...result(), partialOutputStream: (async function* () {
      yield { answer: "Texto original" };
      yield { answer: "Resposta diferente" };
    })() };
    const response = createUIMessageStreamResponse({ stream: analystReplyStream(revision, options) });
    const updates: ChatAnswer[] = [];
    await expect(readAnalystAnswer(response.body!, (a) => updates.push(a))).rejects.toMatchObject({ publicMessage: "Resposta interrompida" });
    expect(updates.at(-1)?.content).toBe("Texto original");
  });
});
