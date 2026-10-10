import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { systemConfig } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { inArray, eq, sql } from "drizzle-orm";

const INSIGHT_KEYS = [
  "insight_message_threshold",
  "insight_window_hours",
  "insight_cooldown_hours",
] as const;

export async function GET() {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const rows = await adminDb
      .select()
      .from(systemConfig)
      .where(inArray(systemConfig.key, [...INSIGHT_KEYS]));

    const defaults = [50, 24, 12];
    return NextResponse.json({ data: INSIGHT_KEYS.map((key, i) => rows.find(row => row.key === key) ?? { key, value: String(defaults[i]), label: ["Customer message threshold", "Sliding window (hours)", "Cooldown (hours)"][i], description: null }) });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const body = (await req.json()) as Record<string, unknown>;
    const updates: { key: string; value: string }[] = [];

    for (const key of INSIGHT_KEYS) {
      if (key in body) {
        const v = Number(body[key]);
        if (Number.isFinite(v) && v > 0) updates.push({ key, value: String(v) });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    for (const { key, value } of updates) {
      await adminDb
        .insert(systemConfig).values({ key, value, label: key })
        .onConflictDoUpdate({ target: systemConfig.key, set: { value, updatedAt: new Date() } });
    }

    return NextResponse.json({ updated: updates.map((u) => u.key) });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
