import {
  getToolName,
  isToolUIPart,
  isDataUIPart,
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from "ai";

export type ChatCitation = { label: string; quote: string };
export type ChatAction = { label: string; href: string };
export type ChatAnswer = { content: string; citations: ChatCitation[]; actions: ChatAction[] };

/** Keep recent turns within the route's context budget, excluding failed replies. */
export function analystHistory(messages: { role: "user" | "assistant"; content: string; error?: string }[]) {
  const history: { role: "user" | "assistant"; content: string }[] = [];
  let chars = 0;
  for (const message of [...messages].reverse()) {
    if (message.error || !message.content.trim()) continue;
    if (history.length >= 39 || chars + message.content.length > 100_000) break;
    history.unshift({ role: message.role, content: message.content });
    chars += message.content.length;
  }
  return history;
}

export class ChatStreamError extends Error {
  constructor(public readonly publicMessage?: string) {
    super("The analyst response did not complete");
  }
}

/** Read the SDK protocol, including split UTF-8/SSE frames and multi-step tools. */
export async function readAnalystAnswer(
  stream: ReadableStream<Uint8Array>,
  onUpdate: (answer: ChatAnswer) => void,
): Promise<void> {
  let finished = false;
  let content = "";
  let failure: ChatStreamError | undefined;
  const chunks = parseJsonEventStream({ stream, schema: uiMessageChunkSchema }).pipeThrough(
    new TransformStream({
      transform(parsed, controller: TransformStreamDefaultController<UIMessageChunk>) {
        if (!parsed.success) {
          failure = new ChatStreamError();
          return;
        }
        const chunk = parsed.value;
        if (chunk.type === "error" || chunk.type === "abort") {
          failure = new ChatStreamError(chunk.type === "error" ? chunk.errorText : undefined);
          return;
        }
        if (failure) return;
        if (chunk.type === "finish") {
          finished = !chunk.finishReason || chunk.finishReason === "stop";
        }
        controller.enqueue(chunk);
      },
    }),
  );

  for await (const message of readUIMessageStream({
    stream: chunks,
    // Drain error frames before rejecting. Cancelling a nested SSE pipe from a
    // transform can otherwise leave an unhandled rejection in the browser.
    onError: () => { failure ??= new ChatStreamError(); },
  })) {
    // A tool step adds parts to the SAME answer. Never clear text already visible.
    content = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n\n");
    const citations = new Map<string, ChatCitation>();
    const actions = new Map<string, ChatAction>();
    for (const part of message.parts) {
      if (isDataUIPart(part) && part.type === "data-analyst" && part.data && typeof part.data === "object") {
        const metadata = part.data as { citations?: ChatCitation[]; actions?: ChatAction[] };
        for (const c of metadata.citations ?? []) {
          if (typeof c.label === "string" && typeof c.quote === "string") citations.set(`${c.label}\0${c.quote}`, c);
        }
        for (const a of metadata.actions ?? []) {
          if (typeof a.label === "string" && typeof a.href === "string" && /^\/(dcf|compare)(\?|$)/.test(a.href)) actions.set(a.href, a);
        }
      }
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      const output = part.output;
      if (!output || typeof output !== "object") continue;
      const value = output as Record<string, unknown>;
      if (typeof value.label !== "string") continue;
      if (getToolName(part) === "cite" && typeof value.quote === "string") {
        citations.set(`${value.label}\0${value.quote}`, { label: value.label, quote: value.quote });
      } else if (getToolName(part) === "suggestAction" && typeof value.href === "string") {
        // Only the platform destinations supported by the prompt become links.
        if (!/^\/(dcf|compare)(\?|$)/.test(value.href)) continue;
        actions.set(value.href, { label: value.label, href: value.href });
      }
    }
    onUpdate({ content, citations: [...citations.values()], actions: [...actions.values()] });
  }
  // A socket closing is not necessarily a successful answer (timeouts, empty tools,
  // token limits). Keep the partial text; let the UI show an interruption separately.
  if (failure) throw failure;
  if (!finished || !content.trim()) throw new ChatStreamError();
}
