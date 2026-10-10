import { statedInputs, type Schema } from "@/lib/calc";
export type PendingInputs = { formula_id: string; schema: Schema; requestedKeys: string[]; values: Record<string, number> };
/** The order comes from persisted schema keys, never from rendered assistant text. */
export function resolvePendingInputs(pending: PendingInputs, reply: string) {
  const explicit = statedInputs([reply], pending.schema);
  if (Object.keys(explicit).length) return { ...pending.values, ...explicit };
  const parts = reply.trim().split(/\s*[,;]\s*/);
  if (parts.length !== pending.requestedKeys.length) return pending.values;
  const values = parts.map(part => part.match(/^(-?\d+(?:\.\d+)?)\s*mm$/i)?.[1]);
  if (values.some(value => value === undefined)) return pending.values;
  return { ...pending.values, ...Object.fromEntries(pending.requestedKeys.map((key, index) => [key, Number(values[index])])) };
}
