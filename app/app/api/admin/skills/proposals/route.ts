import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { proposedSkill } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { scheduleSkillEvolution } from "@/lib/workers/boss";
import { ChatbotError } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "pending";

    const proposals = await adminDb
      .select()
      .from(proposedSkill)
      .where(eq(proposedSkill.status, status))
      .orderBy(desc(proposedSkill.createdAt))
      .limit(100);

    return NextResponse.json({ proposals });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const body = await req.json().catch(() => ({}));
    const windowDays = Number(body.windowDays ?? 30);

    await scheduleSkillEvolution(windowDays);
    return NextResponse.json({ ok: true, message: "Evolution job queued" });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
