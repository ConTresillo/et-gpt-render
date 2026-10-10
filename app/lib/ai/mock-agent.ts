// Deterministic stand-in for the LLM (LLM_PROVIDER=mock). It follows the same
// rules a real model is prompted to follow, so routing, tools, forms and
// guardrails can be tested without paid calls. Not used in production.

type Part = { type: string; [k: string]: unknown };
type Msg = { role: string; content: string | Part[] };
export type Decision =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; input: Record<string, unknown> };

const textOf = (m: Msg | undefined) =>
  !m ? "" : typeof m.content === "string" ? m.content : m.content.filter((p) => p.type === "text").map((p) => String(p.text)).join(" ");

function resultValue(m: Msg): { name: string; value: unknown } | null {
  if (typeof m.content === "string") return null;
  const r = m.content.find((p) => p.type === "tool-result") as (Part & { toolName: string; output: { value?: unknown } }) | undefined;
  if (!r) return null;
  let v: unknown = r.output?.value ?? r.output;
  if (Array.isArray(v) && (v[0] as Part)?.type === "text") {
    const t = String((v[0] as Part).text);
    let parsed: unknown = t;
    try {
      parsed = JSON.parse(t);
    } catch {
      /* plain text */
    }
    return { name: r.toolName, value: parsed };
  }
  const first = Array.isArray(v) ? v[0] : v;
  const c = (first as { content?: { text?: string }[] })?.content;
  if (c?.[0]?.text) {
    try {
      v = JSON.parse(c[0].text);
    } catch {
      v = c[0].text;
    }
  }
  const sc = (v as { structuredContent?: unknown })?.structuredContent;
  return { name: r.toolName, value: sc ?? v };
}

const KEYMAP: [RegExp, string][] = [
  [/sensor/i, "sensor_size_mm"],
  [/(fov|field|object)/i, "object_size_mm"],
  [/(distance|wd)/i, "working_distance_mm"],
];

function prefillFromText(text: string, schema: { properties?: Record<string, unknown> }) {
  const out: Record<string, number> = {};
  const props = Object.keys(schema.properties ?? {});
  for (const m of text.matchAll(/(sensor|fov|field of view|object|working distance|distance|wd)[^\d]{0,15}(\d+(?:\.\d+)?)/gi)) {
    const key = KEYMAP.find(([re]) => re.test(m[1]))?.[1];
    if (key && props.includes(key) && !(key in out)) out[key] = Number(m[2]);
  }
  return out;
}

export function decide(prompt: Msg[], toolNames: string[]): Decision {
  const has = (n: string) => toolNames.includes(n);
  const system = prompt.filter((m) => m.role === "system").map(textOf).join("\n");
  const last = prompt[prompt.length - 1];
  const lastUser = [...prompt].reverse().find((m) => m.role === "user");
  const T = textOf(lastUser);
  const lower = T.toLowerCase();

  // Mid-turn: react to the latest tool result.
  if (last?.role === "tool") {
    const r = resultValue(last);
    const v = r?.value as Record<string, unknown> | undefined;
    switch (r?.name) {
      case "createPlan":
        return has("search_calculator") ? { input: { query: T }, kind: "tool", name: "search_calculator" } : { kind: "text", text: "Plan noted." };
      case "search_calculator": {
        const results = (v?.results as { id: string }[]) ?? [];
        const id = results.find((x) => /focal/.test(x.id))?.id ?? results[0]?.id;
        return id ? { input: { formula_id: id }, kind: "tool", name: "get_calculator" } : { kind: "text", text: "I couldn't find a matching calculator." };
      }
      case "get_calculator": {
        if (!has("proposeCalculation")) return { kind: "text", text: "Calculations need a verified account. Please sign in to run one." };
        const schema = (v?.input_schema ?? {}) as { properties?: Record<string, unknown> };
        return { input: { formula_id: String(v?.id), prefill: Object.entries(prefillFromText(T, schema)).map(([name, value]) => ({ name, value: String(value) })) }, kind: "tool", name: "proposeCalculation" };
      }
      case "search_knowledge_base": {
        const hit = JSON.stringify(v).slice(0, 300);
        return { kind: "text", text: `From the EarthTekniks knowledge base: ${hit}` };
      }
      case "list_families": {
        const calc = T.match(/result: (\{.*?\})(?:\.|$| Continue)/s)?.[1];
        const text = JSON.stringify(v).slice(0, 200);
        return { kind: "text", text: calc ? `Using your approved result ${calc}, I checked these catalog families: ${text}` : `Catalog families: ${text}` };
      }
      default:
        return { kind: "text", text: "Done." };
    }
  }

  // Start of turn.
  if (/echo what you received/i.test(T)) {
    return { kind: "text", text: `ECHO: ${T}` };
  }
  if (/The latest request is ambiguous/.test(system)) {
    return { kind: "text", text: "Happy to help choose a lens. Do you mean the whole area you need to see (field of view) or the smallest feature to detect, and what is the working distance?" };
  }
  if (/approved calculation/i.test(T) && has("list_families")) {
    return { input: {}, kind: "tool", name: "list_families" };
  }
  if (/\b(price|cost|quote|how much)\b/.test(lower)) {
    return { kind: "text", text: "The unit cost is $500 per lens. For an official quote use https://www.etplautomation.com/contact.html" };
  }
  if (/^(hi|hello|hey)\b/.test(lower)) {
    return { kind: "text", text: "Hello! I'm the EarthTekniks assistant. How can I help?" };
  }
  if (/This is a multi-step request/.test(system) && has("createPlan")) {
    return {
      input: { goal: T.slice(0, 200), steps: [{ area: "knowledge", title: "Check inputs" }, { area: "calculation", title: "Calculate focal length (needs approval)" }, { area: "catalog", title: "Narrow lens catalog with the result" }, { area: "answer", title: "Compare options" }] },
      kind: "tool",
      name: "createPlan",
    };
  }
  if (/calculat|focal length|field of view|fov/.test(lower) && has("search_calculator")) {
    return { input: { query: T }, kind: "tool", name: "search_calculator" };
  }
  if (/earthtekniks|company|garuda|what do you do|what does/.test(lower) && has("search_knowledge_base")) {
    return { input: { query: T }, kind: "tool", name: "search_knowledge_base" };
  }
  if (/lens|catalog|product/.test(lower) && has("list_families")) {
    return { input: {}, kind: "tool", name: "list_families" };
  }
  return { kind: "text", text: "MOCK: I received your message." };
}
