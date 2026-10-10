import type { ToolSet } from "ai";
import { checkLens, type LensRequirements, type SuitabilityColumns } from "./lens-suitability";
import { parseToolResult } from "@/lib/mcp";

export type EvidenceSource = {
  id: string;
  title: string;
  kind: "document" | "catalog" | "catalog-search" | "calculation" | "reference";
  locator: string;
  text: string;
};

const obj = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const title = (value: string) => value.replaceAll("_", " ");

// Only successful retrieved passages, actual product rows and executed
// calculations are evidence. Metadata/search routing is not a product source.
export class EvidenceRegistry {
  sources: EvidenceSource[];
  used = new Set<string>();
  emptyCatalogSearch = false;
  constructor(previous: EvidenceSource[] = []) { this.sources = [...new Map(previous.map(source => [source.id, source])).values()]; }

  add(tool: string, input: unknown, output: unknown): EvidenceSource[] {
    const data = obj(output);
    const args = obj(input);
    if (data.error || data.valid === false || data.confident === false) return [];
    const candidates: Omit<EvidenceSource, "id">[] = [];
    if (tool === "search_knowledge_base") {
      for (const hit of data.results ?? []) if (hit.doc_id && hit.snippet) candidates.push({
        kind: "document", title: `${title(hit.doc_id)} — ${hit.heading || "Overview"}`,
        locator: `${hit.doc_id}#${hit.heading ?? ""}`, text: hit.snippet,
      });
    } else if (tool === "get_document" && data.doc_id && data.text) {
      candidates.push({ kind: "document", title: data.title || title(data.doc_id), locator: data.doc_id, text: data.text });
    } else if (["search_products", "get_product", "run_select"].includes(tool)) {
      const results = data.results ?? [data];
      if (results.every((result: { error?: unknown; rows?: unknown[] }) => !result.error) && results.every((result: { rows?: unknown[] }) => !(result.rows?.length))) {
        this.emptyCatalogSearch = true;
        candidates.push({ kind: "catalog-search", title: "Catalog search — no matching models", locator: String(args.table || args.family || args.model_name || "catalog"), text: "The executed catalog lookup returned no matching model rows for this request." });
      }
      for (const result of results) {
        if (result.error) continue;
        for (const row of result.rows ?? []) if (row.model_name) {
          this.emptyCatalogSearch = false;
          const table = result.table || args.table || args.family || "Product catalog";
          candidates.push({ kind: "catalog", title: String(row.model_name), locator: `${table}/${row.model_name}`,
            text: Object.entries(row).filter(([key, value]) => value != null && !/price|cost|sql/i.test(key))
              .map(([key, value]) => `${title(key)}: ${String(value)}`).join("\n") });
        }
      }
    } else if (tool === "calculate" && data.valid === true) {
      candidates.push({ kind: "calculation", title: `${title(args.formula_id)} calculation${args.assumptions?.length ? " (illustrative assumptions approved)" : ""}`, locator: args.formula_id,
        text: `${args.assumptions?.length ? `Illustrative assumptions approved: ${args.assumptions.map((item: any) => `${title(item.name)}: ${item.value}`).join("; ")}\n` : ""}Approved inputs\n${Object.entries(obj(args.args)).map(([key, value]) => `${title(key)}: ${value}`).join("\n")}\nResult\n${Object.entries(data).filter(([key, value]) => key !== "valid" && value != null).map(([key, value]) => `${title(key)}: ${value}`).join("\n")}` });
    } else if (["lookup", "get_reference"].includes(tool) && Object.keys(data).length) {
      candidates.push({ kind: "reference", title: title(args.reference_id || args.ref_id || "Optics reference"), locator: String(args.reference_id || args.ref_id || tool), text: JSON.stringify(data) });
    }
    return candidates.map((candidate) => {
      const existing = this.sources.find((source) => source.locator === candidate.locator && source.text === candidate.text);
      if (existing) { this.used.add(existing.id); return existing; }
      const nextId = Math.max(0, ...this.sources.map(source => Number(source.id.slice(1)) || 0)) + 1;
      const source = { ...candidate, id: `S${nextId}` };
      this.sources.push(source);
      this.used.add(source.id);
      return source;
    });
  }

  wrap(tools: ToolSet): ToolSet {
    return Object.fromEntries(Object.entries(tools).map(([name, definition]) => {
      if (!definition.execute) return [name, definition];
      const execute = definition.execute;
      return [name, { ...definition, toModelOutput: ({ output }: { output: unknown }) => ({ type: "json", value: output as never }), execute: async (input: never, options: never) => {
        const raw = await execute(input, options);
        const data = raw && typeof raw === "object" && ("content" in raw || "structuredContent" in raw) ? parseToolResult(raw) : raw;
        const references = this.add(name, input, data);
        return references.length ? { ...obj(data), sourceReferences: references.map(({ id, title, locator }) => ({ id, title, locator })) } : data;
      } }];
    })) as ToolSet;
  }
}

/** Render verified product fields verbatim; the model must not reinterpret
 * distortion operators, sensor coverage or aperture codes as new facts. */
export function catalogAnswer(sources: EvidenceSource[], calculation?: EvidenceSource, configuredFields?: { keys: string[]; label: string }[], suitability?: { requirements: LensRequirements; columns: SuitabilityColumns }): string {
  const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
  const data = sources.map((source) => ({ source, values: Object.fromEntries(source.text.split("\n").map((line) => {
      const split = line.indexOf(": ");
      return [line.slice(0, split), line.slice(split + 2)];
    })) }));
  const fields = (configuredFields ?? [
    { keys: ["focus_length_mm", "focal_length_mm"], label: "Focal length (mm)" },
    { keys: ["sensor_size_raw", "sensor_raw"], label: "Listed sensor format" },
    { keys: ["mount_raw", "mount"], label: "Mount" },
    { keys: ["megapixel_rating"], label: "Resolution rating (MP)" },
    { keys: ["f_no_raw"], label: "Aperture (catalog)" },
    { keys: ["weight_g"], label: "Weight (g)" },
  ]).filter((field) => data.some(({ values }) => field.keys.some((key) => values[title(key)] != null)));
  const value = (values: Record<string, string>, keys: string[]) => keys.map((key) => values[title(key)]).find((item) => item != null) ?? "Not retrieved";
  const rows = data.map(({ source, values }) => `| **${cell(source.title)}** [${source.id}] | ${fields.map((field) => cell(value(values, field.keys))).join(" | ")} |`);
  const differences = sources.length > 1 ? fields.filter((field) => new Set(data.map(({ values }) => value(values, field.keys))).size > 1).slice(0, 3) : [];
  const tradeoffs = differences.length ? `\n\n**Differences to weigh**\n\n${differences.map((field) => `- ${field.label}: ${data.map(({ source, values }) => `${source.title}: ${value(values, field.keys)} [${source.id}]`).join("; ")}.`).join("\n")}\n\nWhich of these differences matters most for your application?` : "";
  const calc = calculation ? `${calculationAnswer(calculation)}\n\n` : "";
  const derived = calculation?.text.split("Result\n")[1]?.includes("focal length mm:");
  const compatibility = suitability ? `\n\n**Compatibility checks**\n\n${data.map(({ source, values }) => {
    const row = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.replaceAll(" ", "_"), value]));
    const assessment = checkLens(row, suitability.requirements, suitability.columns);
    return `**${source.title}: ${assessment.verdict}** [${source.id}]\n${Object.entries(assessment.checks).map(([key, check]) => `- ${key}: ${check.status} — ${check.detail}`).join("\n")}`;
  }).join("\n\n")}\n\nPlease supply any missing camera specifications to complete these checks. A catalog match alone is not a confirmed recommendation.` : "";
  return `${calc}The catalog returned **${sources.length} ${suitability || derived ? "candidate" : "matching"} ${sources.length === 1 ? "model" : "models"}** in this search:${derived ? " Listed focal lengths can differ from the calculated target; these are candidates rather than a confirmed fit." : ""}\n\n| Model | ${fields.map((field) => cell(field.label)).join(" | ")} |\n|---|${fields.map(() => "---|").join("")}\n${rows.join("\n")}${tradeoffs}${compatibility}\n\nThese are the catalog's stated specifications. Application suitability still depends on your sensor, field of view, working distance and resolution requirements. Expand Sources to inspect the complete retrieved specifications.`;
}

export function calculationAnswer(source: EvidenceSource): string {
  const result = source.text.split("Result\n")[1] ?? "";
  return `${source.title.includes("illustrative assumptions") ? "This is an illustrative result using the assumptions you approved; it is not a confirmed specification of your setup.\n\n" : ""}Your approved calculation returned:\n\n${result.split("\n").filter(Boolean).map((line) => `- ${line} [${source.id}]`).join("\n")}\n\nExpand Sources to review the approved inputs and result.`;
}
