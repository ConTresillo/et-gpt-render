import "server-only";
import pRetry from "p-retry";
import type { Job } from "pg-boss";
import { log } from "@/lib/logger";
import { adminDb } from "@/lib/db/admin";
import { message, skill, proposedSkill } from "@/lib/db/schema";
import { gte, eq, and, sql, desc } from "drizzle-orm";
import { classify, mockClassify } from "@/lib/router";

const MIN_QUERIES_FOR_PROPOSAL = 3;
const MAX_ACTIVE_SKILLS = 50;
const SIMILARITY_THRESHOLD = 0.7;
// Cap messages we classify per run so OpenJEV cost stays low
const MAX_MESSAGES_PER_RUN = 100;

export async function evolveSkills(jobs: Job<{ windowDays: number }>[]) {
  const { windowDays = 30 } = jobs[0].data;
  log.skills.info({ windowDays }, "starting skill evolution");

  const since = new Date(Date.now() - windowDays * 86_400_000);

  const rows = await adminDb
    .select({ id: message.id, parts: message.parts, createdAt: message.createdAt })
    .from(message)
    .where(and(gte(message.createdAt, since), eq(message.role, "user")))
    .orderBy(desc(message.createdAt))
    .limit(MAX_MESSAGES_PER_RUN);

  if (rows.length === 0) {
    log.skills.info({ windowDays }, "no messages in window, skipping");
    return;
  }

  const queries = rows
    .map((r) => ({ id: r.id, text: extractText(r.parts) }))
    .filter((q) => q.text.length > 8);

  // Use OpenJEV (or mock) to classify each query by intent — much better signal than keywords
  const clusters = await classifyByIntent(queries);
  log.skills.info({ clusters: Object.keys(clusters).length, queries: queries.length }, "classified intent clusters");

  const existingSkills = await adminDb
    .select({ name: skill.name, description: skill.description, triggerPatterns: skill.triggerPatterns })
    .from(skill)
    .where(eq(skill.archived, false));

  const significantClusters = Object.entries(clusters)
    .filter(([, items]) => items.length >= MIN_QUERIES_FOR_PROPOSAL)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8);

  if (significantClusters.length === 0) {
    log.skills.info("no significant clusters, skipping");
    return;
  }

  const [{ count: currentSkillCount }] = await adminDb
    .select({ count: sql<number>`count(*)::int` })
    .from(skill)
    .where(eq(skill.archived, false));

  for (const [intentLabel, clusterItems] of significantClusters) {
    const examples = clusterItems.slice(0, 10).map((q) => q.text);

    // Existing coverage does not imply the skill was actually loaded.
    const existingMatch = findSimilarSkill(intentLabel, examples, existingSkills);
    if (existingMatch && existingMatch.similarity >= SIMILARITY_THRESHOLD) {
      // useCount tracks actual loadSkill executions, not retrospective matches.
      log.skills.info({ skill: existingMatch.name }, "intent already covered by existing skill");
      continue;
    }

    // Skip if a pending proposal for this intent already exists
    const [dup] = await adminDb
      .select({ id: proposedSkill.id })
      .from(proposedSkill)
      .where(and(eq(proposedSkill.status, "pending"), sql`lower("name") = lower(${intentLabel})`))
      .limit(1);
    if (dup) {
      log.skills.info({ intent: intentLabel }, "pending proposal already exists, skipping");
      continue;
    }

    try {
      const proposal = await generateSkillProposal(
        intentLabel,
        examples,
        existingSkills,
        currentSkillCount ?? 0,
      );
      if (!proposal) continue;

      const capNote =
        (currentSkillCount ?? 0) >= MAX_ACTIVE_SKILLS
          ? `[NOTE: Skill cap (${MAX_ACTIVE_SKILLS}) reached — archive lower-scoring skills before approving.] `
          : "";

      await adminDb.insert(proposedSkill).values({
        action: "new",
        targetSkillId: null,
        name: proposal.name,
        description: proposal.description,
        triggerPatterns: proposal.triggerPatterns,
        promptTemplate: proposal.promptTemplate,
        rationale: capNote + proposal.rationale,
        sourceQueryIds: clusterItems.map((q) => q.id),
        exampleQueries: examples,
        status: "pending",
      });
      log.skills.info({ skill: proposal.name, queries: clusterItems.length }, "proposed new skill");
    } catch (err) {
      log.skills.error({ err, intent: intentLabel }, "failed to generate skill proposal");
    }
  }

  log.skills.info("skill evolution run complete");
}

/**
 * Classify each query via OpenJEV (falls back to mock when ROUTER_PROVIDER=mock).
 * Batches 10 at a time to stay within OpenJEV rate limits.
 */
async function classifyByIntent(queries: { id: string; text: string }[]) {
  const clusters: Record<string, typeof queries> = {};
  const useMock = process.env.ROUTER_PROVIDER === "mock" || !process.env.OPENJEV_API_KEY;

  const BATCH = 10;
  for (let i = 0; i < queries.length; i += BATCH) {
    const batch = queries.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (q) => {
        const decision = useMock ? mockClassify(q.text) : await classify(q.text, q.text);
        return { q, intent: decision?.intent ?? "company_info" };
      }),
    );
    for (const { q, intent } of results) {
      clusters[intent] = clusters[intent] ?? [];
      clusters[intent].push(q);
    }
  }
  return clusters;
}

async function generateSkillProposal(
  intentLabel: string,
  examples: string[],
  existing: { name: string; description: string }[],
  currentCount: number,
) {
  const useMock = process.env.LLM_PROVIDER === "mock";
  if (useMock) return mockProposal(intentLabel, examples);

  const baseURL =
    process.env.OPENAI_COMPATIBLE_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
  const model =
    process.env.OPENAI_COMPATIBLE_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b";

  if (!apiKey) {
    log.skills.warn("no OPENAI_COMPATIBLE_API_KEY, falling back to mock proposal");
    return mockProposal(intentLabel, examples);
  }

  const existingList = existing.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  const prompt = `You are an AI skill designer for EarthTekniks (ETPL Automation) — a machine-vision, optics, and industrial automation company.

Existing skills (do NOT duplicate):
${existingList || "(none yet)"}

Current active skill count: ${currentCount}/${MAX_ACTIVE_SKILLS}

OpenJEV classified ${examples.length} real user queries as intent: "${intentLabel}". Example queries:
${examples.map((e, i) => `${i + 1}. "${e}"`).join("\n")}

Design ONE focused skill that helps the chatbot handle this intent consistently and accurately for EarthTekniks customers.

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "name": "short_snake_case_name",
  "description": "one sentence — what query type this skill handles",
  "triggerPatterns": ["keyword1", "keyword2", "keyword3"],
  "promptTemplate": "System instruction for this skill. EarthTekniks domain. Max 3 sentences.",
  "rationale": "Why this skill is needed based on the query volume and pattern observed."
}`;

  const data = await pRetry(
    async () => {
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          temperature: 0.3,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`);
      return res.json() as Promise<{ choices?: { message?: { content?: string } }[] }>;
    },
    { retries: 2, minTimeout: 500, factor: 2, onFailedAttempt: (e: unknown) => log.skills.warn({ msg: (e as { message?: string })?.message }, "NVIDIA attempt failed") }
  ).catch((err) => { log.skills.error({ err }, "NVIDIA API error"); return null; });

  if (!data) return null;
  const text = data.choices?.[0]?.message?.content ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as {
      name: string;
      description: string;
      triggerPatterns: string[];
      promptTemplate: string;
      rationale: string;
    };
  } catch {
    return null;
  }
}

function mockProposal(intentLabel: string, examples: string[]) {
  return {
    name: intentLabel.replace(/[^a-z0-9]/gi, "_").toLowerCase(),
    description: `Handles user queries classified as ${intentLabel} intent.`,
    triggerPatterns: examples.slice(0, 3).map((e) => e.split(" ")[0].toLowerCase()),
    promptTemplate: `You are an EarthTekniks assistant. Answer ${intentLabel}-type queries accurately using available tools.`,
    rationale: `${examples.length} queries matched this intent pattern during the observation window.`,
  };
}

function extractText(parts: unknown): string {
  if (!parts) return "";
  const arr = Array.isArray(parts) ? parts : [];
  return arr
    .filter((p: unknown) => (p as { type?: string })?.type === "text")
    .map((p: unknown) => (p as { text?: string })?.text ?? "")
    .join(" ")
    .trim();
}

function findSimilarSkill(
  intentLabel: string,
  examples: string[],
  existing: { name: string; description: string; triggerPatterns: unknown }[],
) {
  for (const s of existing) {
    const patterns = Array.isArray(s.triggerPatterns) ? (s.triggerPatterns as string[]) : [];
    const nameMatch =
      s.name.toLowerCase().includes(intentLabel.toLowerCase()) ||
      intentLabel.toLowerCase().includes(s.name.toLowerCase().split("_")[0]);
    const patternMatch = patterns.some((p) => examples.some((e) => e.toLowerCase().includes(p.toLowerCase())));
    if (nameMatch || patternMatch) {
      return { name: s.name, similarity: nameMatch ? 0.9 : 0.75 };
    }
  }
  return null;
}
