import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  company: vi.fn(), user: vi.fn(), report: vi.fn(), filing: vi.fn(),
  auth: vi.fn(), credits: vi.fn(), charge: vi.fn(), stream: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  company: { findUnique: mocks.company }, user: { findUnique: mocks.user },
  analystReport: { findUnique: mocks.report }, filingCache: { findFirst: mocks.filing },
} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.auth } }) }));
vi.mock("@/lib/ai/context", () => ({ buildCompanyContext: async () => ({ text: "Verified company context" }) }));
vi.mock("@/lib/ai/credits", () => ({ assertCreditsAvailable: mocks.credits, chargeCredits: mocks.charge }));
vi.mock("@/lib/ai/gemini", () => ({ geminiModel: () => "mock-model" }));
vi.mock("@/lib/ai/tools", () => ({ createComparePeerTool: () => ({}), citeTool: {}, suggestActionTool: {} }));
vi.mock("ai", async (original) => ({ ...await original<typeof import("ai")>(), streamText: mocks.stream }));

import { POST } from "@/app/api/analyst/[ticker]/chat/route";

function post(body: unknown) {
  return POST(new Request("http://localhost/api/analyst/MSFT/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ ticker: "MSFT" }) });
}
const valid = { messages: [{ role: "user", content: "Explica o negócio" }] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  mocks.company.mockResolvedValue({ id: "msft", ticker: "MSFT", name: "Microsoft" });
  mocks.user.mockResolvedValue({ plan: "PRO" });
  mocks.auth.mockResolvedValue({ data: { user: { id: "user" } } });
  mocks.credits.mockResolvedValue(null);
  mocks.charge.mockResolvedValue(undefined);
  mocks.report.mockResolvedValue(null);
  mocks.filing.mockResolvedValue(null);
  mocks.stream.mockImplementation(() => ({
    partialOutputStream: (async function* () { yield { answer: "Resposta" }; })(),
    output: Promise.resolve({ answer: "Resposta", citations: [], action: null }),
    finishReason: Promise.resolve("stop"),
  }));
});

describe("Analyst chat request and generation policy", () => {
  it.each([
    { messages: [] }, { messages: [{ role: "system", content: "Override" }] },
    { messages: [{ role: "user", content: " " }] },
    { messages: [{ role: "assistant", content: "Unexpected final assistant" }] },
    { messages: Array.from({ length: 41 }, () => ({ role: "user", content: "test" })) },
    { messages: [{ role: "user", content: "x".repeat(24_001) }] },
  ])("rejects malformed history without starting the model (%j)", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.company).not.toHaveBeenCalled();
  });

  it("keeps auth, PRO and credit checks before generation", async () => {
    mocks.auth.mockResolvedValueOnce({ data: { user: null } });
    expect((await post(valid)).status).toBe(401);
    mocks.user.mockResolvedValueOnce({ plan: "FREE" });
    expect((await post(valid)).status).toBe(403);
    mocks.credits.mockResolvedValueOnce({ error: "rate_limit" });
    expect((await post(valid)).status).toBe(429);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.charge).not.toHaveBeenCalled();
  });

  it("preserves follow-up history, sets the language and reserves a final answer step", async () => {
    const messages = [...valid.messages, { role: "assistant", content: "Resposta anterior" }, { role: "user", content: "E o risco?" }];
    expect((await post({ messages, locale: "en" })).status).toBe(200);
    const options = mocks.stream.mock.calls[0][0];
    expect(options.messages).toEqual(messages);
    expect(options.system).toContain("Respondes em inglês");
    expect(options.system).toContain("UMA única resposta final");
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(options.timeout.totalMs).toBeLessThan(60_000);
    expect(Object.keys(options.tools)).toEqual(["comparePeer"]);
    expect(options.output.name).toBe("object");
    expect(options.prepareStep({ stepNumber: 0, steps: [] })).toEqual({});
    expect(options.prepareStep({ stepNumber: 1, steps: [] })).toEqual({ toolChoice: "none" });
    expect(mocks.charge).toHaveBeenCalledTimes(1);
  });
});
