import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { ChatbotError } from "@/lib/errors";
import { insightReport } from "@/lib/db/schema";
import { desc, count } from "drizzle-orm";
import { scheduleInsights, getInsightConfig } from "@/lib/workers/boss";

export async function GET(req: NextRequest) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const limit = 1;
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"));
    const offset = (page - 1) * limit;

    const [rows, [{ total }]] = await Promise.all([
      adminDb.select().from(insightReport).orderBy(desc(insightReport.createdAt)).limit(limit).offset(offset),
      adminDb.select({ total: count() }).from(insightReport),
    ]);

    return NextResponse.json({ data: rows, total: total, page, limit });
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
    const windowDays = Number(body.windowDays ?? (await getInsightConfig()).windowHours / 24);
    if (!Number.isFinite(windowDays) || windowDays <= 0 || windowDays > 365) return NextResponse.json({ error: "Window must be between 0 and 365 days" }, { status: 400 });
    const reportId = await scheduleInsights(windowDays);
    return NextResponse.json({ reportId }, { status: 202 });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
