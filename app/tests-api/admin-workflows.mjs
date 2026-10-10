import { config } from "dotenv";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const base = process.env.BASE ?? "http://localhost:3100";
const login = await fetch(base + "/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const identity = await login.json();
const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
async function api(path, method = "GET", body) {
  const r = await fetch(base + path, { method, headers: { cookie, origin: base, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  assert(r.ok, `${path}: ${r.status}`); return r.json();
}
assert.equal((await api("/api/admin/insights/config")).data.length, 3);
const workers = await api("/api/admin/workers");
assert.equal(workers.bossRunning, true);
assert(workers.workers.includes("name-chat"));
assert(workers.queues.every(q => Number.isFinite(q.retry_limit)));
const users = await api(`/api/admin/users?type=registered&q=${encodeURIComponent(process.env.ADMIN_EMAIL)}`);
assert.equal(users.total, 1);
await api(`/api/admin/users/${identity.user.id}`, "PATCH", { action: "set_role", role: "admin" });
assert.equal((await api(`/api/admin/users/${identity.user.id}`)).role, "admin");
const sorted = await api("/api/admin/conversations?sort=user");
assert(sorted.data.every((row, i, rows) => i === 0 || rows[i - 1].userEmail <= row.userEmail));
const job = await api("/api/admin/insights", "POST", { windowDays: 1 });
let report;
for (let i = 0; i < 15; i++) {
  const response = await api("/api/admin/insights");
  assert.equal(response.data.length, 1);
  report = response.data[0];
  if (report.id === job.reportId && report.status === "done") break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.equal(report.id, job.reportId);
assert.equal(report.status, "done");
assert.equal(report.windowDays, 1);
assert(report.prevInsightId);
console.log("PASS settings, worker heartbeat, user search, role persistence, conversation sorting, sliding-window insights and predecessor linkage");
