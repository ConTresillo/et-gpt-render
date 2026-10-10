import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

/** Numbers/words the customer actually typed, used to ground form prefill. */
export function statedNumbers(texts: string[]): string[] {
  return texts.flatMap((t) => t.match(/(?<![\w.])-?\d+(?:\.\d+)?/g) ?? []);
}

/**
 * Keep a prefill value only if the customer stated it; each stated number may
 * fill ONE input. Everything else is dropped (the form shows a blank).
 */
export function groundArgs(prefill: Record<string, unknown>, stated: string[]) {
  const pool = [...stated];
  const args: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(prefill)) {
    if (typeof v === "number") {
      const i = pool.findIndex((s) => Number(s) === v);
      if (i >= 0) {
        pool.splice(i, 1);
        args[k] = v;
        continue;
      }
      dropped.push(k);
    } else if (typeof v === "string" && v.trim()) {
      args[k] = v;
    }
  }
  return { args, dropped };
}

export type Schema = { type?: string; properties?: Record<string, unknown>; required?: string[] };

/** Bind explicitly labelled millimetre values, never sensor-format inches or
 * an unlabelled number. Later customer messages override earlier values. */
export function statedInputs(texts: string[], schema: Schema): Record<string, number> {
  const aliases: Record<string, string> = {
    sensor_size_mm: "sensor(?:\\s+(?:width|size))?",
    sensor_width_mm: "sensor(?:\\s+(?:width|size))?",
    object_size_mm: "(?:horizontal\\s+)?(?:field of view|fov|object (?:size|width))",
    working_distance_mm: "(?:working distance|wd)",
    focal_length_mm: "focal length",
  };
  const args: Record<string, number> = {};
  for (const [key, alias] of Object.entries(aliases)) {
    if (!(key in (schema.properties ?? {}))) continue;
    const pattern = new RegExp(`\\b${alias}\\s*(?:(?:of|is)\\s*|[=:]\\s*)?(-?\\d+(?:\\.\\d+)?)\\s*mm\\b`, "gi");
    const preceding = new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*mm\\s+(?:${alias})\\b`, "gi");
    for (const text of texts) {
      // Also understand "100 mm field of view", but do not move a value
      // labelled for a different quantity into the following field.
      const before = key === "object_size_mm" ? [...text.matchAll(preceding)].filter(match =>
        !/(?:sensor(?:\s+(?:size|width))?|focal length|working distance|wd)\s*(?:[=:]|is|of)?\s*$/i.test(text.slice(0, match.index))) : [];
      const matches = [...text.matchAll(pattern), ...before].sort((a, b) => a.index! - b.index!);
      for (const match of matches) args[key] = Number(match[1]);
    }
  }
  return args;
}

/** Validate submitted form args against the formula's real input schema. */
export function validateArgs(schema: Schema, args: Record<string, unknown>) {
  const ok = ajv.validate({ ...schema, additionalProperties: false }, args);
  return ok ? null : ajv.errorsText(ajv.errors, { dataVar: "input" });
}
