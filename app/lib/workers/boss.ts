import "server-only";
import { PgBoss } from "pg-boss";
import type { Job } from "pg-boss";
import { generateText } from "ai";
import { log } from "@/lib/logger";
import { adminDb } from "@/lib/db/admin";
import { insightReport, message, chat, systemConfig } from "@/lib/db/schema";
import { count, gte, sql, desc, eq, and } from "drizzle-orm";
import { getTitleModel } from "@/lib/ai/providers";
import { getMemoryProvider } from "@/lib/memory";
import { evolveSkills } from "./skills";
import { chatTitle } from "@/lib/chat-title";
import { getChatConfig } from "@/lib/chat-config";

let heartbeat: ReturnType<typeof setInterval> | undefined;
const runtime = globalThis as typeof globalThis & { etBoss?: { boss: PgBoss | null; startPromise: Promise<PgBoss> | null } };
const state = runtime.etBoss ??= { boss: null, startPromise: null };

// Fallback defaults if the DB config rows are missing.
const DEFAULT_THRESHOLD  = 50;   // messages in the sliding window
const DEFAULT_WINDOW_H   = 24;   // sliding window width (hours)
const DEFAULT_COOLDOWN_H = 12;   // min hours between auto-triggers

export async function getBoss(): Promise<PgBoss> {
  if (state.boss) return state.boss;
  if (state.startPromise) return state.startPromise;
  state.startPromise = (async () => {
    const b = new PgBoss({
      connectionString: process.env.POSTGRES_URL_ADMIN!,
      schema: "pgboss",
      max: 2,
      supervise: process.env.RUN_WORKERS !== "0",
      schedule: process.env.RUN_WORKERS !== "0",
    });
    b.on("error", (error) => log.workers.error({ err: error }, "pg-boss error"));
    await b.start();
    await b.createQueue("generate-insights");
    await b.createQueue("evolve-skills");
    await b.createQueue("name-chat");
    await b.createQueue("mem0-write");
    if (process.env.RUN_WORKERS !== "0") {
      await b.work("generate-insights", generateInsights);
      await b.work("evolve-skills", evolveSkills);
      await b.work("name-chat", nameChat);
      await b.work("mem0-write", writeMemory);
      const beat = async () => { await adminDb.insert(systemConfig).values({ key: "worker_heartbeat", value: JSON.stringify({ queues: ["generate-insights", "evolve-skills", "name-chat", "mem0-write"] }), label: "Worker heartbeat" }).onConflictDoUpdate({ target: systemConfig.key, set: { updatedAt: new Date() } }); };
      await beat();
      heartbeat = setInterval(() => { beat().catch(error => log.workers.error({ err: error }, "Worker heartbeat failed")); }, 15000);
      heartbeat.unref();
    }
    state.boss = b;
    log.workers.info("pg-boss started");
    return b;
  })().catch((error) => {
    state.startPromise = null;
    throw error;
  });
  return state.startPromise;
}

export async function scheduleSkillEvolution(windowDays = 30): Promise<void> {
  const b = await getBoss();
  await b.send("evolve-skills", { windowDays });
}

export async function stopBoss(): Promise<void> {
  if (heartbeat) clearInterval(heartbeat);
  if (state.boss) await state.boss.stop();
  state.boss = null;
  state.startPromise = null;
}

export async function scheduleInsights(windowDays = 30): Promise<string> {
  if (!process.env.POSTGRES_URL_ADMIN) throw new Error("POSTGRES_URL_ADMIN not set");
  const b = await getBoss();

  // Link to the most recent completed report for trend comparison.
  const [prev] = await adminDb
    .select({ id: insightReport.id })
    .from(insightReport)
    .where(sql`status = 'done'`)
    .orderBy(desc(insightReport.generatedAt))
    .limit(1);

  const [row] = await adminDb
    .insert(insightReport)
    .values({ windowDays, status: "pending", prevInsightId: prev?.id ?? null })
    .returning({ id: insightReport.id });

  await b.send("generate-insights", { reportId: row.id, windowDays });
  return row.id;
}

// Fire-and-forget — called after each new chat to potentially trigger auto-insights.
export async function maybeScheduleInsights(): Promise<void> {
  if (!process.env.POSTGRES_URL_ADMIN) return;
  try {
    const cfg = await getInsightConfig();

    // Cooldown: skip if a completed run exists within the cooldown window.
    const cooldownCutoff = new Date(Date.now() - cfg.cooldownHours * 3_600_000);
    const [recent] = await adminDb
      .select({ generatedAt: insightReport.generatedAt })
      .from(insightReport)
      .where(sql`status = 'done' AND "generatedAt" > ${cooldownCutoff.toISOString()}`)
      .orderBy(desc(insightReport.generatedAt))
      .limit(1);

    if (recent) return; // still within cooldown
    const [pending] = await adminDb.select({ id: insightReport.id }).from(insightReport)
      .where(sql`status IN ('pending', 'running') AND "createdAt" > ${cooldownCutoff.toISOString()}`).limit(1);
    if (pending) return;

    // Sliding window: count messages in the last N hours.
    const windowCutoff = new Date(Date.now() - cfg.windowHours * 3_600_000);
    const [{ total }] = await adminDb
      .select({ total: count() })
      .from(message)
      .where(and(gte(message.createdAt, windowCutoff), eq(message.role, "user")));

    if (total >= cfg.threshold) {
      await scheduleInsights(cfg.windowHours / 24);
      log.workers.info({ total, windowHours: cfg.windowHours, threshold: cfg.threshold }, "insight auto-triggered");
    }
  } catch (err) {
    log.workers.error({ err }, "maybeScheduleInsights failed");
  }
}

// Enqueue a long-term memory write for a verified user (off hot path).
export async function enqueueMemoryWrite(
  userId: string,
  chatId: string,
  messages: { role: string; content: string }[]
): Promise<void> {
  if (!process.env.POSTGRES_URL_ADMIN) return;
  const b = await getBoss();
  await b.send("mem0-write", { userId, chatId, messages }, { singletonKey: `mem0-${chatId}` });
}

// Called after a new chat's first message. Enqueues a title-generation job.
export async function enqueueChatNaming(chatId: string, firstMessage: string): Promise<void> {
  if (!process.env.POSTGRES_URL_ADMIN) return;
  const b = await getBoss();
  await b.send("name-chat", { chatId, firstMessage }, { singletonKey: chatId });
}

// ---------- config helpers ----------

export async function getInsightConfig() {
  const rows = await adminDb
    .select({ key: systemConfig.key, value: systemConfig.value })
    .from(systemConfig)
    .where(
      sql`key IN ('insight_message_threshold','insight_window_hours','insight_cooldown_hours')`
    );
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return {
    threshold:     map["insight_message_threshold"] ?? DEFAULT_THRESHOLD,
    windowHours:   map["insight_window_hours"]      ?? DEFAULT_WINDOW_H,
    cooldownHours: map["insight_cooldown_hours"]    ?? DEFAULT_COOLDOWN_H,
  };
}

// ---------- workers ----------

async function nameChat(jobs: Job<{ chatId: string; firstMessage: string }>[]) {
  const job = jobs[0];
  const { chatId, firstMessage } = job.data;

  try {
    let title: string;

    const fallback = () =>
      firstMessage.trim().split(/\s+/).slice(0, 6).join(" ") || "EarthTekniks conversation";

    if (process.env.LLM_PROVIDER === "mock") {
      title = fallback();
      if (title.length > 60) title = title.slice(0, 57) + "…";
    } else {
      try {
        const { text } = await generateText({
          model: getTitleModel((await getChatConfig()).model),
          system:
            "Generate a short title for an EarthTekniks industrial machine-vision and optics support chat (max 6 words). Preserve the customer's actual product and topic names. Do not reinterpret Garuda as an airline or security program. Output ONLY the title, without reasoning, quotes or punctuation at the end.",
          prompt: firstMessage.slice(0, 400),
          maxOutputTokens: 20,
          abortSignal: AbortSignal.timeout(15_000),
        });
        title =
          text.replace(/^[#*"\s]+/, "").replace(/["]+$/, "").trim() || fallback();
      } catch {
        title = fallback();
      }
    }

    title = chatTitle(title, firstMessage);
    await adminDb
      .update(chat)
      .set({ title })
      .where(sql`id = ${chatId}::uuid`);

    log.workers.info({ chatId, title }, "chat named");
  } catch (err) {
    log.workers.error({ err, chatId }, "name-chat failed");
  }
}

type MemWriteJob = { userId: string; chatId: string; messages: { role: string; content: string }[] };

async function writeMemory(jobs: Job<MemWriteJob>[]) {
  const { userId, chatId, messages } = jobs[0].data;
  try {
    const mem = getMemoryProvider();
    await mem.add(userId, chatId, messages);
    log.workers.info({ userId, chatId }, "memory written");
  } catch (err) {
    log.workers.error({ err, userId, chatId }, "mem0-write failed");
  }
}

async function generateInsights(jobs: Job<{ reportId: string; windowDays: number }>[]) {
  const { reportId, windowDays } = jobs[0].data;
  try {
    await adminDb
      .update(insightReport)
      .set({ status: "running" })
      .where(sql`id = ${reportId}::uuid`);

    // Load the linked previous report for trend comparison.
    const [thisReport] = await adminDb
      .select({ prevInsightId: insightReport.prevInsightId })
      .from(insightReport)
      .where(sql`id = ${reportId}::uuid`);

    type PrevReport = { topTopics: unknown; overview: string | null; headline: string | null };
    let prevReport: PrevReport | null = null;
    if (thisReport?.prevInsightId) {
      const [prev] = await adminDb
        .select({
          topTopics: insightReport.topTopics,
          overview:  insightReport.overview,
          headline:  insightReport.headline,
        })
        .from(insightReport)
        .where(eq(insightReport.id, thisReport.prevInsightId));
      prevReport = prev ?? null;
    }

    const since = new Date(Date.now() - windowDays * 86_400_000);
    const [{ total }] = await adminDb
      .select({ total: count() })
      .from(message)
      .where(and(gte(message.createdAt, since), eq(message.role, "user")));

    const config = await getChatConfig();
    const { topics: topTopics, sampledCount } = await getTopTopics(since, config);
    const trendSummary = buildTrendSummary(topTopics, prevReport);

    await adminDb
      .update(insightReport)
      .set({
        status: "done",
        headline: `${sampledCount} customer messages analysed over the last ${windowDays} days`,
        overview: `${buildOverview(sampledCount, topTopics, trendSummary)}${sampledCount < total ? ` Sampled the most recent ${sampledCount} of ${total} customer messages in the window.` : ""}`,
        topTopics,
        recommendations: buildRecommendations(topTopics, config),
        trendSummary,
        analyzedCount: sampledCount,
        generatedAt: new Date(),
      })
      .where(sql`id = ${reportId}::uuid`);
  } catch (err) {
    log.workers.error({ err, reportId }, "insight generation failed");
    await adminDb
      .update(insightReport)
      .set({ status: "error", errorMsg: String(err) })
      .where(sql`id = ${reportId}::uuid`);
  }
}

// ---------- analysis helpers ----------

async function getTopTopics(since: Date, config: Awaited<ReturnType<typeof getChatConfig>>) {
  const rows = await adminDb
    .select({ parts: message.parts })
    .from(message)
    .where(and(gte(message.createdAt, since), eq(message.role, "user")))
    .orderBy(desc(message.createdAt))
    .limit(config.insightSampleLimit);

  const freq: Record<string, number> = {};

  for (const row of rows) {
    const text = (row.parts as { type: string; text?: string }[])
      .filter((part) => part.type === "text").map((part) => part.text ?? "").join(" ").toLowerCase();
    for (const { label, keywords } of config.insightTopics) {
      if (keywords.some((k) => text.includes(k.toLowerCase()))) {
        freq[label] = (freq[label] ?? 0) + 1;
      }
    }
  }

  return { sampledCount: rows.length, topics: Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, cnt]) => ({ label, count: cnt })) };
}

function buildTrendSummary(
  current: { label: string; count: number }[],
  prev: { topTopics: unknown } | null
): string | null {
  if (!prev?.topTopics) return null;

  const prevTopics = prev.topTopics as { label: string; count: number }[];
  const prevMap = Object.fromEntries(prevTopics.map((t) => [t.label, t.count]));
  const parts: string[] = [];

  for (const { label, count: cnt } of current) {
    const p = prevMap[label];
    if (p === undefined) {
      parts.push(`"${label}" is a new topic this period`);
    } else {
      const delta = cnt - p;
      if (Math.abs(delta) >= 3) {
        parts.push(`"${label}" ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)}`);
      }
    }
  }

  for (const { label } of prevTopics) {
    if (!current.find((t) => t.label === label)) {
      parts.push(`"${label}" dropped out of top topics`);
    }
  }

  return parts.length > 0
    ? parts.join("; ")
    : "Topic distribution is stable compared to the previous report.";
}

function buildOverview(
  total: number,
  topics: { label: string; count: number }[],
  trend: string | null
) {
  const top = topics[0]?.label ?? "general queries";
  let text = `In the analysis window, ${total} messages were processed. The most common theme was "${top}".`;
  if (trend) text += ` Trend vs previous report: ${trend}`;
  return text;
}

function buildRecommendations(topics: { label: string; count: number }[], config: Awaited<ReturnType<typeof getChatConfig>>) {
  const labels = new Set(topics.map((topic) => topic.label));
  const recommendations = config.insightTopics.filter((topic) => labels.has(topic.label) && topic.recommendation).map((topic) => topic.recommendation!);
  return recommendations.length ? recommendations : ["Review the most common customer questions and the verified knowledge available to answer them."];
}
