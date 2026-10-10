/** Customer activity names are public; internal tool arguments and results are not. */
export function publicToolChunk(chunk: Record<string, any>): Record<string, any> | null {
  if (chunk.type === "tool-output-error") return { ...chunk, errorText: "This step failed; checking another approach." };
  if (["tool-input-start", "tool-input-delta"].includes(chunk.type)) return null;
  if (chunk.type === "tool-input-available" && chunk.toolName !== "proposeCalculation") return { ...chunk, input: {} };
  if (chunk.type === "tool-output-available" && !(chunk.output?.formula_id && chunk.output?.schema)) return { ...chunk, output: { ok: !chunk.output?.error && !chunk.output?.isError } };
  return chunk;
}
