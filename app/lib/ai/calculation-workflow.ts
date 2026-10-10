import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Mastra } from "@mastra/core/mastra";
import { createStep, createWorkflow, createWorkflowStateReader } from "@mastra/core/workflows";
import { getMastraStorage } from "./runtime";
import { openMcp, parseToolResult } from "@/lib/mcp";
import { assertCan } from "@/lib/authz";
import { validateArgs, type Schema } from "@/lib/calc";
import type { UserType } from "@/app/(auth)/auth";

const formSchema = z.object({ formula_id: z.string(), validationSchema: z.any(), schema: z.any(), prefill: z.record(z.string(), z.unknown()), assumptions: z.array(z.any()).optional(), workflow: z.string().optional() }).passthrough();
const inputSchema = z.object({ chatId: z.string(), userId: z.string(), proposalId: z.string(), form: formSchema, legacyReceipt: z.object({ input: z.any(), output: z.any() }).optional() });
const resumeSchema = z.object({ action: z.enum(["approve", "cancel"]), args: z.record(z.string(), z.unknown()).optional(), role: z.enum(["guest", "user", "admin"]) });
const outputSchema = z.object({ status: z.enum(["approved", "cancelled"]), input: z.any().optional(), output: z.any().optional(), userId: z.string(), chatId: z.string(), proposalId: z.string() });
const approvalStep = createStep({ id: "customer-approval", inputSchema, resumeSchema, outputSchema: z.any(), suspendSchema: formSchema,
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    if (inputData.legacyReceipt) {
      if (inputData.legacyReceipt.output?.valid !== true) throw new Error("Legacy receipt is not a verified execution");
      return bail({ status: "approved", input: inputData.legacyReceipt.input, output: inputData.legacyReceipt.output, userId: inputData.userId, chatId: inputData.chatId, proposalId: inputData.proposalId });
    }
    if (!resumeData) return suspend(inputData.form);
    if (resumeData.action === "cancel") return bail({ status: "cancelled", userId: inputData.userId, chatId: inputData.chatId, proposalId: inputData.proposalId });
    assertCan(resumeData.role, "tool:calculate");
    const schema = inputData.form.validationSchema as Schema;
    const args = Object.fromEntries(Object.entries(resumeData.args ?? {}).map(([key, value]) => {
      const property = schema.properties?.[key] as { type?: string } | undefined;
      return [key, ["number", "integer"].includes(property?.type ?? "") && typeof value === "string" && value.trim() ? Number(value) : value];
    }));
    const problem = validateArgs(schema, args);
    if (problem) throw new Error(`Invalid approved inputs: ${problem}`);
    return { ...inputData, role: resumeData.role, args };
  } });
const executeStep = createStep({ id: "execute-approved-calculation", inputSchema: z.any(), outputSchema,
  execute: async ({ inputData }) => {
    const mcp = await openMcp(inputData.role as UserType, inputData.userId, inputData.chatId);
    try {
      const input = { formula_id: inputData.form.formula_id, args: inputData.args, assumptions: (inputData.form.assumptions ?? []).map((item: any) => ({ name: item.name, value: inputData.args[item.name] })) };
      const output = parseToolResult(await mcp.call("calculate", { formula_id: input.formula_id, args: input.args })) as any;
      if (output?.error || output?.isError || output?.valid !== true) throw new Error("The approved calculator did not return a verified result.");
      return { status: "approved" as const, userId: inputData.userId, chatId: inputData.chatId, proposalId: inputData.proposalId, input, output };
    } finally { await mcp.close(); }
  } });
const nativeWorkflow = createWorkflow({ id: "earthtekniks-calculation", inputSchema, outputSchema }).then(approvalStep).then(executeStep).commit();
let registered: Promise<{ wf: typeof nativeWorkflow }> | undefined;
async function workflow() {
  if (!registered) registered = getMastraStorage().then(({ storage }) => { new Mastra({ storage, workflows: { calculation: nativeWorkflow } }); return { wf: nativeWorkflow }; });
  return registered;
}
const runIdFor = (chatId: string, proposalId: string) => createHash("sha256").update(`${chatId}:${proposalId}`).digest("hex");
export async function suspendCalculation(chatId: string, userId: string, proposalId: string, form: z.infer<typeof formSchema>) {
  const { wf } = await workflow();
  const runId = runIdFor(chatId, proposalId);
  const existing = await wf.getWorkflowRunById(runId);
  if (existing) {
    if (existing.resourceId === userId && existing.status === "suspended") return runId;
    throw new Error("This approval run is already closed");
  }
  const run = await wf.createRun({ runId, resourceId: userId });
  const result = await run.start({ inputData: { chatId, userId, proposalId, form } });
  if (result.status !== "suspended") throw new Error("Calculation approval did not suspend correctly");
  return runId;
}
export async function pendingCalculation(chatId: string, userId: string, proposalId: string) {
  const { wf } = await workflow();
  const state = await wf.getWorkflowRunById(runIdFor(chatId, proposalId));
  if (!state || state.resourceId !== userId || state.status !== "suspended") return null;
  const payload = createWorkflowStateReader(state).getSuspendedStep()?.suspendPayload as z.infer<typeof formSchema> | undefined;
  return payload ? { ...payload, runId: state.runId } : null;
}
export async function resumeCalculation(chatId: string, userId: string, proposalId: string, decision: z.infer<typeof resumeSchema>) {
  const { wf } = await workflow();
  if (!await pendingCalculation(chatId, userId, proposalId)) throw new Error("That calculation is no longer awaiting approval");
  const run = await wf.createRun({ runId: runIdFor(chatId, proposalId), resourceId: userId });
  const result = await run.resume({ step: approvalStep, resumeData: decision });
  if (result.status !== "success") throw new Error("Calculation workflow could not complete");
  return outputSchema.parse(result.result);
}
export async function executedCalculation(chatId: string, userId: string, proposalId: string) {
  const state = await (await workflow()).wf.getWorkflowRunById(runIdFor(chatId, proposalId));
  if (!state || state.resourceId !== userId || state.status !== "success") return null;
  const result = createWorkflowStateReader(state).getResult();
  return result?.status === "approved" && result.chatId === chatId && result.proposalId === proposalId ? outputSchema.parse(result) : null;
}

export async function deleteCalculationRuns(runIds: string[]) {
  const { wf } = await workflow();
  for (const runId of runIds) await wf.deleteWorkflowRunById(runId);
}

/** Only called while migrating the trusted server's old private execution record.
 * No citation parsing, approval inference or calculator re-execution occurs. */
export async function importLegacyExecution(chatId: string, userId: string, receipt: { input: any; output: any }) {
  if (receipt.output?.valid !== true || !receipt.input?.formula_id || !receipt.input?.args) return null;
  const proposalId = "imported-private-execution";
  const { wf } = await workflow();
  const runId = runIdFor(chatId, proposalId);
  const existing = await executedCalculation(chatId, userId, proposalId);
  if (existing) return { ...existing, runId };
  const run = await wf.createRun({ runId, resourceId: userId });
  const result = await run.start({ inputData: { chatId, userId, proposalId, legacyReceipt: receipt, form: { formula_id: receipt.input.formula_id, validationSchema: {}, schema: {}, prefill: receipt.input.args } } });
  if (result.status !== "success") throw new Error("Unable to import the private execution receipt");
  return { ...outputSchema.parse(result.result), runId };
}
