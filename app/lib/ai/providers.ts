import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { captureForTests } from "../test-capture";
import { type Decision, decide } from "./mock-agent";
import { DEFAULT_CHAT_MODEL } from "./models";

// LLM_PROVIDER=mock → deterministic model for dev/tests; otherwise any
// OpenAI-compatible endpoint (NVIDIA by default).
const useMock = process.env.LLM_PROVIDER === "mock";

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 10, total: 10 },
  outputTokens: { reasoning: 0, text: 20, total: 20 },
};

function mockModel() {
  const stream = (d: Decision) =>
    new ReadableStream({
      start(c) {
        c.enqueue({ type: "stream-start", warnings: [] });
        if (d.kind === "text") {
          c.enqueue({ id: "t", type: "text-start" });
          for (const w of d.text.split(/(?<= )/)) {
            c.enqueue({ delta: w, id: "t", type: "text-delta" });
          }
          c.enqueue({ id: "t", type: "text-end" });
        } else {
          c.enqueue({
            input: JSON.stringify(d.input),
            toolCallId: `call-${Math.random().toString(36).slice(2)}`,
            toolName: d.name,
            type: "tool-call",
          });
        }
        c.enqueue({
          finishReason: d.kind === "text" ? { raw: "stop", unified: "stop" } : { raw: "tool_calls", unified: "tool-calls" },
          type: "finish",
          usage,
        });
        c.close();
      },
    });
  const pick = (o: { prompt: unknown; tools?: { name: string }[] }): Decision => {
    captureForTests("llm", o.prompt);
    if (JSON.stringify(o.prompt).toLowerCase().includes("chat title")) {
      return { kind: "text", text: "Mock conversation" };
    }
    return decide(o.prompt as never, (o.tools ?? []).map((t) => t.name));
  };
  return new MockLanguageModelV4({
    doGenerate: async (o) => {
      const d = pick(o as never);
      return {
        content: d.kind === "text" ? [{ text: d.text, type: "text" }] : [{ input: JSON.stringify(d.input), toolCallId: "c1", toolName: d.name, type: "tool-call" }],
        finishReason: d.kind === "text" ? { raw: "stop", unified: "stop" } : { raw: "tool_calls", unified: "tool-calls" },
        usage,
        warnings: [],
      } as never;
    },
    doStream: async (o) => ({ stream: stream(pick(o as never)) }) as never,
  });
}

const nvidia = createOpenAICompatible({
  apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
  baseURL:
    process.env.OPENAI_COMPATIBLE_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
  name: "nvidia",
  transformRequestBody: (body) => ({
    ...body,
    // NVIDIA requires content even on an assistant message containing only
    // tool calls. Mastra correctly preserves these messages without text.
    ...(Array.isArray(body.messages) ? { messages: body.messages.map((message: any) =>
      message.role === "assistant" && message.content == null ? { ...message, content: "" } : message) } : {}),
    ...(body.tools ? { parallel_tool_calls: false } : {}),
    ...(String(body.model).includes("nemotron")
      ? { chat_template_kwargs: { enable_thinking: false } }
      : {}),
  }),
});

// ponytail: cast because @ai-sdk/openai-compatible bundles a newer @ai-sdk/provider; drop when pinned together.
export function getLanguageModel(
  modelId: string = DEFAULT_CHAT_MODEL
): LanguageModel {
  return (useMock ? mockModel() : nvidia.chatModel(modelId)) as LanguageModel;
}

export function getTitleModel(modelId?: string): LanguageModel {
  return getLanguageModel(modelId);
}
