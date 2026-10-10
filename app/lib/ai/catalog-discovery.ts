import { parseToolResult } from "@/lib/mcp";
type Entry = { table: string; family: string; purpose: string; columns: string[] };
let cached: { time: number; entries: Entry[] } | undefined;
/** Read actual catalog capabilities; product rows are never cached here. */
export async function discoverCatalog(call: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
  if (cached && Date.now() - cached.time < 120000) return cached.entries;
  const tables = parseToolResult(await call("list_tables", {})) as Omit<Entry, "columns">[];
  if (!Array.isArray(tables)) throw new Error("Catalog table discovery failed");
  const entries: Entry[] = [];
  for (let i = 0; i < tables.length; i += 6) {
    const batch = await Promise.all(tables.slice(i, i + 6).map(async table => {
      const schema = parseToolResult(await call("describe_table", { table: table.table })) as { columns?: string[] };
      return schema.columns ? { ...table, columns: schema.columns } : undefined;
    }));
    entries.push(...batch.filter((entry): entry is Entry => Boolean(entry)));
  }
  cached = { time: Date.now(), entries };
  return entries;
}
