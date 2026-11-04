import { createUIMessageStream, type DeepPartial, type FinishReason } from "ai";
import { z } from "zod";

// Annotations belong to the answer, not to extra model/tool turns.
export const analystReplySchema = z.object({
  answer: z.string().min(1).describe("Resposta final ao utilizador, em texto simples."),
  citations: z.array(z.object({
    label: z.string(),
    quote: z.string().describe("Excerto literal do contexto verificado, sem alterações."),
  })).max(5),
  action: z.object({
    label: z.string(),
    destination: z.enum(["dcf", "compare"]),
  }).nullable(),
});

type Reply = z.infer<typeof analystReplySchema>;
type ReplyStream = {
  partialOutputStream: AsyncIterable<DeepPartial<Reply>>;
  output: PromiseLike<Reply>;
  finishReason: PromiseLike<FinishReason>;
};

export function analystReplyStream(result: ReplyStream, {
  ticker, grounding, onError,
}: { ticker: string; grounding: string; onError: (error: unknown) => string }) {
  return createUIMessageStream({
    onError,
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: "answer" });
      let sent = "";
      const append = (answer: string | undefined) => {
        if (answer == null) return;
        if (!answer.startsWith(sent)) throw new Error("Non-monotonic analyst answer");
        if (answer.length > sent.length) {
          writer.write({ type: "text-delta", id: "answer", delta: answer.slice(sent.length) });
          sent = answer;
        }
      };
      for await (const partial of result.partialOutputStream) append(partial.answer);
      const output = await result.output;
      if (await result.finishReason !== "stop") throw new Error("Incomplete analyst answer");
      append(output.answer);
      writer.write({ type: "text-end", id: "answer" });
      const normalizedSource = grounding.replace(/\s+/g, " ");
      writer.write({ type: "data-analyst", data: {
        citations: output.citations.filter((c) => c.quote.trim() && normalizedSource.includes(c.quote.trim().replace(/\s+/g, " "))),
        actions: output.action ? [{
          label: output.action.label,
          href: `/${output.action.destination}?ticker=${encodeURIComponent(ticker)}`,
        }] : [],
      } });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
}
