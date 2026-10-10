import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { ChatbotError } from "@/lib/errors";
import { user, chat } from "@/lib/db/schema";
import { count, desc, eq, sql, and, or, ilike } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));
    const offset = (page - 1) * limit;
    const q = (searchParams.get("q") ?? "").trim();
    const type = searchParams.get("type");
    const where = and(q ? or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`)) : undefined, type === "registered" ? eq(user.isAnonymous, false) : type === "guest" ? eq(user.isAnonymous, true) : undefined);

    const [rows, [{ total }]] = await Promise.all([
      adminDb
        .select({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isAnonymous: user.isAnonymous,
          emailVerified: user.emailVerified,
          banned: user.banned,
          createdAt: user.createdAt,
          chatCount: sql<number>`count(${chat.id})`,
        })
        .from(user)
        .leftJoin(chat, eq(chat.userId, user.id))
        .where(where)
        .groupBy(user.id)
        .orderBy(desc(user.createdAt))
        .limit(limit)
        .offset(offset),
      adminDb.select({ total: count() }).from(user).where(where),
    ]);

    return NextResponse.json({ data: rows, total: total, page, limit });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
