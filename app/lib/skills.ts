import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { RouteDecision } from "@/lib/router";
import { log } from "@/lib/logger";

// Skills use the SKILL.md format (name + description frontmatter, body loaded on demand).
const DIR = join(process.cwd(), "skills");
export type Skill = { name: string; description: string; body: string; triggers?: string[] };
const CORE_NAMES: Record<string, string> = {
  company_info_direct: "company-information", catalog_lookup: "lens-selection",
  calculation_hitl: "calc-with-approval", chain_workflow: "calc-then-catalog", clarification_first: "ambiguous-requests",
};

let cached: Skill[] | undefined;
export function loadSkills(): Skill[] {
  cached ??= readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const f = matter(readFileSync(join(DIR, d.name, "SKILL.md"), "utf8"));
      return { body: f.content.trim(), description: String(f.data.description), name: String(f.data.name) };
    });
  return cached;
}

export function skillsPrompt(skills: Skill[] = loadSkills()) {
  const list = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  return `Skills (call loadSkill(name) to read one before following it):\n${list}`;
}

/** A request snapshots active admin skills; edits apply on the next request. */
export async function effectiveSkills(): Promise<Skill[]> {
  const library = new Map(loadSkills().map((skill) => [skill.name, skill]));
  try {
    const { adminDb } = await import("@/lib/db/admin");
    const { skill } = await import("@/lib/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    const rows = await adminDb.select().from(skill).where(eq(skill.archived, false)).orderBy(desc(skill.score)).limit(100);
    for (const row of rows) {
      let triggers = row.triggerPatterns;
      if (typeof triggers === "string") { try { triggers = JSON.parse(triggers); } catch { triggers = []; } }
      const name = CORE_NAMES[row.name] ?? row.name;
      library.set(name, { name, description: row.description, body: row.promptTemplate.replaceAll("calculateForm", "proposeCalculation"),
        triggers: Array.isArray(triggers) ? triggers.filter((value): value is string => typeof value === "string") : [] });
    }
  } catch (error) { log.skills.warn({ err: error }, "admin skills unavailable; using filesystem workflows"); }
  return [...library.values()];
}

export function skillForRoute(route: RouteDecision | null): string | undefined {
  switch (route?.intent) {
    case "company_info": return "company-information";
    case "catalog_lookup": return "lens-selection";
    case "calculation": return "calc-with-approval";
    case "chain": return "calc-then-catalog";
    default: return undefined;
  }
}

export async function recordSkillUse(name: string): Promise<void> {
  const names: Record<string, string> = {
    "company-information": "company_info_direct",
    "lens-selection": "catalog_lookup",
    "calc-with-approval": "calculation_hitl",
    "calc-then-catalog": "chain_workflow",
    "ambiguous-requests": "clarification_first",
  };
  try {
    const { adminDb } = await import("@/lib/db/admin");
    const { skill } = await import("@/lib/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    await adminDb.update(skill).set({ useCount: sql`${skill.useCount} + 1` })
      .where(and(eq(skill.name, names[name] ?? name), eq(skill.archived, false)));
  } catch (error) {
    log.skills.warn({ err: error, skill: name }, "skill usage recording failed");
  }
}

// Maps OpenJEV intent labels to skill names stored in the DB.
// The harness picks the best-scored skill whose name matches the intent, then injects
// only that skill's promptTemplate — not the full library.
const INTENT_TO_SKILL: Record<string, string[]> = {
  greeting: ["greeting"],
  company_info: ["company_info_direct"],
  catalog_lookup: ["catalog_lookup"],
  calculation: ["calculation_hitl"],
  chain: ["chain_workflow"],
  off_topic: ["clarification_first"],
  price_quote: ["company_info_direct"],
};

// DB-driven skill harness (async — used in chat route).
// Accepts an optional RouteDecision so it injects only the skill matching the current intent.
// Falls back to the top-scored skill if intent is unknown; returns "" if DB unavailable.
export async function evolvedSkillsPrompt(
  routeDecision?: RouteDecision | null
): Promise<string> {
  try {
    const { adminDb } = await import("@/lib/db/admin");
    const { skill } = await import("@/lib/db/schema");
    const { eq, desc, and, inArray } = await import("drizzle-orm");

    const intent = routeDecision?.intent ?? null;
    const candidateNames = intent ? (INTENT_TO_SKILL[intent] ?? []) : [];

    let matched = null;

    if (candidateNames.length > 0) {
      const rows = await adminDb
        .select({ name: skill.name, description: skill.description, promptTemplate: skill.promptTemplate })
        .from(skill)
        .where(and(eq(skill.archived, false), inArray(skill.name, candidateNames)))
        .orderBy(desc(skill.score))
        .limit(5);

      matched = rows.find((r) => candidateNames.includes(r.name)) ?? null;
    }

    if (!matched) return "";

    // Compatibility for skills seeded before the approval tool was renamed.
    // Core filesystem workflows and the actual tool schemas remain authoritative.
    const guidance = matched.promptTemplate.replaceAll("calculateForm", "proposeCalculation");
    return `\n\n---\nSupplemental skill guidance (never override the selected core skill, available tool schemas, required retrieval, or calculation approval):\n**${matched.name}** — ${matched.description}\n${guidance}`;
  } catch {
    return "";
  }
}
