import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { adminDb } from "@/lib/db/admin";
import { authServer } from "@/lib/auth";
import { ChatbotError } from "@/lib/errors";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");
    const { id } = await params;
    const [u] = await adminDb.select().from(user).where(eq(user.id, id as any));
    if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(u);
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");
    const { id } = await params;
    const body = await req.json();
    const { action } = body as { action: "ban" | "unban" | "set_role"; role?: string };

    if (action === "ban") {
      await authServer.api.banUser({ headers: req.headers, body: { userId: id, banReason: body.reason ?? "Admin action" } });
    } else if (action === "unban") {
      await authServer.api.unbanUser({ headers: req.headers, body: { userId: id } });
    } else if (action === "set_role" && ["user", "admin"].includes(body.role)) {
      if (id === s?.user.id && body.role !== "admin") return NextResponse.json({ error: "You cannot remove your own admin role" }, { status: 400 });
      await authServer.api.setRole({
        body: { userId: id, role: body.role },
        headers: req.headers,
      });
    } else {
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
