import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const base = process.env.BASE ?? "http://localhost:3100";
const login = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
const id = randomUUID();
async function send(parts) {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { cookie, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id, message: { id: randomUUID(), role: "user", parts }, selectedChatModel: process.env.OPENAI_COMPATIBLE_MODEL, selectedVisibilityType: "private" }), signal: AbortSignal.timeout(150000) });
  assert.equal(response.status, 200);
  const events = (await response.text()).split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  assert.equal(events.filter(e => e.type === "start").length, 1, "one response start; no duplicated progress messages");
  assert(!events.some(e => e.type === "error"));
  console.log(events.filter(e => e.type === "tool-input-available").map(e => e.toolName));
  console.log(events.filter(e => e.type === "text-delta").map(e => e.delta).join(""));
  return events;
}
const initial = await send([{ type: "text", text: "How do I calculate working distance?" }]);
assert(!initial.some(e => e.toolName === "calculate"));
const followup = await send([{ type: "text", text: "100mm , 20mm , 30mm" }]);
const proposal = followup.find(e => e.type === "tool-output-available" && e.output?.prefill && !e.output.error);
assert(proposal, "ordered follow-up must produce an approval form");
assert.deepEqual(proposal.output.prefill, { object_size_mm: 100, sensor_size_mm: 20, focal_length_mm: 30 });
assert(!followup.some(e => e.toolName === "calculate"), "must wait for approval");
assert(!followup.some(e => e.type === "text-delta" && /(?:result|working distance.*=|6\s*mm)/i.test(e.delta)), "no free-form numeric result before approval");
console.log("PASS working distance ordered reply produces grounded approval form");

const approved = await send([{ type: "data-calculationDecision", data: { proposalId: proposal.toolCallId, action: "approve", args: proposal.output.prefill } }]);
assert(approved.some(event => event.toolName === "calculate"));
const catalog = await send([{ type: "text", text: "now find suitable lens for this" }]);
assert(!catalog.some(event => ["calculate", "search_calculator", "get_calculator", "proposeCalculation"].includes(event.toolName)), "catalog follow-up must not restart calculation");
assert(catalog.some(event => event.toolName === "search_products"), "catalog follow-up must search actual catalog");
assert(!catalog.some(event => event.type === "text-delta" && /M12|explicitly prefers/i.test(event.delta)), "must not invent M12 preference");
console.log("PASS approval-to-catalog handoff without repeated calculation or invented mount");

const audit = await fetch(`${base}/api/admin/conversations/${id}`, { headers: { cookie } });
assert.equal(audit.status, 200);
const detail = await audit.json();
assert.equal(detail.workflow.facts.runtime.framework, "Mastra");
assert.equal(detail.workflow.facts.runtime.reusedApprovedCalculation, true);
assert(detail.workflow.trace.some(event => event.tool === "selectedSkill" && event.output?.body));
assert(detail.workflow.trace.some(event => event.tool === "search_products" && event.output));
console.log("PASS admin audit exposes routing, loaded skill instructions and raw tool results");
