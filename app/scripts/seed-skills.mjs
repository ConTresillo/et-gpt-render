/**
 * seed-skills.mjs
 * Seeds the Skill table with initial skills for the 5 core workflow types.
 * Idempotent — skips skills that already exist by name.
 *
 * Run: node scripts/seed-skills.mjs
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { randomUUID } from "crypto";
import { config } from "dotenv";

const require = createRequire(import.meta.url);

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
config({ path: envPath, quiet: true });
if (!process.env.POSTGRES_URL_ADMIN) throw new Error("Set POSTGRES_URL_ADMIN in .env.local before seeding skills.");

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.POSTGRES_URL_ADMIN, { max: 1 });

const SKILLS = [
  {
    name: "tradeoff",
    description: "Compare multiple verified catalog options against customer priorities with citations and explicit unknowns.",
    triggerPatterns: ["compare", "tradeoff", "trade-off", "options", "help me choose"],
    promptTemplate: readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../skills/tradeoff/SKILL.md"), "utf8").replace(/^---[\s\S]*?---\s*/, ""),
    source: "manual",
  },
  {
    name: "greeting",
    description: "Handles greetings, pleasantries, and introductory messages from users.",
    triggerPatterns: ["hello", "hi", "hey", "good morning", "howdy", "what can you do"],
    promptTemplate: `You are the EarthTekniks assistant. Respond warmly and briefly. Do NOT call any tools. Introduce yourself as EarthTekniks' assistant if this is the first message.`,
    source: "manual",
  },
  {
    name: "company_info_direct",
    description:
      "Answers general questions about EarthTekniks — what they do, their services, history, contact details — using context already in the system prompt. Does not call tools unless asked about a specific product or technical detail.",
    triggerPatterns: [
      "what does earthtekniks do",
      "who are you",
      "tell me about earthtekniks",
      "what services",
      "contact",
      "about",
    ],
    promptTemplate: `Load the company-information skill and call search_knowledge_base before answering company questions. Ground company facts in its results and use get_document when needed. Keep answers concise.`,
    source: "manual",
  },
  {
    name: "catalog_lookup",
    description:
      "Looks up products, lenses, equipment models, or catalog items from the EarthTekniks knowledge base via MCP.",
    triggerPatterns: [
      "catalog",
      "product",
      "lens",
      "equipment",
      "model",
      "available",
      "stock",
      "find",
      "search",
    ],
    promptTemplate: `Load lens-selection. Use search_knowledge or lookup_model to identify catalog tables, then describe_table before search_products. Use get_product for exact model specifications. Ask for missing requirements before recommending products. Do not guess availability or prices.`,
    source: "manual",
  },
  {
    name: "calculation_hitl",
    description:
      "Handles calculation requests (e.g. FOV, depth-of-field, resolution, load estimates). Always proposes a structured form for human review — never executes calculations silently.",
    triggerPatterns: [
      "calculate",
      "compute",
      "how much",
      "what is the",
      "fov",
      "depth of field",
      "resolution",
      "load",
      "estimate",
    ],
    promptTemplate: `Load calc-with-approval. Read search_calculator and get_calculator, gather required inputs, then call proposeCalculation with grounded prefill. Wait for customer approval before the server runs calculate.`,
    source: "manual",
  },
  {
    name: "chain_workflow",
    description:
      "Handles multi-step requests that combine knowledge retrieval, calculation, and catalog lookup. Always creates a plan first, then executes steps in order: knowledge search → calculation form (HITL) → catalog narrowing from results.",
    triggerPatterns: [
      "recommend",
      "which product",
      "best option",
      "help me choose",
      "i need a setup",
      "project",
      "workflow",
      "end to end",
    ],
    promptTemplate: readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../skills/calc-then-catalog/SKILL.md"), "utf8").replace(/^---[\s\S]*?---\s*/, ""),
    source: "manual",
  },
  {
    name: "clarification_first",
    description:
      "Handles ambiguous queries where intent is unclear. Asks exactly one targeted clarifying question before proceeding. Never assumes values.",
    triggerPatterns: ["not sure", "maybe", "something like", "i think", "can you help", "i need help"],
    promptTemplate: `You are the EarthTekniks assistant. The user's request is ambiguous. Ask exactly ONE short, targeted clarifying question to determine their intent. Do NOT call any tools yet. Do NOT make assumptions about missing values. Once the user answers, re-route to the appropriate skill (catalog_lookup, calculation_hitl, or chain_workflow).`,
    source: "manual",
  },
];

let inserted = 0;
let skipped = 0;

for (const skill of SKILLS) {
  const existing = await sql`SELECT id FROM "Skill" WHERE name = ${skill.name}`;
  if (existing.length > 0) {
    console.log(`  skip  ${skill.name} (already exists)`);
    skipped++;
    continue;
  }
  await sql`
    INSERT INTO "Skill" (id, "createdAt", "updatedAt", name, description, "triggerPatterns", "promptTemplate", "useCount", score, archived, source)
    VALUES (
      ${randomUUID()},
      NOW(),
      NOW(),
      ${skill.name},
      ${skill.description},
      ${JSON.stringify(skill.triggerPatterns)},
      ${skill.promptTemplate},
      0,
      50,
      false,
      ${skill.source}
    )
  `;
  console.log(`  insert ${skill.name}`);
  inserted++;
}

console.log(`\nDone: ${inserted} inserted, ${skipped} skipped.`);
await sql.end();
