import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { createChatAgent, domainStep } = await import("../lib/ai/mastra");
const agent = createChatAgent({ model: "test-model", instructions: "test", tools: {}, skills: [
  { name: "tradeoff", description: "Compare retrieved candidates", body: "Use verified evidence. Ask for the customer's priorities." },
  { name: "legacy_admin_skill", description: "A legacy admin name", body: "Legacy instructions retained." },
] });
assert.equal((await agent.listSkills()).length, 2);
const legacy = (await agent.listSkills()).find(skill => skill.name.startsWith("legacy-admin-skill-"));
assert(legacy);
assert.equal((await agent.getSkill(legacy.name))!.instructions, "Legacy instructions retained.");
assert.match((await agent.getSkill("tradeoff"))!.instructions, /verified evidence/);
assert.equal(await agent.getSkill("missing"), null);
const step = domainStep({ text: "", toolCalls: [{ payload: { toolCallId: "a", toolName: "search_products", args: { table: "lens" } } }], toolResults: [{ payload: { toolCallId: "a", toolName: "search_products", result: { rows: [] } } }] });
assert.deepEqual(step.toolCalls[0].input, { table: "lens" });
assert.deepEqual(step.toolResults[0].output, { rows: [] });
assert.equal(step.toolResults[0].toolName, "search_products");
console.log("PASS Mastra native skill registration/loading and domain event conversion");
