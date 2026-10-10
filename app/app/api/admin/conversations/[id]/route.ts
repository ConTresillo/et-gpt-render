import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { ChatbotError } from "@/lib/errors";
import { chat, message, user } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { readWorkflow, deleteConversationState } from "@/lib/ai/workflow";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");
    const { id } = await params;

    const [chatRow] = await adminDb
      .select({ id: chat.id, title: chat.title, createdAt: chat.createdAt, visibility: chat.visibility, userId: chat.userId, userEmail: user.email })
      .from(chat)
      .leftJoin(user, eq(chat.userId, user.id))
      .where(eq(chat.id, id as any));

    if (!chatRow) return NextResponse.json({ error: "not found" }, { status: 404 });

    const messages = await adminDb
      .select({ id: message.id, role: message.role, parts: message.parts, createdAt: message.createdAt })
      .from(message)
      .where(eq(message.chatId, id as any))
      .orderBy(message.createdAt);

    return NextResponse.json({ chat: chatRow, messages, workflow: await readWorkflow(id) });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");
    const { id } = await params;
    const deleted = await adminDb.delete(chat).where(eq(chat.id, id as any)).returning({ userId: chat.userId });
    if (deleted[0]) await deleteConversationState(id, deleted[0].userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
