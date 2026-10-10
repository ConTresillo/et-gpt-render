import "server-only";
import { log } from "@/lib/logger";
import { adminDb } from "@/lib/db/admin";
import { userMemory } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { redactTexts } from "@/lib/pii";
import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";

// ─── Contract ────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  content: string;
  createdAt: Date;
}

export interface MemoryProvider {
  /** Extract and persist memories from a completed conversation. */
  add(userId: string, chatId: string, messages: { role: string; content: string }[]): Promise<void>;
  /** Retrieve recent memories for context injection (returns plain-text snippets). */
  recall(userId: string, limit?: number): Promise<MemoryEntry[]>;
}

// ─── Null provider (default when MEMORY_PROVIDER is unset) ───────────────────

class NullMemoryProvider implements MemoryProvider {
  async add() {}
  async recall() {
    return [];
  }
}

// ─── pg-vector provider ───────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a memory extraction assistant.
Given a conversation between a user and a support assistant, extract 1–5 concise, factual statements about the user that would be useful context in a future conversation.
Focus on: preferences, domain knowledge, stated constraints, goals, or repeated questions.
Return ONLY a JSON array of strings — no explanation, no markdown. Example: ["Prefers FA lenses.", "Uses 1/2\" sensors."]
If there is nothing memorable about the user, return [].`;

class PgVectorMemoryProvider implements MemoryProvider {
  async add(
    userId: string,
    chatId: string,
    messages: { role: string; content: string }[]
  ): Promise<void> {
    // Only retain user turns for extraction (assistant turns are context, not stored facts).
    const userTexts = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    if (!userTexts.trim()) return;

    // Redact PII before sending to LLM for extraction.
    const [redacted] = await redactTexts([userTexts]);

    let facts: string[] = [];
    try {
      const { text } = await generateText({
        model: getLanguageModel(),
        system: EXTRACT_SYSTEM,
        prompt: `Conversation:\n${redacted}`,
        maxOutputTokens: 300,
      });
      facts = JSON.parse(text.trim());
      if (!Array.isArray(facts)) facts = [];
    } catch (err) {
      log.workers.warn({ err, userId }, "memory extraction parse failed — skipping");
      return;
    }

    if (facts.length === 0) return;

    // Persist each fact as its own row (simple; no pgvector embedding needed for recall).
    await adminDb.insert(userMemory).values(
      facts.map((content) => ({
        userId,
        chatId,
        content: String(content).slice(0, 500),
      }))
    );

    log.workers.info({ userId, chatId, count: facts.length }, "memories stored");
  }

  async recall(userId: string, limit = 10): Promise<MemoryEntry[]> {
    const rows = await adminDb
      .select({
        id: userMemory.id,
        content: userMemory.content,
        createdAt: userMemory.createdAt,
      })
      .from(userMemory)
      .where(eq(userMemory.userId, userId))
      .orderBy(desc(userMemory.createdAt))
      .limit(limit);

    return rows;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let _provider: MemoryProvider | null = null;

export function getMemoryProvider(): MemoryProvider {
  if (_provider) return _provider;
  const backend = process.env.MEMORY_PROVIDER ?? "null";
  _provider = backend === "pg" ? new PgVectorMemoryProvider() : new NullMemoryProvider();
  return _provider;
}

/** Format recalled memories as a system-prompt snippet (empty string if none). */
export function formatMemories(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((e) => `- ${e.content}`).join("\n");
  return `\n\n[User context from previous conversations]\n${lines}`;
}
