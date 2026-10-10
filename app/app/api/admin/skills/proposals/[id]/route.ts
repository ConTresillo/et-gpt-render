import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { proposedSkill, skill } from "@/lib/db/schema";
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
    const { action } = body;

    if (action === "approve") {
      const [proposal] = await adminDb
        .select()
        .from(proposedSkill)
        .where(sql`id = ${id}::uuid`)
        .limit(1);

      if (!proposal) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (proposal.status !== "pending") {
        return NextResponse.json({ error: "proposal already reviewed" }, { status: 409 });
      }

      if (proposal.action === "improve" && proposal.targetSkillId) {
        await adminDb
          .update(skill)
          .set({
            name: proposal.name,
            description: proposal.description,
            triggerPatterns: proposal.triggerPatterns,
            promptTemplate: proposal.promptTemplate,
            updatedAt: new Date(),
          })
          .where(sql`id = ${proposal.targetSkillId}::uuid`);
      } else {
        await adminDb
          .insert(skill)
          .values({
            name: proposal.name,
            description: proposal.description,
            triggerPatterns: proposal.triggerPatterns as string[],
            promptTemplate: proposal.promptTemplate,
            source: "evolved",
          })
          .onConflictDoNothing();
      }

      await adminDb
        .update(proposedSkill)
        .set({
          status: "approved",
          reviewedBy: s?.user?.id ?? null,
          reviewedAt: new Date(),
          reviewNote: body.reviewNote ?? null,
        })
        .where(sql`id = ${id}::uuid`);

      return NextResponse.json({ ok: true });
    }

    if (action === "reject") {
      await adminDb
        .update(proposedSkill)
        .set({
          status: "rejected",
          reviewedBy: s?.user?.id ?? null,
          reviewedAt: new Date(),
          reviewNote: body.reviewNote ?? null,
        })
        .where(sql`id = ${id}::uuid`);
      return NextResponse.json({ ok: true });
    }

    if (action === "edit") {
      const allowed = ["name", "description", "triggerPatterns", "promptTemplate", "rationale"] as const;
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }
      await adminDb
        .update(proposedSkill)
        .set(updates as any)
        .where(sql`id = ${id}::uuid`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "action must be approve | reject | edit" }, { status: 400 });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
