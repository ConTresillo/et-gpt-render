import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { ChatbotError } from "@/lib/errors";
import { chat, message, user } from "@/lib/db/schema";
import { count, desc, eq, sql, ilike, asc } from "drizzle-orm";

type SearchMode = "auto" | "exact" | "bm25" | "fuzzy";

export async function GET(req: NextRequest) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");

    const { searchParams } = req.nextUrl;
    const page  = Math.max(1, Number(searchParams.get("page")  ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));
    const offset = (page - 1) * limit;
    const sort = searchParams.get("sort");
    const ordering = sort === "user" ? asc(user.email) : sort === "oldest" ? asc(chat.createdAt) : desc(chat.createdAt);
    const q    = (searchParams.get("q") ?? "").trim();
    const mode = (searchParams.get("mode") ?? "auto") as SearchMode;

    const baseSelect = {
      id:           chat.id,
      title:        chat.title,
      visibility:   chat.visibility,
      createdAt:    chat.createdAt,
      userId:       chat.userId,
      userEmail:    user.email,
      userName:     user.name,
      messageCount: sql<number>`count(${message.id})`,
    };

    if (!q) {
      const [rows, [{ total }]] = await Promise.all([
        adminDb
          .select(baseSelect)
          .from(chat)
          .leftJoin(user, eq(chat.userId, user.id))
          .leftJoin(message, eq(message.chatId, chat.id))
          .groupBy(chat.id, user.id)
          .orderBy(ordering, desc(chat.createdAt), chat.id)
          .limit(limit)
          .offset(offset),
        adminDb.select({ total: count() }).from(chat),
      ]);
      return NextResponse.json({ data: rows, total: total, page, limit, q: "" });
    }

    // Search mode — use raw SQL for scoring
    const safeQ = q.replace(/'/g, "''");

    // Build score expression depending on mode
    let scoreExpr: ReturnType<typeof sql>;
    let whereClause: ReturnType<typeof sql> | undefined;

    if (mode === "exact") {
      scoreExpr = sql<number>`1`;
      whereClause = sql`${chat.title} ILIKE ${"%" + q + "%"}`;
    } else if (mode === "bm25") {
      scoreExpr = sql<number>`ts_rank(to_tsvector('english', ${chat.title}), plainto_tsquery('english', ${q}))`;
      whereClause = sql`to_tsvector('english', ${chat.title}) @@ plainto_tsquery('english', ${q})`;
    } else if (mode === "fuzzy") {
      scoreExpr = sql<number>`similarity(${chat.title}, ${q})`;
      whereClause = sql`similarity(${chat.title}, ${q}) > 0.15`;
    } else {
      // auto: blend exact boost + BM25 + trigram similarity
      scoreExpr = sql<number>`(
        CASE WHEN ${chat.title} ILIKE ${"%" + q + "%"} THEN 3.0 ELSE 0.0 END
        + ts_rank(to_tsvector('english', ${chat.title}), plainto_tsquery('english', ${q}))
        + similarity(${chat.title}, ${q}) * 1.5
      )`;
      whereClause = sql`(
        ${chat.title} ILIKE ${"%" + q + "%"}
        OR to_tsvector('english', ${chat.title}) @@ plainto_tsquery('english', ${q})
        OR similarity(${chat.title}, ${q}) > 0.15
      )`;
    }

    const [rows, [{ total }]] = await Promise.all([
      adminDb
        .select({ ...baseSelect, score: scoreExpr })
        .from(chat)
        .leftJoin(user, eq(chat.userId, user.id))
        .leftJoin(message, eq(message.chatId, chat.id))
        .where(whereClause)
        .groupBy(chat.id, user.id)
        .orderBy(sort === "user" ? ordering : sql`${scoreExpr} DESC`, desc(chat.createdAt), chat.id)
        .limit(limit)
        .offset(offset),
      adminDb
        .select({ total: count() })
        .from(chat)
        .where(whereClause),
    ]);

    return NextResponse.json({ data: rows, total: total, page, limit, q, mode });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
