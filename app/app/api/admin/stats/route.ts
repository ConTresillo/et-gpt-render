import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { ChatbotError } from "@/lib/errors";
import { user, chat, message, session } from "@/lib/db/schema";
import { count, gte, sql, eq } from "drizzle-orm";

export async function GET() {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const d30 = new Date(Date.now() - 30 * 86_400_000);
    const d7 = new Date(Date.now() - 7 * 86_400_000);
    const d30iso = d30.toISOString();
    const d7iso = d7.toISOString();

    const [[users], [guests], [chats], [messages], [activeUsers7d]] = await Promise.all([
      adminDb.select({ total: count() }).from(user).where(eq(user.isAnonymous, false)),
      adminDb.select({ total: count() }).from(user).where(eq(user.isAnonymous, true)),
      adminDb.select({ total: count() }).from(chat),
      adminDb.select({ total: count() }).from(message),
      adminDb
        .select({ total: sql<number>`count(distinct ${session.userId})` })
        .from(session)
        .where(gte(session.createdAt, d7)),
    ]);

    const [daily, dailyUsers] = await Promise.all([
      adminDb.execute(sql`
        SELECT date_trunc('day', "createdAt") as day, count(*) as messages
        FROM "Message_v2" WHERE "createdAt" >= ${d30iso}::timestamptz
        GROUP BY 1 ORDER BY 1
      `),
      adminDb.execute(sql`
        SELECT date_trunc('day', "createdAt") as day, count(*) as users
        FROM "User" WHERE "createdAt" >= ${d30iso}::timestamptz AND "isAnonymous" = false
        GROUP BY 1 ORDER BY 1
      `),
    ]);

    return NextResponse.json({
      totals: {
        users: users.total,
        guests: guests.total,
        chats: chats.total,
        messages: messages.total,
        activeUsers7d: Number(activeUsers7d.total),
      },
      daily: (daily as any[]).map((r) => ({ day: r.day, messages: Number(r.messages) })),
      dailyUsers: (dailyUsers as any[]).map((r) => ({ day: r.day, users: Number(r.users) })),
    });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
