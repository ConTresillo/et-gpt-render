import "server-only";
import { adminSql } from "@/lib/db/admin";
import { getMastraStorage } from "./runtime";
import { toolFailure } from "./recovery";
import type { RouteDecision } from "@/lib/router";
export type Workflow = {
  goal: string;
  decision: RouteDecision;
  status: "active" | "waiting-approval" | "waiting-input" | "complete" | "cancelled" | "blocked";
  steps: { area: string; title: string; status: string }[];
  facts: Record<string, unknown>;
  trace: { tool: string; input: unknown; ok: boolean; error?: string; recovery?: string; output?: unknown; at?: string }[];
};
export async function readWorkflow(chatId: string, userId?: string): Promise<Workflow | null> {
  const { memory } = await getMastraStorage();
  const thread = await memory.getThreadById({ threadId: chatId });
  if (thread) {
    if (userId && thread.resourceId !== userId) return null;
    return (thread.metadata?.workflow as Workflow) ?? null;
  }
  // One-time migration of existing private state. Never infer an executed result
  // from a citation or pair separate approvals with a shared formula ID.
  const rows = userId
    ? await adminSql`select state, user_id from et_private.workflow where chat_id=${chatId} and user_id=${userId}`
    : await adminSql`select state, user_id from et_private.workflow where chat_id=${chatId}`;
  if (!rows[0]) return null;
  const state = rows[0].state as Workflow;
  if (state.facts.approvedCalculation) {
    const { importLegacyExecution } = await import("./calculation-workflow");
    const imported = await importLegacyExecution(chatId, String(rows[0].user_id), state.facts.approvedCalculation as { input: any; output: any });
    if (imported) { state.facts.approvedCalculation = imported; state.facts.calculationRuns = [imported.runId]; }
    else { state.facts.legacyUnverifiedCalculation = state.facts.approvedCalculation; delete state.facts.approvedCalculation; }
  }
  if (!state.facts.pendingInputs && state.status === "waiting-input") {
    const definition = [...state.trace].reverse().find(event => event.tool === "get_calculator" && event.ok && (event.output as any)?.input_schema)?.output as any;
    if (definition?.id) {
      const values = (state.facts.customerInputs as Record<string, number>) ?? {};
      state.facts.pendingInputs = { formula_id: definition.id, schema: definition.input_schema, values, requestedKeys: (definition.input_schema.required ?? []).filter((key: string) => values[key] === undefined) };
    }
  }
  await saveWorkflow(chatId, String(rows[0].user_id), state);
  return state;
}
export async function saveWorkflow(chatId: string, userId: string, state: Workflow) {
  const { memory } = await getMastraStorage();
  const thread = await memory.getThreadById({ threadId: chatId });
  if (thread && thread.resourceId !== userId) throw new Error("Workflow ownership mismatch");
  const metadata = { ...(thread?.metadata ?? {}), workflow: state, workingMemory: JSON.stringify(workflowContext(state)) };
  if (thread) await memory.updateThread({ id: chatId, title: thread.title, metadata });
  else await memory.createThread({ threadId: chatId, resourceId: userId, title: state.goal.slice(0, 100), metadata });
}
export function recordWorkflowTool(state: Workflow, tool: string, input: unknown, output: any) {
  const failure = toolFailure(output);
  const failed = Boolean(failure);
  const area = /calculator|Calculation|calculate/.test(tool) ? "calculation" : /table|products|product|families|search_knowledge$/.test(tool) ? "catalog" : "knowledge";
  const step = state.steps.find(step => step.area === area && step.status !== "done");
  state.trace.push({ tool, input, output, at: new Date().toISOString(), ok: !failed, ...(failed ? { error: failure!, recovery: area === "catalog" ? "Choose another verified table or correct the filters; preserve customer constraints." : "Check the requested output and required input definitions; ask for missing facts without inventing values." } : {}) });
  state.trace = state.trace.slice(-200);
  if (step) step.status = failed ? "blocked" : "running";
  if (area === "catalog" && output?.row_count === 0) {
    state.trace.at(-1)!.recovery = "No matching rows in this table. Try another eligible table with the original constraints; a single-table miss does not exhaust the catalog.";
  }
  if (tool === "proposeCalculation" && !failed) { state.status = "waiting-approval"; state.facts.proposedCalculation = { formula_id: output.formula_id, inputs: output.prefill, assumptions: output.assumptions ?? [] }; }
  if (failed) state.status = "active";
  if (tool === "calculate" && !failed) {
    state.status = "active";
    state.facts.approvedCalculation = { input, output };
    for (const step of state.steps) if (step.area === "calculation") step.status = "done";
  }
}

/** Audit payloads stay private in storage, not duplicated into every model step. */
export function workflowContext(state: Workflow) {
  const { runtime: _runtime, calculationRuns: _runs, ...facts } = state.facts;
  return { goal: state.goal, decision: state.decision, status: state.status, steps: state.steps, facts,
    trace: state.trace.slice(-8).map(({ tool, ok, error, recovery }) => ({ tool, ok, error, recovery })) };
}

export async function deleteConversationState(chatId: string, userId: string) {
  const { memory } = await getMastraStorage();
  const thread = await memory.getThreadById({ threadId: chatId });
  if (!thread) return;
  if (thread.resourceId !== userId) throw new Error("Workflow ownership mismatch");
  const state = thread.metadata?.workflow as Workflow | undefined;
  const { deleteCalculationRuns } = await import("./calculation-workflow");
  await deleteCalculationRuns((state?.facts.calculationRuns as string[] | undefined) ?? []);
  await memory.deleteThread(chatId);
}
