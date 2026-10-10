export function approvedInputText(approved: { input?: { args?: Record<string, unknown> }; output?: Record<string, unknown> }) {
  const values = { ...approved.input?.args, ...approved.output };
  return Object.entries(values).filter(([key, value]) => key.endsWith("_mm") && typeof value === "number").map(([key, value]) => `${key.replaceAll("_", " ").replace(/ mm$/, "")} = ${value} mm`).join("; ");
}
