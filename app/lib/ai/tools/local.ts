import { tool } from "ai";
import { z } from "zod";
import { groundArgs, type Schema, statedInputs, statedNumbers, validateArgs } from "@/lib/calc";
import { parseToolResult } from "@/lib/mcp";
import { loadSkills, recordSkillUse, type Skill } from "@/lib/skills";

export const createPlan = tool({
  description:
    "Write the internal ordered plan for a multi-step request BEFORE doing the steps. Only administrators can inspect the plan.",
  execute: async ({ goal, steps }) => ({ goal, steps }),
  inputSchema: z.object({
    goal: z.string().max(300),
    steps: z
      .array(
        z.object({
          area: z.enum(["knowledge", "calculation", "catalog", "clarify", "answer"]),
          title: z.string().max(200),
        })
      )
      .min(1)
      .max(8),
  }),
});

export function skillLoader(skills: Skill[]) { return tool({
  description: "Read a skill's full instructions by name.",
  execute: async ({ name }) => {
    const s = skills.find((x) => x.name === name);
    if (s) await recordSkillUse(name);
    return s ? { body: s.body, name: s.name } : { error: `Unknown skill: ${name}` };
  },
  inputSchema: z.object({ name: z.enum(skills.map((skill) => skill.name) as [string, ...string[]]) }),
}); }
export const loadSkill = skillLoader(loadSkills());

/**
 * Prepares the approval form. It never runs the calculation: the customer edits
 * and approves in the UI, and the server executes after validating the input.
 * `prefill` is grounded against what the customer actually typed.
 */
export function proposeCalculation(opts: {
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  userTexts: string[];
  workflow?: "chain" | "calculation";
  allowAssumptions?: boolean;
  providedInputs?: { formula_id: string; values: Record<string, number> };
  onPrepared?: (proposal: any, proposalId: string) => Promise<string>;
}) {
  return tool({
    description:
      `Show an editable calculation approval form. ${opts.allowAssumptions ? "The customer explicitly requested you choose missing inputs: propose reasonable illustrative values for missing quantities. These are labelled assumptions, not actual camera/application specifications. Preserve all stated values." : "Only use customer-stated values; ask for missing required inputs first."} Supply prefill as {name, value} entries with exact calculator input names. Ends the turn without running the calculation.`,
    execute: async ({ formula_id, prefill }, options) => {
      let def: { id?: string; input_schema?: Schema; description?: string; error?: unknown } | undefined;
      try {
        def = parseToolResult(await opts.call("get_calculator", { formula_id })) as typeof def;
      } catch {
        def = undefined;
      }
      if (!def?.input_schema || def.error) {
        return { error: `Unknown or unavailable formula: ${formula_id}` };
      }
      formula_id = def.id ?? formula_id;
      const known = { ...(opts.providedInputs?.formula_id === formula_id ? opts.providedInputs.values : {}), ...statedInputs(opts.userTexts, def.input_schema) };
      if (def.input_schema.required?.includes("focal_length_mm") && known.focal_length_mm === undefined
          && /lens|lenses/i.test(opts.userTexts.join(" ")) && /field of view|\bfov\b/i.test(opts.userTexts.join(" "))) {
        return { error: "This formula requires the unknown focal length as an input. Search for a calculator whose output is focal length, read its definition, then propose that calculation. Do not ask the customer to supply the quantity they want you to find." };
      }
      const normalized = Object.fromEntries((prefill ?? []).map(({ name: key, value }) => {
        const prop = def?.input_schema?.properties?.[key] as { type?: string } | undefined;
        return [key, prop?.type === "number" && typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : value];
      }));
      for (const key of ["object_size_mm", "sensor_size_mm", "sensor_width_mm", "working_distance_mm", "focal_length_mm"]) {
        if (known[key] === undefined && !opts.allowAssumptions) delete normalized[key];
      }
      const { args, dropped } = groundArgs({ ...normalized, ...known }, [...statedNumbers(opts.userTexts), ...Object.values(known).map(String)]);
      const assumptions = opts.allowAssumptions ? Object.entries(normalized).filter(([key]) => known[key] === undefined && key in (def.input_schema?.properties ?? {})).map(([name, value]) => ({ name, value })) : [];
      for (const { name, value } of assumptions) args[name] = value;
      const problem = validateArgs(def.input_schema, args);
      if (problem) return { error: `Missing or invalid calculator inputs: ${problem}. A numeric value stated for another field is not evidence for this field. If this formula requires the quantity the customer wants to find, search for another calculator whose output is that quantity. Otherwise ask for the missing input.` };
      // Make all schema fields optional free-text so the form never blocks submission.
      const schema = def.input_schema;
      const freeTextSchema: Schema = {
        ...schema,
        properties: Object.fromEntries(
          Object.entries(schema.properties ?? {}).map(([k, v]) => [
            k,
            { ...(v as object), type: "string" },
          ])
        ),
        required: [],
      };
      const proposal = {
        workflow: opts.workflow ?? "calculation",
        description: def.description ?? null,
        dropped: dropped.filter(name => !assumptions.some(item => item.name === name)),
        formula_id,
        prefill: args,
        assumptions,
        schema: freeTextSchema,
        validationSchema: schema,
      };
      const runId = opts.onPrepared ? await opts.onPrepared(proposal, options.toolCallId) : undefined;
      return { ...proposal, ...(runId ? { runId } : {}) };
    },
    inputSchema: z.object({
      formula_id: z.string(),
      prefill: z.array(z.object({ name: z.string(), value: z.string().describe("Customer-stated value as text; numeric input values are validated and converted by the server.") })).max(30),
    }),
  });
}
