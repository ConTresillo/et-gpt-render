import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { skill } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { ChatbotError } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const { id } = await params;
    const body = await req.json();
    const allowed = ["name", "description", "triggerPatterns", "promptTemplate", "archived", "score"] as const;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const [updated] = await adminDb
      .update(skill)
      .set(updates as any)
      .where(sql`id = ${id}::uuid`)
      .returning();

    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ skill: updated });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const { id } = await params;
    const [updated] = await adminDb
      .update(skill)
      .set({ archived: true, updatedAt: new Date() })
      .where(sql`id = ${id}::uuid`)
      .returning({ id: skill.id });

    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
