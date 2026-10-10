import assert from "node:assert/strict";
import { stripThinkingTransform } from "../lib/guardrails";
async function run(parts: string[]) {
  const transform = stripThinkingTransform()();
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  const write = (async () => {
    for (const text of parts) await writer.write({ type: "text-delta", id: "a", text });
    await writer.write({ type: "text-end", id: "a" });
    await writer.close();
  })();
  const output: string[] = [];
  for (;;) { const next = await reader.read(); if (next.done) break; if (next.value.type === "text-delta") output.push(next.value.text!); }
  await write;
  return output.join("");
}
assert.equal(await run(["<thi", "nk>Private analysis", "</think>", "Customer answer"]), "Customer answer");
assert.equal(await run(["Here's a thinking process: private analysis"]), "");
assert.equal(await run(["Short answer"]), "Short answer");
assert.equal(await run(["<tool_call><function=search_products>private args</function></tool_call>"]), "");
assert.equal(await run(['[{"name":"proposeCalculation","parameters":{"formula_id":"focal_length"}}]']), "");
assert.equal(await run(["Thought for 6 seconds\nPrivate analysis\nThus answer: Done"]), "Done");
const transform = stripThinkingTransform()();
const writer = transform.writable.getWriter();
const reader = transform.readable.getReader();
const text = "Normal customer-facing answer ".repeat(4);
const pending = writer.write({ type: "text-delta", id: "a", text });
assert.equal((await reader.read()).value?.text, text, "normal output is emitted before text-end");
await pending;
const closing = writer.close();
await reader.read();
await closing;
console.log("Thinking privacy and streaming checks passed");
