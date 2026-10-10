import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { assertCan } from "@/lib/authz";
import { ChatbotError } from "@/lib/errors";
import { adminDb } from "@/lib/db/admin";
import { systemConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getBoss } from "@/lib/workers/boss";

export async function GET() {
  try {
    const s = await auth();
    assertCan(s?.user.type, "admin:access");
    const boss = await getBoss();
    const queues = await boss.getQueues();
    const [beat] = await adminDb.select().from(systemConfig).where(eq(systemConfig.key, "worker_heartbeat"));
    const bossRunning = Boolean(beat && Date.now() - beat.updatedAt.getTime() < 45000);
    return NextResponse.json({ status: bossRunning ? "running" : "offline", bossRunning, lastHeartbeat: beat?.updatedAt, workers: bossRunning ? JSON.parse(beat!.value).queues : [], queues: queues.filter(q => !q.name.startsWith("__")).map((q: any) => ({ ...q, created_on: q.createdOn, retry_limit: q.retryLimit, expire_seconds: q.expireInSeconds, is_partitioned: q.partition })) });
  } catch (e) {
    if (e instanceof ChatbotError) return e.toResponse();
    throw e;
  }
}
