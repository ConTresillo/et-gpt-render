import type { ToolSet } from "ai";
import { z } from "zod";
import { parseToolResult } from "@/lib/mcp";

export function statedCatalogFilters(text: string, columns: string[]) {
  const last = (pattern: RegExp) => [...text.matchAll(new RegExp(pattern.source, "gi"))].at(-1);
  const filters: { column: string; op: string; value: string }[] = [];
  const focal = last(/(?:focal|focus)\s+length\s*(?:of\s+|is\s+|[=:]\s*)?(\d+(?:\.\d+)?)\s*mm/i)
    ?? last(/(\d+(?:\.\d+)?)\s*mm\s+(?:focal|focus)/i);
  const focalColumn = columns.find((column) => ["focus_length_mm", "focal_length_mm"].includes(column));
  if (focal && focalColumn) filters.push({ column: focalColumn, op: "=", value: focal[1] });
  const sensor = last(/(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)[\s-]*(?:inch|["″])/i);
  const sensorColumn = columns.find((column) => ["sensor_size_raw", "sensor_raw"].includes(column));
  if (sensor && sensorColumn) filters.push({ column: sensorColumn, op: "ILIKE", value: `${sensor[1].replaceAll(" ", "")}"` });
  const mount = last(/\b(C|CS)[\s-]*mount\b/i);
  const mountColumn = columns.find((column) => ["mount_raw", "mount"].includes(column));
  if (mount && mountColumn) filters.push({ column: mountColumn, op: "ILIKE", value: `${mount[1].toUpperCase()}-Mount` });
  return filters;
}

// The server accepts generic list/dict inputs. Give the chat provider a concrete
// schema for those documented fields while preserving MCP's execute function.
// This adapter does not change the server or the arguments sent to it.
export function catalogInputs(tools: ToolSet, opts?: { request: string; limit?: number; tables?: string[]; targetFocalLengthMm?: number; describe: (table: string) => Promise<unknown> }): ToolSet {
  if (!tools.search_products) return tools;
  return {
    ...tools,
    ...(opts?.tables?.length && tools.describe_table ? { describe_table: { ...tools.describe_table, inputSchema: z.object({ table: z.enum(opts.tables as [string, ...string[]]) }) } } : {}),
    search_products: {
      ...tools.search_products,
      execute: async (input: any, options: any) => {
        let args = input;
        let derivedColumn: string | undefined;
        if (opts && input.table) {
          const schema = parseToolResult(await opts.describe(input.table)) as { columns?: string[]; error?: string };
          if (schema.error || !schema.columns) return { error: schema.error || "Catalog schema unavailable" };
          if (/focal\s+length\s*[=:]?\s*\d/i.test(opts.request) && !schema.columns.some(column => ["focus_length_mm", "focal_length_mm"].includes(column))) {
            return { error: "This table does not contain focal-length specifications and cannot verify the customer's stated focal-length requirement. Read list_tables and select a suitable focal-length lens table before searching. Do not treat a miss in this table as an exhausted catalog search." };
          }
          const required = statedCatalogFilters(opts.request, schema.columns);
          const focalColumn = schema.columns.find(column => ["focus_length_mm", "focal_length_mm"].includes(column));
          const derivedTarget = opts.targetFocalLengthMm && !required.some(filter => filter.column === focalColumn);
          if (derivedTarget) derivedColumn = focalColumn;
          if (derivedTarget && !focalColumn) return { error: "This table cannot verify the calculated focal-length target. Choose a verified table with focal-length specifications." };
          const requiredColumns = new Set(required.map((filter) => filter.column));
          const filters = (input.filters ?? []).filter((filter: { column: string }) => !requiredColumns.has(filter.column)
            && schema.columns!.includes(filter.column)
            && !/^(?:mount|sensor|focus_length|focal_length)/i.test(filter.column)
            && !(derivedTarget && /^fov(?:_|$)/i.test(filter.column)));
          if (filters.some((filter: { column: string; op: string }) => /_mm$/.test(filter.column) && ["LIKE", "ILIKE"].includes(filter.op))) return { error: "Numeric millimetre columns require numeric comparison operators, not text pattern matching. Correct the filter using the verified schema." };
          args = { ...input, filters: [...filters.filter((filter: { column: string }) => !derivedTarget || filter.column !== focalColumn), ...required, ...(derivedTarget ? [{ column: focalColumn, op: "<=", value: String(opts.targetFocalLengthMm) }] : [])],
            ...(derivedTarget ? { sort: { column: focalColumn, direction: "desc" } } : {}),
            columns: schema.columns.filter((column) => !/price|cost/i.test(column)),
            limit: Math.min(input.limit ?? opts.limit ?? 10, opts.limit ?? 20) };
        }
        const raw = await tools.search_products.execute!(args, options);
        if (!derivedColumn) return raw;
        const data: any = raw && typeof raw === "object" && ("content" in raw || "structuredContent" in raw) ? parseToolResult(raw) : raw;
        if (!data || data.error || data.isError) return data;
        const results = data.results ?? [data];
        const focalValues = results.flatMap((result: any) => result.error ? [] : (result.rows ?? []).map((row: any) => Number(row[derivedColumn!]))).filter((value: number) => Number.isFinite(value) && value > 0);
        if (!focalValues.length) return data;
        const nearest = Math.max(...focalValues);
        for (const result of results) if (result.rows && !result.error) {
          result.rows = result.rows.filter((row: any) => Number(row[derivedColumn!]) === nearest);
          result.row_count = result.rows.length;
        }
        return { ...data, selection_note: "Closest retrieved focal lengths at or below the approved target. These are catalog candidates; application suitability still requires confirmation." };
      },
      inputSchema: z.object({
        table: opts?.tables?.length ? z.enum(opts.tables as [string, ...string[]]) : z.string().optional(),
        family: z.string().optional(),
        filters: z.array(z.object({
          column: z.string(),
          op: z.enum(["=", "!=", "<>", "<", "<=", ">", ">=", "ILIKE", "LIKE", "IS NULL", "IS NOT NULL"]),
          value: z.string().describe("Filter value as text, including numeric values such as 16. Omit for IS NULL/IS NOT NULL.").optional(),
        })).optional(),
        columns: z.array(z.string()).optional(),
        sort: z.object({ column: z.string(), direction: z.enum(["asc", "desc"]) }).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    },
  } as ToolSet;
}
