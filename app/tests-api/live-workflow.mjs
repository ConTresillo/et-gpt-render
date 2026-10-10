// Opt-in integration check: uses the configured admin and real providers.
import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
config({ path: ".env.local", quiet: true });
const BASE = process.env.BASE ?? "http://localhost:3100";
const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST", headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
assert.equal(login.status, 200, "admin sign-in");
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
async function send(id, parts) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie },
    body: JSON.stringify({ id, message: { id: randomUUID(), role: "user", parts }, selectedChatModel: process.env.OPENAI_COMPATIBLE_MODEL, selectedVisibilityType: "private" }),
    signal: AbortSignal.timeout(150_000),
  });
  assert.equal(res.status, 200);
  const body = await res.text();
  return body.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
}
for (const [question, required] of [
  ["What is the Garuda inspection system?", ["loadSkill", "search_knowledge_base"]],
  ["Which lens do I need for a 100 mm field of view?", ["loadSkill", "search_calculator"]],
  ["Show me three C-mount FA lenses with focal length 16 mm for a 2/3-inch sensor. List their catalog specifications.", ["loadSkill", "search_knowledge", "search_products"]],
  ["Calculate focal length for sensor width 8.8 mm, horizontal field of view 100 mm, and working distance 300 mm", ["loadSkill", "search_calculator", "proposeCalculation"]],
  ["Calculate focal length for sensor width 8.8 mm, horizontal field of view 100 mm, and working distance 300 mm, then select C-mount FA lenses for a 2/3-inch sensor using the result.", ["loadSkill", "createPlan", "search_calculator", "proposeCalculation"]],
]) {
  if (process.env.LIVE_CASE && !question.toLowerCase().includes(process.env.LIVE_CASE.toLowerCase())) continue;
  const id = randomUUID();
  try {
    const events = await send(id, [{ type: "text", text: question }]);
    const calls = events.filter((event) => event.type === "tool-input-available").map((event) => event.toolName);
    const text = events.filter((event) => event.type === "text-delta").map((event) => event.delta).join("");
    console.log(JSON.stringify({ question, calls, answer: text }));
    if (process.env.LIVE_DEBUG) console.log(JSON.stringify(events.filter((event) => event.type === "tool-output-available" || event.type === "tool-input-available")));
    const failures = events.filter((event) => event.type === "error" || event.type.includes("error"));
    if (failures.length) console.log("Stream failures", JSON.stringify(failures));
    if (question.startsWith("Show me")) {
      const productCalls = events.filter((event) => event.type === "tool-input-available" && event.toolName === "search_products");
      assert(calls.includes("describe_table"), "catalog schema read before filtered search");
      assert(calls.includes("get_table_knowledge"), "column meanings read before interpreting specifications");
      const failures = events.filter((event) => event.type === "tool-output-available" && productCalls.some((call) => call.toolCallId === event.toolCallId) && event.output?.isError);
      if (failures.length) console.log("CATALOG UNAVAILABLE: MCP database connection failed; no product rows verified");
      else {
        assert(productCalls.length, "live catalog query actually executed");
        console.log("PASS live catalog query");
      }
    }
    for (const name of required) assert(calls.includes(name), `${name} executed`);
    const sources = events.filter((event) => event.type === "data-sources").at(-1)?.data ?? [];
    const cited = [...text.matchAll(/\[(S\d+)\]/g)].map((match) => match[1]);
    for (const id of cited) assert(sources.some((source) => source.id === id), `citation ${id} exists in retrieved evidence`);
    if (question.startsWith("Show me") || question.startsWith("What is")) {
      assert(text.trim(), "customer receives an answer");
      assert(cited.length && sources.length, "factual answer cites retrieved evidence");
    }
    if (question.startsWith("Show me")) {
      const models = sources.filter((source) => source.kind === "catalog").map((source) => source.title);
      assert(models.length > 0, "live catalog rows captured as evidence");
      assert(models.includes("FA1602D") && models.includes("FA1610A"), "actual exact sensor/focal-length/mount matches returned");
      assert(!models.includes("FA1601C"), "smaller sensor lens excluded from exact format matches");
      assert(events.some((event) => event.type === "tool-input-available" && event.toolName === "loadSkill" && event.input.name === "tradeoff"), "tradeoff skill loaded for multiple verified options");
      assert(text.includes("Differences to weigh"), "verified options compared");
      for (const name of text.match(/FA\d+[A-Z0-9-]*/g) ?? []) assert(models.includes(name), `model ${name} is present in retrieved rows`);
    }
    assert(!events.some((event) => event.type === "error" || event.type.startsWith("reasoning")), "no errors or private reasoning exposed");
    assert(!calls.includes("calculate"), "calculation waits for approval");
    assert(!/thinking process|<think>|<tool_call>|<function=|thus answer:/i.test(text), "no thinking or raw tool protocol in answer");
    const stored = await (await fetch(`${BASE}/api/messages?chatId=${id}`, { headers: { cookie } })).json();
    assert(stored.messages.some((message) => message.role === "assistant"), "assistant result persisted under RLS");
    if (question.startsWith("Calculate")) {
      const valid = events.find((event) => event.type === "tool-output-available" && !event.output?.error && event.output?.prefill);
      assert(valid, "valid calculation form produced");
      const proposal = events.find((event) => event.type === "tool-input-available" && event.toolCallId === valid.toolCallId);
      const output = valid.output;
      assert(!output.error, output.error);
      const approved = await send(id, [{ type: "data-calculationDecision", data: { proposalId: proposal.toolCallId, action: "approve", args: output.prefill } }]);
      const execution = approved.find((event) => event.type === "tool-input-available" && event.toolName === "calculate");
      assert(execution, "approved calculation executed by server");
      const result = approved.find((event) => event.type === "tool-output-available" && event.toolCallId === execution.toolCallId);
      assert(result && !result.output.error && result.output.valid !== false, "MCP calculator produced a valid result");
      console.log("PASS approved calculation", JSON.stringify(result.output));
      const answer = approved.filter((event) => event.type === "text-delta").map((event) => event.delta).join("");
      assert(answer.includes("24.3") && /\[S\d+\]/.test(answer), "approved calculation explained with a source citation");
      if (question.includes("then select")) {
        assert(approved.some((event) => event.type === "tool-input-available" && event.toolName === "search_products"), "combined request continues into product search after approval");
        assert(!approved.some((event) => event.type === "tool-input-available" && event.toolName === "proposeCalculation"), "no repeated calculation approval");
      }
    }
    for (let attempt = 0; attempt < 25; attempt++) {
      const history = await (await fetch(`${BASE}/api/history?limit=20`, { headers: { cookie } })).json();
      const named = history.chats.find((chat) => chat.id === id);
      if (named && named.title !== "New chat") {
        assert(named.title.length <= 60 && !/thinking process|<think>/i.test(named.title));
        console.log("PASS title worker:", named.title);
        break;
      }
      assert(attempt < 24, "title worker completed");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    await fetch(`${BASE}/api/chat?id=${id}`, { method: "DELETE", headers: { cookie } });
  }
}
const workers = await fetch(`${BASE}/api/admin/workers`, { headers: { cookie } });
assert.equal(workers.status, 200);
assert.equal((await workers.json()).status, "running");
const scheduled = await fetch(`${BASE}/api/admin/insights`, { method: "POST", headers: { "content-type": "application/json", cookie, origin: BASE }, body: JSON.stringify({ windowDays: 30 }) });
assert.equal(scheduled.status, 202);
const { reportId } = await scheduled.json();
for (let attempt = 0; attempt < 30; attempt++) {
  const reports = await (await fetch(`${BASE}/api/admin/insights`, { headers: { cookie } })).json();
  const report = reports.data.find((report) => report.id === reportId);
  assert(report?.status !== "error", report?.errorMsg);
  if (report?.status === "done") {
    assert(report.analyzedCount > 0 && report.overview && report.topTopics.length);
    console.log(`PASS insights worker: ${report.analyzedCount} messages analyzed`);
    break;
  }
  assert(attempt < 29, "insights worker completed");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log("Live workflow checks passed");
