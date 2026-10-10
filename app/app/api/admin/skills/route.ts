import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { skill } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { ChatbotError } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const skills = await adminDb
      .select()
      .from(skill)
      .orderBy(desc(skill.score), desc(skill.useCount));

    return NextResponse.json({ skills });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const body = await req.json();
    const { name, description, triggerPatterns, promptTemplate } = body;
    if (!name || !description || !promptTemplate) {
      return NextResponse.json({ error: "name, description, promptTemplate required" }, { status: 400 });
    }

    const [created] = await adminDb
      .insert(skill)
      .values({
        name: name.trim(),
        description: description.trim(),
        triggerPatterns: triggerPatterns ?? [],
        promptTemplate: promptTemplate.trim(),
        source: "manual",
      })
      .returning();

    return NextResponse.json({ skill: created }, { status: 201 });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
