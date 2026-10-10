import type { DomainStep } from "./mastra";

export function toolFailure(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return;
  const value = output as { error?: unknown; isError?: boolean; results?: unknown[] };
  if (value.error || value.isError) return String(value.error ?? "Tool reported failure");
  const nested = value.results?.map(toolFailure).filter(Boolean);
  return nested?.length ? nested.join("; ") : undefined;
}
export function recoveryState(steps: DomainStep[], maxFailures = 3) {
  const failures: { tool: string; input: unknown; error: string }[] = [];
  let latest: typeof failures[number] | undefined;
  for (const step of steps) {
    latest = undefined;
    for (const call of step.toolCalls) {
      const result = step.toolResults.find(result => result.toolCallId === call.toolCallId);
      const error = result ? toolFailure(result.output) : "Tool invocation produced no result; check argument types and schema.";
      if (error) { latest = { tool: call.toolName, input: call.input, error }; failures.push(latest); }
    }
  }
  const repeated = latest ? failures.filter(failure => failure.tool === latest!.tool && JSON.stringify(failure.input) === JSON.stringify(latest!.input)).length : 0;
  return { latest, failures, exhausted: failures.length >= maxFailures || repeated >= 2 };
}
export function recoveryTools(tool: string, available: string[]) {
  const candidates = /calculator|Calculation|calculate/.test(tool)
    ? ["createPlan", "search_calculator", "get_calculator", "search_lookups", "get_reference", "lookup", "proposeCalculation"]
    : /table|products|product|select|knowledge$/.test(tool)
      ? ["createPlan", "list_tables", "describe_table", "get_table_knowledge", "search_products", "lookup_model", "get_product"]
      : ["createPlan", "search_knowledge_base", "get_document", "loadSkill", tool];
  return candidates.filter(name => available.includes(name) && name !== "calculate");
}
export const recoverySummary = "I couldn't verify the remaining information after trying to correct the tool request. No recommendation is confirmed. Your requirements and any approved calculation are preserved; you can continue this chat when the information is available.";
