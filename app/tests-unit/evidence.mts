import assert from "node:assert/strict";
import { catalogAnswer, EvidenceRegistry } from "../lib/ai/evidence";

const registry = new EvidenceRegistry();
assert.equal(registry.add("describe_table", {}, { columns: ["model_name"] }).length, 0);
assert.equal(registry.add("search_knowledge_base", {}, { confident: false, results: [{ doc_id: "unsupported", snippet: "Uncertain" }] }).length, 0);
assert.equal(registry.add("get_product", {}, { error: "Database unavailable" }).length, 0);
const row = { model_name: "FA1602D", focus_length_mm: 16, sensor_size_raw: '2/3"', list_price: 100 };
const sources = registry.add("search_products", { table: "fa_lenses" }, { rows: [row] });
assert.equal(sources[0].id, "S1");
assert(sources[0].text.includes("16"));
assert(!sources[0].text.includes("price"));
assert.equal(registry.add("search_products", { table: "fa_lenses" }, { rows: [row] })[0].id, "S1");
assert.equal(registry.sources.length, 1, "same evidence is deduplicated");
const restored = new EvidenceRegistry([...sources, ...sources, ...sources]);
assert.equal(restored.sources.length, 1, "repeated history snapshots do not duplicate citation IDs");
assert.equal(restored.add("search_products", { table: "fa_lenses" }, { rows: [{ ...row, model_name: "FA1610A" }] })[0].id, "S2");
const answer = catalogAnswer(sources);
assert(answer.includes("FA1602D") && answer.includes("[S1]") && answer.includes('2/3"'));
assert(!/barrel|pincushion|modulation transfer/.test(answer), "no invented optical interpretation");
const calc = registry.add("calculate", { formula_id: "focal_length", args: { sensor_size_mm: 8.8 } }, { focal_length_mm: 24.3, valid: true });
assert(calc[0].text.includes("24.3") && calc[0].text.includes("8.8"));
assert.equal(registry.add("calculate", {}, { valid: false }).length, 0);

// MCP's default serializer expects the original content envelope. Once we
// normalize output, replace that serializer so the model sees actual rows.
const wrapped = registry.wrap({ search_products: {
  inputSchema: {} as never,
  execute: async () => ({ content: [{ type: "text", text: JSON.stringify({ rows: [row] }) }] }),
  toModelOutput: () => ({ type: "text", value: "wrong MCP envelope" }),
} });
const output = await wrapped.search_products.execute!({ table: "fa_lenses" } as never, {} as never);
const model = await wrapped.search_products.toModelOutput!({ output, toolCallId: "test", input: {} } as never);
assert.equal(model.type, "json");
assert(JSON.stringify(model).includes("FA1602D"));
assert(JSON.stringify(model).includes("sourceReferences"));
console.log("Evidence checks passed: successful facts only, stable citations, model receives normalized tool results");
