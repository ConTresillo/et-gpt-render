import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const base = process.env.BASE ?? "http://localhost:3100";
const login = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
for (const [text, relevant] of [["wat is garuda", true], ["Who won the football world cup in 2022?", false]]) {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { cookie, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: randomUUID(), message: { id: randomUUID(), role: "user", parts: [{ type: "text", text }] }, selectedChatModel: process.env.OPENAI_COMPATIBLE_MODEL, selectedVisibilityType: "private" }), signal: AbortSignal.timeout(150000) });
  assert.equal(response.status, 200);
  const events = (await response.text()).split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  const answer = events.filter(e => e.type === "text-delta").map(e => e.delta).join("");
  console.log(text, answer);
  if (relevant) {
    assert(!/I can only help|couldn't finish/i.test(answer));
    assert(/garuda/i.test(answer));
    assert(/\[S\d+\]/.test(answer));
    assert(events.some(e => e.type === "data-sources" && e.data.some(s => /garuda/i.test(s.text))));
  } else assert(/I can only help/.test(answer));
}
console.log("PASS grounded product relevance and unrelated-topic rejection");
