import type { Memory } from "@mastra/memory";
import { Agent } from "@mastra/core/agent";
import { TokenLimiterProcessor } from "@mastra/core/processors";
import { createSkill } from "@mastra/core/skills";
import { toAISdkStream } from "@mastra/ai-sdk";
import { tool, type ToolSet, type ModelMessage } from "ai";
import { z } from "zod";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createHash } from "node:crypto";
import { getLanguageModel } from "./providers";
import { recordSkillUse, type Skill } from "../skills";
import { priceMaskTransform, stripThinkingTransform } from "../guardrails";

// Mastra owns the agent loop and native skill discovery. Application policy
// hooks retain catalog grounding, permissions and the editable approval form.
// Each request gets its own agent and immutable admin configuration snapshot.
export function createChatAgent(options: { memory?: Memory; model: string; instructions: string; skills: Skill[]; tools: ToolSet; contextTokenBudget?: number }) {
  // Existing admin names may predate the Agent Skills name convention. Keep
  // their public/config IDs and give Mastra a stable, collision-resistant ID.
  const nativeName = (name: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64 ? name
    : `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "skill"}-${createHash("sha256").update(name).digest("hex").slice(0, 10)}`;
  const agent: Agent = new Agent({
    id: "earthtekniks-assistant",
    name: "EarthTekniks Assistant",
    instructions: options.instructions,
    memory: options.memory,
    inputProcessors: [new TokenLimiterProcessor({ limit: options.contextTokenBudget ?? 24000, trimMode: "contiguous" })],
    model: getLanguageModel(options.model) as LanguageModelV4,
    skills: () => options.skills.map(skill => createSkill({ name: nativeName(skill.name), description: skill.description.slice(0, 1024), instructions: skill.body })),
    // Mastra serializes normalized tool results itself. AI SDK v7's
    // toModelOutput({ output }) callback has a different calling convention
    // from Mastra's compatibility tool builder; do not forward that callback.
    tools: { ...Object.fromEntries(Object.entries(options.tools).map(([name, definition]) => {
      const { toModelOutput: _serializer, ...rest } = definition;
      return [name, rest];
    })), loadSkill: tool({
      description: "Load a registered skill's full instructions before following its workflow.",
      inputSchema: z.object({ name: z.enum(options.skills.map(skill => skill.name) as [string, ...string[]]) }),
      execute: async ({ name }) => {
        const skill = await agent.getSkill(nativeName(name));
        if (!skill) return { error: `Unknown skill: ${name}` };
        await recordSkillUse(name);
        return { name, body: skill.instructions };
      },
    }) } as never,
  });
  return agent;
}

// Mastra step events use payload.args/result; our domain policies use
// input/output. Keep the conversion at this boundary, not in every policy.
export type DomainStep = {
  toolCalls: { toolCallId: string; toolName: string; input: unknown }[];
  toolResults: { toolCallId: string; toolName: string; output: unknown }[];
  text: string; finishReason?: string;
};
export function domainStep(step: any): DomainStep {
  return { ...step,
    toolCalls: (step.toolCalls ?? []).map((call: any) => ({ ...call, ...(call.payload ?? {}), input: call.input ?? call.args ?? call.payload?.args })),
    toolResults: (step.toolResults ?? []).map((result: any) => ({ ...result, ...(result.payload ?? {}), output: result.output ?? result.result ?? result.payload?.result })),
    text: step.text ?? "",
  };
}

export async function streamChatAgent(agent: ReturnType<typeof createChatAgent>, messages: ModelMessage[], options: {
  memory?: { thread: string; resource: string; options: { readOnly: boolean } };
  maxSteps: number; abortSignal: AbortSignal; sendStart: boolean;
  prepareStep: (args: { steps: DomainStep[]; stepNumber: number }) => any;
  onStepEnd: (step: DomainStep) => Promise<void>;
  stopWhen: ((args: { steps: DomainStep[] }) => boolean)[];
  onError: (args: { error: unknown }) => void;
  onClose: () => void;
}) {
  const result = await agent.stream(messages as never, {
    maxSteps: options.maxSteps,
    memory: options.memory,
    abortSignal: options.abortSignal,
    eagerToolExecution: false,
    toolCallConcurrency: 1,
    modelSettings: { maxOutputTokens: 1800 },
    prepareStep: ({ steps, stepNumber, tools }) => {
      const policy = options.prepareStep({ steps: steps.map(domainStep), stepNumber });
      const { instructions, ...settings } = policy;
      if (!settings.toolChoice && settings.activeTools) settings.activeTools = [...new Set([
        ...settings.activeTools, ...["skill", "skill_read", "skill_search"].filter(name => tools && name in tools),
      ])];
      return { ...settings, ...(instructions ? { systemMessages: [{ role: "system", content: instructions }] } : {}) };
    },
    stopWhen: options.stopWhen.map(stop => ({ steps }: any) => stop({ steps: steps.map(domainStep) })),
    onStepFinish: step => options.onStepEnd(domainStep(step)),
    onFinish: options.onClose,
    onAbort: options.onClose,
    onError: options.onError,
  });
  // Preserve tested public text filters after the official v7 stream adapter.
  const toText = new TransformStream<any, any>({ transform(chunk, controller) {
    controller.enqueue(chunk.type === "text-delta" ? { ...chunk, text: chunk.delta } : chunk);
  } });
  const fromText = new TransformStream<any, any>({ transform(chunk, controller) {
    if (chunk.type === "text-delta") { const { text, ...rest } = chunk; controller.enqueue({ ...rest, delta: text }); }
    else controller.enqueue(chunk);
  } });
  return toAISdkStream(result, { from: "agent", version: "v7", sendStart: options.sendStart, sendReasoning: false })
    .pipeThrough(toText)
    .pipeThrough(stripThinkingTransform()() as never)
    .pipeThrough(priceMaskTransform()() as never)
    .pipeThrough(fromText);
}
