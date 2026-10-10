import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
config({ path: ".env.local", quiet: true });
const base = process.env.BASE ?? "http://localhost:3100";
const guest = await fetch(`${base}/api/guest`, { redirect: "manual", signal: AbortSignal.timeout(30000) });
const cookie = guest.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
assert(cookie.includes("session_token"));
const id = randomUUID();
try {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { cookie, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id, message: { id: randomUUID(), role: "user", parts: [{ type: "text", text: "wat is garuda" }] }, selectedChatModel: process.env.OPENAI_COMPATIBLE_MODEL, selectedVisibilityType: "private" }), signal: AbortSignal.timeout(150000) });
  assert.equal(response.status, 200);
  const events = (await response.text()).split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  assert(!events.some(event => event.type === "error" || event.type.startsWith("reasoning")));
  const answer = events.filter(event => event.type === "text-delta").map(event => event.delta).join("");
  assert(/garuda/i.test(answer) && /\[S\d+\]/.test(answer));
  for (const event of events) {
    if (event.type === "tool-input-available") assert.deepEqual(event.input, {}, "customer receives names, not internal arguments");
    if (event.type === "tool-output-available") assert.deepEqual(event.output, { ok: true }, "customer receives status, not internal results or skills");
  }
  const history = await (await fetch(`${base}/api/messages?chatId=${id}`, { headers: { cookie } })).json();
  assert(!JSON.stringify(history).includes("Mandatory policy:"), "reloaded history contains no internal instructions");
  const forbidden = await fetch(`${base}/api/admin/conversations/${id}`, { headers: { cookie } });
  assert.equal(forbidden.status, 403, "customer cannot read internal workflow debugging");
  console.log("PASS guest Mastra stream, grounded answer, masked tool payloads and admin boundary");
} finally {
  await fetch(`${base}/api/chat?id=${id}`, { method: "DELETE", headers: { cookie } });
}
