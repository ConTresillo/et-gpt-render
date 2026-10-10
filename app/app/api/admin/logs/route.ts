import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { ChatbotError } from "@/lib/errors";
import { appLog } from "@/lib/db/schema";
import { count, desc, eq, and, gte, lte, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const { searchParams } = req.nextUrl;
    const page   = Math.max(1, Number(searchParams.get("page")  ?? "1"));
    const limit  = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? "50")));
    const offset = (page - 1) * limit;
    const level  = searchParams.get("level") ?? "";
    const module = searchParams.get("module") ?? "";
    const from   = searchParams.get("from")  ?? "";
    const to     = searchParams.get("to")    ?? "";

    const conditions = [];
    if (level)  conditions.push(eq(appLog.level,  level));
    if (module) conditions.push(eq(appLog.module, module));
    if (from)   conditions.push(gte(appLog.createdAt, new Date(from)));
    if (to)     conditions.push(lte(appLog.createdAt, new Date(to)));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ total }], modules] = await Promise.all([
      adminDb
        .select()
        .from(appLog)
        .where(where)
        .orderBy(desc(appLog.createdAt))
        .limit(limit)
        .offset(offset),
      adminDb.select({ total: count() }).from(appLog).where(where),
      adminDb
        .selectDistinct({ module: appLog.module })
        .from(appLog)
        .orderBy(appLog.module),
    ]);

    return NextResponse.json({
      data: rows,
      total: total,
      page,
      limit,
      modules: modules.map((m) => m.module),
    });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
